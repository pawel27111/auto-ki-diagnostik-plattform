using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using InpaAi.Shared;

namespace InpaAi.Copilot
{
    internal enum DiscoveryProbeStatus
    {
        NotChecked,
        Reachable,
        NoResponse,
        UnsupportedProbe,
        SgbdError,
        TransportError,
        Cancelled
    }

    internal enum VehicleDiscoveryState
    {
        NotChecked,
        Running,
        Recognized,
        ConnectionUnconfirmed,
        Cancelled
    }

    internal sealed class DiscoveryBridgeError
    {
        public string Code { get; set; }
        public string Message { get; set; }
        public string Phase { get; set; }
    }

    internal sealed class DiscoveryBridgeResponse
    {
        public bool Success { get; set; }
        public string Command { get; set; }
        public string Ecu { get; set; }
        public string Job { get; set; }
        public long DurationMilliseconds { get; set; }
        public IList<IDictionary<string, object>> ResultSets { get; set; }
        public DiscoveryBridgeError Error { get; set; }
    }

    internal sealed class DiscoveryTransportException : Exception
    {
        public DiscoveryTransportException(string code, string message, string phase)
            : base(message)
        {
            Code = code;
            Phase = phase;
        }

        public string Code { get; private set; }
        public string Phase { get; private set; }
    }

    internal interface IDiscoveryProbeClient
    {
        Task<DiscoveryBridgeResponse> ProbeAsync(
            DiscoveryProbeDefinition definition,
            CancellationToken cancellationToken);
    }

    internal interface IDiscoveryProbeVerifier
    {
        bool IsSupported(DiscoveryProbeDefinition definition, out string error);
    }

    internal sealed class InstalledPrgVerifier : IDiscoveryProbeVerifier
    {
        private readonly string ecuPath;

        public InstalledPrgVerifier(string ecuPath)
        {
            this.ecuPath = ecuPath;
        }

        public bool IsSupported(DiscoveryProbeDefinition definition, out string error)
        {
            error = null;
            if (definition == null || String.IsNullOrWhiteSpace(ecuPath))
            {
                error = "Discovery-Definition oder ECU-Pfad fehlt.";
                return false;
            }

            string path = Path.Combine(ecuPath, definition.PrgFile);
            if (!File.Exists(path))
            {
                error = "Verifizierte PRG-Datei fehlt: " + definition.PrgFile;
                return false;
            }

            try
            {
                string actual;
                using (FileStream stream = File.OpenRead(path))
                using (SHA256 algorithm = SHA256.Create())
                {
                    actual = BitConverter.ToString(algorithm.ComputeHash(stream))
                        .Replace("-", String.Empty);
                }

                if (!String.Equals(
                    actual,
                    definition.PrgSha256,
                    StringComparison.Ordinal))
                {
                    error = "PRG-Hash weicht vom Offline-Beleg ab: " + definition.PrgFile;
                    return false;
                }
            }
            catch (Exception exception)
            {
                error = "PRG konnte nicht verifiziert werden: " + exception.Message;
                return false;
            }

            return true;
        }
    }

    internal sealed class DiscoveryProbeResult
    {
        public DiscoveryProbeResult(DiscoveryProbeDefinition definition)
        {
            Definition = definition;
            Status = DiscoveryProbeStatus.NotChecked;
            IdentificationFields =
                new Dictionary<string, object>(StringComparer.Ordinal);
        }

        public DiscoveryProbeDefinition Definition { get; private set; }
        public DiscoveryProbeStatus Status { get; set; }
        public IDictionary<string, object> IdentificationFields { get; set; }
        public string Identification { get; set; }
        public long DurationMilliseconds { get; set; }
        public int Attempts { get; set; }
        public string ErrorCode { get; set; }
        public string ErrorMessage { get; set; }
    }

    internal sealed class VehicleDiscoveryProfile
    {
        public VehicleDiscoveryProfile(
            VehicleDiscoveryState state,
            IList<DiscoveryProbeResult> results,
            string vin,
            DateTimeOffset completedAtUtc)
        {
            State = state;
            Results = results;
            Vin = vin;
            CompletedAtUtc = completedAtUtc;
        }

        public VehicleDiscoveryState State { get; private set; }
        public IList<DiscoveryProbeResult> Results { get; private set; }
        public string Vin { get; private set; }
        public DateTimeOffset CompletedAtUtc { get; private set; }

        public bool ConnectionConfirmed
        {
            get { return State == VehicleDiscoveryState.Recognized && ReachableCount > 0; }
        }

