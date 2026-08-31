using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Web.Script.Serialization;

namespace InpaAi.Copilot
{
    internal sealed class OfflineProfileException : Exception
    {
        public OfflineProfileException(string code, string message)
            : base(message)
        {
            Code = code;
        }

        public string Code { get; private set; }
    }

    internal sealed class Ms43StaticSource
    {
        public string Id { get; set; }
        public string Path { get; set; }
        public string Sha256 { get; set; }
        public string Method { get; set; }
    }

    internal sealed class Ms43CatalogSource
    {
        public List<string> IpoOffsets { get; set; }
        public string PrgJobInventory { get; set; }
    }

    internal sealed class Ms43CatalogEntry
    {
        public string Group { get; set; }
        public string Sgbd { get; set; }
        public string Job { get; set; }
        public string ResultField { get; set; }
        public string NormalizedName { get; set; }
        public string DataType { get; set; }
        public string Unit { get; set; }
        public Ms43CatalogSource Source { get; set; }
        public List<string> VerificationStatus { get; set; }
        public bool ReadOnlyCandidate { get; set; }
        public string Notes { get; set; }
    }

    internal sealed class Ms43OfflineProfile
    {
        public string ProfileVersion { get; set; }
        public string ProfileState { get; set; }
        public bool RuntimeVerified { get; set; }
        public bool ExecutionEnabled { get; set; }
        public string Sgbd { get; set; }
        public string VehicleProfile { get; set; }
        public List<Ms43StaticSource> Sources { get; set; }
        public List<string> CandidateJobs { get; set; }
        public List<Ms43CatalogEntry> Catalog { get; set; }
    }

    internal static class Ms43OfflineProfileRepository
    {
        private const int MaximumProfileBytes = 1024 * 1024;

        public static Ms43OfflineProfile Load(string path)
        {
            if (String.IsNullOrWhiteSpace(path) || !File.Exists(path))
            {
                throw new OfflineProfileException(
                    "OFFLINE_PROFILE_NOT_FOUND",
                    "Das statische MS43-Offline-Profil wurde nicht gefunden.");
            }

            FileInfo file = new FileInfo(path);
            if (file.Length > MaximumProfileBytes)
            {
                throw new OfflineProfileException(
                    "OFFLINE_PROFILE_TOO_LARGE",
                    "Das statische MS43-Offline-Profil ist groesser als erlaubt.");
            }

            return Parse(File.ReadAllText(path, Encoding.UTF8));
        }

        public static Ms43OfflineProfile Parse(string json)
        {
            if (String.IsNullOrWhiteSpace(json))
            {
                throw Invalid("Das statische MS43-Offline-Profil ist leer.");
            }

            JavaScriptSerializer serializer = JsonObject.CreateSerializer();
            IDictionary<string, object> root;
            Ms43OfflineProfile profile;
            try
            {
                root = serializer.DeserializeObject(json) as IDictionary<string, object>;
                profile = serializer.Deserialize<Ms43OfflineProfile>(json);
            }
            catch (Exception exception)
            {
                throw new OfflineProfileException(
                    "OFFLINE_PROFILE_INVALID",
                    "Das statische MS43-Offline-Profil enthaelt ungueltiges JSON: " +
                    exception.Message);
            }

            if (root == null || profile == null)
            {
                throw Invalid("Das statische MS43-Offline-Profil ist kein JSON-Objekt.");
            }

            RequireBoolean(root, "runtimeVerified");
            RequireBoolean(root, "executionEnabled");
            RequireArray(root, "candidateJobs");
            RequireArray(root, "catalog");

            if (!String.Equals(
                profile.ProfileState,
                "OFFLINE_ONLY",
                StringComparison.Ordinal))
            {
                throw new OfflineProfileException(
                    "OFFLINE_PROFILE_STATE_REQUIRED",
                    "Nur Profile mit profileState OFFLINE_ONLY sind zulaessig.");
            }
            if (profile.RuntimeVerified)
            {
                throw new OfflineProfileException(
                    "OFFLINE_PROFILE_RUNTIME_FLAG",
                    "Ein OFFLINE_ONLY-Profil darf nicht als laufzeitverifiziert markiert sein.");
            }
            if (profile.ExecutionEnabled)
            {
                throw new OfflineProfileException(
                    "OFFLINE_PROFILE_EXECUTION_FLAG",
                    "Ein OFFLINE_ONLY-Profil darf Ausfuehrung nicht aktivieren.");
            }
            if (!String.Equals(profile.Sgbd, "MS430DS0", StringComparison.Ordinal))
            {
                throw Invalid("Das Offline-Profil muss das statisch belegte SGBD MS430DS0 nennen.");
            }
            if (String.IsNullOrWhiteSpace(profile.ProfileVersion) ||
                String.IsNullOrWhiteSpace(profile.VehicleProfile))
            {
                throw Invalid("Profilversion oder Fahrzeugprofil fehlt.");
            }
            if (profile.Sources == null || profile.Sources.Count < 2)
            {
                throw Invalid("Die statischen Quellen des Offline-Profils fehlen.");
            }
            if (profile.CandidateJobs == null || profile.CandidateJobs.Count == 0 ||
                profile.Catalog == null || profile.Catalog.Count == 0)
            {
                throw Invalid("Kandidatenjobs oder Datenkatalog fehlen.");
            }

            ISet<string> jobs = new HashSet<string>(StringComparer.Ordinal);
            foreach (string job in profile.CandidateJobs)
            {
                if (!IsPassiveCandidateJob(job) || !jobs.Add(job))
                {
                    throw Invalid(
                        "Ungueltiger oder doppelter Kandidatenjob im Offline-Profil: " +
                        (job ?? "<null>"));
                }
            }

            ISet<string> resultFields = new HashSet<string>(StringComparer.Ordinal);
            foreach (Ms43CatalogEntry entry in profile.Catalog)
            {
                ValidateEntry(entry, profile.Sgbd, jobs, resultFields);
            }

            OfflineExecutionPolicy.EnsureLocked(profile);
            return profile;
        }