        public int ReachableCount
        {
            get { return Results.Count(item => item.Status == DiscoveryProbeStatus.Reachable); }
        }
    }

    internal sealed class VehicleDiscoverySessionStore
    {
        public VehicleDiscoveryProfile Current { get; private set; }

        public bool Store(VehicleDiscoveryProfile profile)
        {
            string previousVin = Current == null ? null : Current.Vin;
            return Store(profile, previousVin);
        }

        public bool Store(VehicleDiscoveryProfile profile, string previousVin)
        {
            if (profile == null)
            {
                throw new ArgumentNullException("profile");
            }

            bool vinChanged =
                !String.IsNullOrEmpty(previousVin) &&
                !String.IsNullOrEmpty(profile.Vin) &&
                !String.Equals(previousVin, profile.Vin, StringComparison.Ordinal);
            Current = profile;
            return vinChanged;
        }

        public VehicleDiscoveryProfile GetForVin(string vin)
        {
            if (Current == null || String.IsNullOrEmpty(vin) ||
                !String.Equals(Current.Vin, vin, StringComparison.Ordinal))
            {
                return null;
            }

            return Current;
        }

        public void Clear()
        {
            Current = null;
        }
    }

    internal sealed class VehicleDiscoveryScanner
    {
        private readonly IList<DiscoveryProbeDefinition> probes;
        private readonly IDiscoveryProbeClient client;
        private readonly IDiscoveryProbeVerifier verifier;

        public VehicleDiscoveryScanner(
            IList<DiscoveryProbeDefinition> probes,
            IDiscoveryProbeClient client,
            IDiscoveryProbeVerifier verifier)
        {
            if (probes == null || client == null || verifier == null)
            {
                throw new ArgumentNullException("Discovery scanner dependency is null.");
            }

            this.probes = probes;
            this.client = client;
            this.verifier = verifier;
        }

        public async Task<VehicleDiscoveryProfile> ScanAsync(
            IProgress<DiscoveryProbeResult> progress,
            CancellationToken cancellationToken)
        {
            IList<DiscoveryProbeResult> results = probes
                .Select(item => new DiscoveryProbeResult(item))
                .ToList();
            ISet<string> reachedFamilies = new HashSet<string>(StringComparer.Ordinal);

            for (int index = 0; index < results.Count; index++)
            {
                DiscoveryProbeResult result = results[index];
                if (cancellationToken.IsCancellationRequested)
                {
                    MarkRemainingCancelled(results, index);
                    return Complete(results, VehicleDiscoveryState.Cancelled);
                }

                if (reachedFamilies.Contains(result.Definition.FamilyKey))
                {
                    result.ErrorCode = "ALTERNATIVE_NOT_REQUIRED";
                    result.ErrorMessage =
                        "Eine verifizierte Alternative dieser Modulfamilie ist bereits erreichbar.";
                    Report(progress, result);
                    continue;
                }

                string supportError;
                if (!verifier.IsSupported(result.Definition, out supportError))
                {
                    result.Status = DiscoveryProbeStatus.UnsupportedProbe;
                    result.ErrorCode = "PROBE_NOT_STATICALLY_VERIFIED";
                    result.ErrorMessage = supportError;
                    Report(progress, result);
                    continue;
                }

                for (int attempt = 0;
                    attempt <= result.Definition.MaximumRetries;
                    attempt++)
                {
                    result.Attempts = attempt + 1;
                    try
                    {
                        DiscoveryBridgeResponse response = await client.ProbeAsync(
                            result.Definition,
                            cancellationToken).ConfigureAwait(false);
                        ApplyResponse(result, response);
                    }
                    catch (OperationCanceledException)
                    {
                        result.Status = DiscoveryProbeStatus.Cancelled;
                        result.ErrorCode = "DISCOVERY_CANCELLED";
                        result.ErrorMessage = "Erkennung wurde abgebrochen.";
                    }
                    catch (DiscoveryTransportException exception)
                    {
                        result.Status = DiscoveryProbeStatus.TransportError;
                        result.ErrorCode = exception.Code;
                        result.ErrorMessage = exception.Message;
                    }

                    if (result.Status != DiscoveryProbeStatus.NoResponse ||
                        attempt >= result.Definition.MaximumRetries)
                    {
                        break;
                    }
                }

                Report(progress, result);
                if (result.Status == DiscoveryProbeStatus.Reachable)
                {
                    reachedFamilies.Add(result.Definition.FamilyKey);
                }
                else if (result.Status == DiscoveryProbeStatus.Cancelled)
                {
                    MarkRemainingCancelled(results, index + 1);
                    return Complete(results, VehicleDiscoveryState.Cancelled);
                }
                else if (result.Status == DiscoveryProbeStatus.TransportError)
                {
                    MarkRemainingTransportError(
                        results,
                        index + 1,
                        result.ErrorCode,
                        result.ErrorMessage);
                    break;
                }
            }

            VehicleDiscoveryState state = results.Any(
                item => item.Status == DiscoveryProbeStatus.Reachable)
                ? VehicleDiscoveryState.Recognized
                : VehicleDiscoveryState.ConnectionUnconfirmed;
            return Complete(results, state);
        }

        private static void ApplyResponse(
            DiscoveryProbeResult result,
            DiscoveryBridgeResponse response)
        {
            if (response == null)
            {
                result.Status = DiscoveryProbeStatus.TransportError;
                result.ErrorCode = "BRIDGE_RESPONSE_MISSING";
                result.ErrorMessage = "Die Bridge lieferte keine Antwort.";
                return;
            }

            result.DurationMilliseconds += Math.Max(0, response.DurationMilliseconds);
            if (!response.Success)
            {
                ApplyFailure(result, response.Error);
                return;
            }

            IDictionary<string, object> fields = Flatten(response.ResultSets);
            object jobStatus;
            if (!fields.TryGetValue("JOB_STATUS", out jobStatus) ||
                !String.Equals(
                    Convert.ToString(jobStatus),
                    "OKAY",
                    StringComparison.OrdinalIgnoreCase))
            {
                result.Status = DiscoveryProbeStatus.SgbdError;
                result.ErrorCode = "IDENT_JOB_STATUS_INVALID";
                result.ErrorMessage = "Der Identifikationsjob meldete keinen JOB_STATUS=OKAY.";
                return;
            }

            bool hasIdentification = false;
            IDictionary<string, object> selected =
                new Dictionary<string, object>(StringComparer.Ordinal);
            foreach (string field in result.Definition.ExpectedResultFields)
            {
                object value;
                if (fields.TryGetValue(field, out value))
                {
                    selected[field] = value;
                    if (!String.Equals(field, "JOB_STATUS", StringComparison.Ordinal) &&
                        value != null &&
                        !String.IsNullOrWhiteSpace(Convert.ToString(value)))
                    {
                        hasIdentification = true;
                    }
                }
            }

            if (!hasIdentification)
            {
                result.Status = DiscoveryProbeStatus.UnsupportedProbe;
                result.ErrorCode = "EXPECTED_IDENT_FIELDS_MISSING";
                result.ErrorMessage =
                    "Die statisch erwarteten Identifikationsfelder fehlen in der Antwort.";
                return;
            }

            result.Status = DiscoveryProbeStatus.Reachable;
            result.IdentificationFields = selected;
            result.Identification = FormatIdentification(selected);
            result.ErrorCode = null;
            result.ErrorMessage = null;
        }

        private static void ApplyFailure(
            DiscoveryProbeResult result,
            DiscoveryBridgeError error)
        {
            string code = error == null ? "SGBD_ERROR" : error.Code ?? "SGBD_ERROR";
            string message = error == null ? "Unbekannter SGBD-Fehler." : error.Message;
            string phase = error == null ? null : error.Phase;
            result.ErrorCode = code;
            result.ErrorMessage = message;

            if (code == "EDIABAS_TIMEOUT" ||
                ContainsNoResponse(code) ||
                ContainsNoResponse(message))
            {
                result.Status = DiscoveryProbeStatus.NoResponse;
            }
            else if (code.StartsWith("DISCOVERY_PRG_", StringComparison.Ordinal) ||
                code == "OPERATION_NOT_ALLOWED" ||
                String.Equals(phase, "probe-validation", StringComparison.Ordinal))
            {
                result.Status = DiscoveryProbeStatus.UnsupportedProbe;
            }
            else if (code == "API32_NOT_FOUND" ||
                code == "DLL_SEARCH_PATH_FAILED" ||
                code == "EDIABAS_INIT_FAILED" ||
                code == "ECU_PATH_CONFIG_FAILED" ||
                String.Equals(phase, "native-loader", StringComparison.Ordinal) ||
                String.Equals(phase, "initialization", StringComparison.Ordinal) ||
                String.Equals(phase, "session-config", StringComparison.Ordinal))
            {
                result.Status = DiscoveryProbeStatus.TransportError;
            }
            else
            {
                result.Status = DiscoveryProbeStatus.SgbdError;
            }
        }