        private static void ValidateEntry(
            Ms43CatalogEntry entry,
            string sgbd,
            ISet<string> jobs,
            ISet<string> resultFields)
        {
            if (entry == null ||
                String.IsNullOrWhiteSpace(entry.Group) ||
                String.IsNullOrWhiteSpace(entry.Job) ||
                String.IsNullOrWhiteSpace(entry.ResultField) ||
                String.IsNullOrWhiteSpace(entry.NormalizedName))
            {
                throw Invalid("Ein Eintrag im statischen Datenkatalog ist unvollstaendig.");
            }
            if (!String.Equals(entry.Sgbd, sgbd, StringComparison.Ordinal) ||
                !jobs.Contains(entry.Job))
            {
                throw Invalid(
                    "SGBD oder Kandidatenjob eines Katalogeintrags ist nicht belegt: " +
                    entry.ResultField);
            }
            if (!resultFields.Add(entry.ResultField))
            {
                throw Invalid("Doppeltes Ergebnisfeld im Offline-Profil: " + entry.ResultField);
            }
            if (!entry.ReadOnlyCandidate)
            {
                throw Invalid(
                    "Der Offline-Katalog darf nur explizite readOnlyCandidate-Eintraege enthalten.");
            }
            if (entry.Source == null ||
                entry.Source.IpoOffsets == null ||
                entry.Source.IpoOffsets.Count < 2 ||
                String.IsNullOrWhiteSpace(entry.Source.PrgJobInventory))
            {
                throw Invalid("Die statische Quelle fehlt fuer " + entry.ResultField + ".");
            }
            if (entry.VerificationStatus == null ||
                !entry.VerificationStatus.Contains("static-confirmed") ||
                !entry.VerificationStatus.Contains("runtime-unverified"))
            {
                throw Invalid(
                    "Der Verifikationsstatus fehlt fuer " + entry.ResultField + ".");
            }
            if (entry.DataType != null &&
                !String.Equals(entry.DataType, "numeric-display", StringComparison.Ordinal))
            {
                throw Invalid(
                    "Nicht belegter statischer Datentyp fuer " + entry.ResultField + ".");
            }
        }

        private static bool IsPassiveCandidateJob(string job)
        {
            return String.Equals(job, "IDENT", StringComparison.Ordinal) ||
                (!String.IsNullOrWhiteSpace(job) &&
                 job.StartsWith("STATUS_", StringComparison.Ordinal));
        }

        private static void RequireBoolean(IDictionary<string, object> root, string name)
        {
            object value;
            if (!root.TryGetValue(name, out value) || !(value is bool))
            {
                throw Invalid("Pflichtfeld '" + name + "' fehlt oder ist kein Boolean.");
            }
        }

        private static void RequireArray(IDictionary<string, object> root, string name)
        {
            object value;
            if (!root.TryGetValue(name, out value) ||
                (!(value is object[]) && !(value is System.Collections.ArrayList)))
            {
                throw Invalid("Pflichtfeld '" + name + "' fehlt oder ist kein Array.");
            }
        }

        private static OfflineProfileException Invalid(string message)
        {
            return new OfflineProfileException("OFFLINE_PROFILE_INVALID", message);
        }
    }

    internal static class OfflineExecutionPolicy
    {
        public static bool CanCreateBridgeRequest(Ms43OfflineProfile profile)
        {
            EnsureLocked(profile);
            return false;
        }

        public static void EnsureLocked(Ms43OfflineProfile profile)
        {
            if (profile == null ||
                !String.Equals(profile.ProfileState, "OFFLINE_ONLY", StringComparison.Ordinal) ||
                profile.RuntimeVerified ||
                profile.ExecutionEnabled)
            {
                throw new OfflineProfileException(
                    "OFFLINE_EXECUTION_BLOCKED",
                    "Das Profil ist nicht als unveraenderliches OFFLINE_ONLY-Profil gesperrt.");
            }
        }
    }
}