        private static bool ContainsNoResponse(string value)
        {
            if (String.IsNullOrEmpty(value))
            {
                return false;
            }

            return value.IndexOf("IFH-0009", StringComparison.OrdinalIgnoreCase) >= 0 ||
                value.IndexOf("IFH_0009", StringComparison.OrdinalIgnoreCase) >= 0 ||
                value.IndexOf("NO RESPONSE", StringComparison.OrdinalIgnoreCase) >= 0 ||
                value.IndexOf("NO_RESPONSE", StringComparison.OrdinalIgnoreCase) >= 0;
        }

        private static IDictionary<string, object> Flatten(
            IList<IDictionary<string, object>> resultSets)
        {
            IDictionary<string, object> fields =
                new Dictionary<string, object>(StringComparer.Ordinal);
            if (resultSets == null)
            {
                return fields;
            }

            foreach (IDictionary<string, object> resultSet in resultSets)
            {
                if (resultSet == null)
                {
                    continue;
                }

                foreach (KeyValuePair<string, object> field in resultSet)
                {
                    fields[field.Key] = field.Value;
                }
            }

            return fields;
        }

        private static string FormatIdentification(IDictionary<string, object> fields)
        {
            IList<string> parts = new List<string>();
            AddPart(parts, fields, "ID_BMW_NR", "BMW-Nr.");
            AddPart(parts, fields, "ID_HW_NR", "HW");
            AddPart(parts, fields, "ID_SW_NR", "SW");
            AddPart(parts, fields, "ID_SW_NR_FSV", "SW-FSV");
            AddPart(parts, fields, "ID_MOTOR", "Motor");
            AddPart(parts, fields, "ID_GERAETE_NAME", "Geraet");
            AddPart(parts, fields, "SER_NR_DOM", "Seriennr.");
            AddPart(parts, fields, "ID_SERIEN_NR", "Seriennr.");
            AddPart(parts, fields, "ID_VARIANTE", "Variante");
            return String.Join(" | ", parts.ToArray());
        }

        private static void AddPart(
            IList<string> parts,
            IDictionary<string, object> fields,
            string name,
            string label)
        {
            object value;
            if (fields.TryGetValue(name, out value) && value != null &&
                !String.IsNullOrWhiteSpace(Convert.ToString(value)))
            {
                parts.Add(label + " " + Convert.ToString(value));
            }
        }

        private static VehicleDiscoveryProfile Complete(
            IList<DiscoveryProbeResult> results,
            VehicleDiscoveryState state)
        {
            string vin = ResolveSafeVin(results);
            return new VehicleDiscoveryProfile(state, results, vin, DateTimeOffset.UtcNow);
        }

        private static string ResolveSafeVin(IList<DiscoveryProbeResult> results)
        {
            ISet<string> vins = new HashSet<string>(StringComparer.Ordinal);
            foreach (DiscoveryProbeResult result in results.Where(
                item => item.Status == DiscoveryProbeStatus.Reachable))
            {
                foreach (string field in result.Definition.VinResultFields)
                {
                    object value;
                    string normalized;
                    if (result.IdentificationFields.TryGetValue(field, out value) &&
                        TryNormalizeVin(Convert.ToString(value), out normalized))
                    {
                        vins.Add(normalized);
                    }
                }
            }

            return vins.Count == 1 ? vins.First() : null;
        }

        internal static bool TryNormalizeVin(string value, out string normalized)
        {
            normalized = String.IsNullOrWhiteSpace(value)
                ? null
                : value.Trim().ToUpperInvariant();
            if (normalized == null || normalized.Length != 17)
            {
                normalized = null;
                return false;
            }

            foreach (char character in normalized)
            {
                bool valid = (character >= '0' && character <= '9') ||
                    (character >= 'A' && character <= 'Z' &&
                     character != 'I' && character != 'O' && character != 'Q');
                if (!valid)
                {
                    normalized = null;
                    return false;
                }
            }

            return true;
        }

        private static void MarkRemainingCancelled(
            IList<DiscoveryProbeResult> results,
            int start)
        {
            for (int index = start; index < results.Count; index++)
            {
                results[index].Status = DiscoveryProbeStatus.Cancelled;
                results[index].ErrorCode = "DISCOVERY_CANCELLED";
                results[index].ErrorMessage = "Erkennung wurde abgebrochen.";
            }
        }

        private static void MarkRemainingTransportError(
            IList<DiscoveryProbeResult> results,
            int start,
            string code,
            string message)
        {
            for (int index = start; index < results.Count; index++)
            {
                results[index].Status = DiscoveryProbeStatus.TransportError;
                results[index].ErrorCode = code;
                results[index].ErrorMessage =
                    "Nicht ausgefuehrt, weil der Diagnose-Transport ausgefallen ist: " + message;
            }
        }

        private static void Report(
            IProgress<DiscoveryProbeResult> progress,
            DiscoveryProbeResult result)
        {
            if (progress != null)
            {
                progress.Report(result);
            }
        }
    }

    internal static class VehicleCapabilityContext
    {
        public static bool CanUseEcu(VehicleDiscoveryProfile profile, string sgbd)
        {
            return profile != null && profile.ConnectionConfirmed &&
                profile.Results.Any(
                    item => item.Status == DiscoveryProbeStatus.Reachable &&
                        String.Equals(item.Definition.Sgbd, sgbd, StringComparison.Ordinal));
        }

        public static IList<string> SpeechModuleKeys(VehicleDiscoveryProfile profile)
        {
            if (profile == null || !profile.ConnectionConfirmed)
            {
                return new List<string>();
            }

            return profile.Results
                .Where(item => item.Status == DiscoveryProbeStatus.Reachable)
                .Select(item => item.Definition.ModuleKey)
                .ToList();
        }

        public static IList<string> DiagnosticGroups(VehicleDiscoveryProfile profile)
        {
            ISet<string> groups = new SortedSet<string>(StringComparer.Ordinal);
            if (profile != null && profile.ConnectionConfirmed)
            {
                foreach (DiscoveryProbeResult result in profile.Results.Where(
                    item => item.Status == DiscoveryProbeStatus.Reachable))
                {
                    foreach (string group in result.Definition.DiagnosticGroups)
                    {
                        groups.Add(group);
                    }
                }
            }

            return groups.ToList();
        }

        public static string BuildAiContext(VehicleDiscoveryProfile profile)
        {
            if (profile == null || !profile.ConnectionConfirmed)
            {
                return "Dynamisches Fahrzeugprofil: nicht bestaetigt.";
            }

            StringBuilder builder = new StringBuilder();
            builder.AppendLine("Dynamisches Fahrzeugprofil (nur bestaetigte Steuergeraete):");
            if (!String.IsNullOrEmpty(profile.Vin))
            {
                builder.AppendLine("VIN: " + profile.Vin);
            }
            foreach (DiscoveryProbeResult result in profile.Results.Where(
                item => item.Status == DiscoveryProbeStatus.Reachable))
            {
                builder.Append("- ");
                builder.Append(result.Definition.DisplayName);
                builder.Append(" | SGBD=");
                builder.Append(result.Definition.Sgbd);
                if (!String.IsNullOrEmpty(result.Identification))
                {
                    builder.Append(" | ");
                    builder.Append(result.Identification);
                }
                builder.AppendLine();
            }

            return builder.ToString().TrimEnd();
        }
    }

    internal static class DiscoveryDryRunFormatter
    {
        public static string Format()
        {
            StringBuilder builder = new StringBuilder();
            builder.AppendLine("DISCOVERY DRY RUN - OFFLINE - NO BRIDGE OR EDIABAS JOB EXECUTED");
            builder.AppendLine("Manifest: " + E46DiscoveryManifest.ManifestVersion);
            builder.AppendLine("Vehicle: " + E46DiscoveryManifest.VehicleProfile);
            builder.AppendLine("Execution: sequential; no parallel EDIABAS jobs");
            builder.AppendLine("Generic ECU/job input: unavailable");
            builder.AppendLine();

            int index = 1;
            foreach (DiscoveryProbeDefinition probe in E46DiscoveryManifest.All)
            {
                builder.Append(index++);
                builder.Append(". ");
                builder.Append(probe.ModuleKey);
                builder.Append(" | ");
                builder.Append(probe.DisplayName);
                builder.Append(" | ");
                builder.Append(probe.Sgbd);
                builder.Append("/");
                builder.Append(probe.Job);
                builder.Append(" | PRG=");
                builder.Append(probe.PrgFile);
                builder.Append(" | address=");
                builder.Append(probe.DiagnosticAddress ?? "not statically verified");
                builder.Append(" | timeoutMs=");
                builder.Append(probe.TimeoutMilliseconds);
                builder.Append(" | maxRetries=");
                builder.Append(probe.MaximumRetries);
                builder.Append(" | command=");
                builder.Append(probe.Command);
                builder.Append(" | expected=");
                builder.Append(String.Join(",", probe.ExpectedResultFields.ToArray()));
                builder.AppendLine();
            }

            builder.AppendLine();
            builder.AppendLine("STOP: live discovery requires explicit user confirmation.");
            return builder.ToString();
        }
    }
}
