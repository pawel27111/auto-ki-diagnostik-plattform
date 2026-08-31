using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.Web.Script.Serialization;

namespace InpaAi.Copilot
{
    internal sealed class DiagnosticDataException : Exception
    {
        public DiagnosticDataException(string code, string message)
            : base(message)
        {
            Code = code;
        }

        public string Code { get; private set; }
    }

    internal sealed class DiagnosticDataValue
    {
        public string RawFieldName { get; set; }
        public string NormalizedName { get; set; }
        public object Value { get; set; }
        public string Unit { get; set; }
        public string Validity { get; set; }
        public string SourceJob { get; set; }
        public string MappingStatus { get; set; }
    }

    internal sealed class DiagnosticFixtureMetadata
    {
        public string Id { get; set; }
        public string Label { get; set; }
        public string Disclaimer { get; set; }
    }

    internal sealed class DiagnosticDataEnvelope
    {
        public string SchemaVersion { get; set; }
        public string Source { get; set; }
        public string DataMode { get; set; }
        public string VehicleProfile { get; set; }
        public string Ecu { get; set; }
        public string Job { get; set; }
        public string CapturedAtUtc { get; set; }
        public long DurationMs { get; set; }
        public List<DiagnosticDataValue> Values { get; set; }
        public List<string> MissingFields { get; set; }
        public List<string> Errors { get; set; }
        public bool RuntimeVerified { get; set; }
        public DiagnosticFixtureMetadata Fixture { get; set; }
    }

    internal sealed class Ms43FieldNormalizer
    {
        private readonly IDictionary<string, Ms43CatalogEntry> entries;

        public Ms43FieldNormalizer(Ms43OfflineProfile profile)
        {
            OfflineExecutionPolicy.EnsureLocked(profile);
            entries = new Dictionary<string, Ms43CatalogEntry>(StringComparer.Ordinal);
            foreach (Ms43CatalogEntry entry in profile.Catalog)
            {
                entries.Add(entry.ResultField, entry);
            }
        }

        public DiagnosticDataValue Normalize(DiagnosticDataValue input)
        {
            if (input == null || String.IsNullOrWhiteSpace(input.RawFieldName))
            {
                throw Invalid("Ein Messwert enthaelt keinen rawFieldName.");
            }

            Ms43CatalogEntry entry;
            if (!entries.TryGetValue(input.RawFieldName, out entry))
            {
                return new DiagnosticDataValue
                {
                    RawFieldName = input.RawFieldName,
                    NormalizedName = input.RawFieldName,
                    Value = input.Value,
                    Unit = input.Unit,
                    Validity = input.Validity,
                    SourceJob = input.SourceJob,
                    MappingStatus = "unmapped"
                };
            }

            if (!String.Equals(
                input.NormalizedName,
                entry.NormalizedName,
                StringComparison.Ordinal))
            {
                throw new DiagnosticDataException(
                    "NORMALIZED_NAME_MISMATCH",
                    "normalizedName passt nicht zum statisch belegten Feld " +
                    input.RawFieldName + ".");
            }
            if (!String.Equals(input.SourceJob, entry.Job, StringComparison.Ordinal))
            {
                throw new DiagnosticDataException(
                    "SOURCE_JOB_MISMATCH",
                    "sourceJob passt nicht zur statisch belegten IPO-Zuordnung fuer " +
                    input.RawFieldName + ".");
            }
            if (!String.Equals(input.Unit, entry.Unit, StringComparison.Ordinal))
            {
                throw new DiagnosticDataException(
                    "UNIT_MISMATCH",
                    "Die Einheit fuer " + input.RawFieldName +
                    " stimmt nicht mit der statisch belegten IPO-Einheit ueberein.");
            }
            if (String.Equals(entry.DataType, "numeric-display", StringComparison.Ordinal) &&
                input.Value != null &&
                !IsJsonNumber(input.Value))
            {
                throw new DiagnosticDataException(
                    "VALUE_TYPE_MISMATCH",
                    "Der Wert fuer " + input.RawFieldName +
                    " ist nicht numerisch, obwohl die IPO eine numerische Anzeige belegt.");
            }

            return new DiagnosticDataValue
            {
                RawFieldName = input.RawFieldName,
                NormalizedName = entry.NormalizedName,
                Value = input.Value,
                Unit = input.Unit,
                Validity = input.Validity,
                SourceJob = input.SourceJob,
                MappingStatus = "mapped"
            };
        }

        private static bool IsJsonNumber(object value)
        {
            return value is byte ||
                value is sbyte ||
                value is short ||
                value is ushort ||
                value is int ||
                value is uint ||
                value is long ||
                value is ulong ||
                value is float ||
                value is double ||
                value is decimal;
        }

        private static DiagnosticDataException Invalid(string message)
        {
            return new DiagnosticDataException("DATA_SCHEMA_INVALID", message);
        }
    }

    internal static class DiagnosticDataContract
    {
        public const string CurrentSchemaVersion = "1.0";
        public const int MaximumImportBytes = 1024 * 1024;

        public static DiagnosticDataEnvelope ParseAndNormalize(
            string json,
            Ms43OfflineProfile profile)
        {
            if (String.IsNullOrWhiteSpace(json))
            {
                throw Invalid("Das Diagnose-JSON ist leer.");
            }

            JavaScriptSerializer serializer = JsonObject.CreateSerializer();
            IDictionary<string, object> root;
            DiagnosticDataEnvelope envelope;
            try
            {
                root = serializer.DeserializeObject(json) as IDictionary<string, object>;
                envelope = serializer.Deserialize<DiagnosticDataEnvelope>(json);
            }
            catch (Exception exception)
            {
                throw new DiagnosticDataException(
                    "DATA_JSON_INVALID",
                    "Das Diagnose-JSON ist ungueltig: " + exception.Message);
            }

            if (root == null || envelope == null)
            {
                throw Invalid("Das Diagnose-JSON ist kein Objekt.");
            }

            foreach (string name in new[]
            {
                "schemaVersion",
                "source",
                "dataMode",
                "vehicleProfile",
                "ecu",
                "job",
                "capturedAtUtc",
                "durationMs",
                "values",
                "missingFields",
                "errors",
                "runtimeVerified"
            })
            {
                if (!root.ContainsKey(name))
                {
                    throw Invalid("Pflichtfeld '" + name + "' fehlt.");
                }
            }

            ValidateRawShape(root);
            OfflineExecutionPolicy.EnsureLocked(profile);
            ValidateEnvelope(envelope, profile);
            NormalizeValues(envelope, profile);
            return envelope;
        }

        public static string Serialize(DiagnosticDataEnvelope envelope)
        {
            if (envelope == null)
            {
                throw new ArgumentNullException("envelope");
            }
            return JsonObject.CreateSerializer().Serialize(envelope);
        }

        private static void ValidateEnvelope(
            DiagnosticDataEnvelope envelope,
            Ms43OfflineProfile profile)
        {
            if (!String.Equals(
                envelope.SchemaVersion,
                CurrentSchemaVersion,
                StringComparison.Ordinal))
            {
                throw new DiagnosticDataException(
                    "SCHEMA_VERSION_UNSUPPORTED",
                    "Nicht unterstuetzte schemaVersion.");
            }
            if (String.IsNullOrWhiteSpace(envelope.Source) ||
                String.IsNullOrWhiteSpace(envelope.VehicleProfile) ||
                String.IsNullOrWhiteSpace(envelope.Ecu))
            {
                throw Invalid("source, vehicleProfile oder ecu ist leer.");
            }
            if (!String.Equals(
                envelope.VehicleProfile,
                profile.VehicleProfile,
                StringComparison.Ordinal) ||
                !String.Equals(envelope.Ecu, profile.Sgbd, StringComparison.Ordinal))
            {
                throw new DiagnosticDataException(
                    "VEHICLE_PROFILE_MISMATCH",
                    "vehicleProfile oder ecu passt nicht zum Offline-Profil.");
            }
            if (envelope.DurationMs < 0)
            {
                throw Invalid("durationMs darf nicht negativ sein.");
            }

            DateTimeOffset capturedAt;
            if (!DateTimeOffset.TryParse(
                envelope.CapturedAtUtc,
                CultureInfo.InvariantCulture,
                DateTimeStyles.RoundtripKind,
                out capturedAt) ||
                capturedAt.Offset != TimeSpan.Zero)
            {
                throw Invalid("capturedAtUtc muss ein gueltiger UTC-Zeitpunkt sein.");
            }

            bool synthetic = String.Equals(
                envelope.DataMode,
                "SYNTHETIC",
                StringComparison.Ordinal);
            bool live = String.Equals(envelope.DataMode, "LIVE", StringComparison.Ordinal);
            if (!synthetic && !live)
            {
                throw Invalid("dataMode muss SYNTHETIC oder LIVE sein.");
            }
            if (synthetic && envelope.RuntimeVerified)
            {
                throw new DiagnosticDataException(
                    "SYNTHETIC_RUNTIME_FLAG",
                    "SYNTHETIC-Daten duerfen nicht als laufzeitverifiziert markiert sein.");
            }
            if (live && !envelope.RuntimeVerified)
            {
                throw new DiagnosticDataException(
                    "LIVE_RUNTIME_UNVERIFIED",
                    "LIVE-Daten ohne runtimeVerified=true werden abgewiesen.");
            }

            if (envelope.Job != null &&
                !profile.CandidateJobs.Contains(envelope.Job))
            {
                throw new DiagnosticDataException(
                    "JOB_NOT_IN_STATIC_PROFILE",
                    "Der angegebene Job ist nicht im statischen Offline-Profil belegt.");
            }
            if (envelope.Values == null ||
                envelope.MissingFields == null ||
                envelope.Errors == null)
            {
                throw Invalid("values, missingFields oder errors ist kein Array.");
            }

            ValidateStringList(envelope.MissingFields, "missingFields");
            ValidateStringList(envelope.Errors, "errors");
            foreach (DiagnosticDataValue value in envelope.Values)
            {
                ValidateValue(value, synthetic);
            }
        }

        private static void ValidateValue(DiagnosticDataValue value, bool synthetic)
        {
            if (value == null ||
                String.IsNullOrWhiteSpace(value.RawFieldName) ||
                String.IsNullOrWhiteSpace(value.NormalizedName) ||
                String.IsNullOrWhiteSpace(value.Validity) ||
                String.IsNullOrWhiteSpace(value.MappingStatus))
            {
                throw Invalid("Ein Messwert ist unvollstaendig.");
            }
            if (value.SourceJob == null)
            {
                throw Invalid("sourceJob fehlt bei " + value.RawFieldName + ".");
            }
            if (value.MappingStatus != "mapped" && value.MappingStatus != "unmapped")
            {
                throw Invalid("mappingStatus ist ungueltig bei " + value.RawFieldName + ".");
            }
            if (value.Validity != "valid" &&
                value.Validity != "synthetic" &&
                value.Validity != "not-present" &&
                value.Validity != "invalid")
            {
                throw Invalid("validity ist ungueltig bei " + value.RawFieldName + ".");
            }
            if (value.Value == null && value.Validity != "not-present")
            {
                throw Invalid(
                    "Ein null-Wert muss als not-present markiert sein: " +
                    value.RawFieldName + ".");
            }
            if (synthetic)
            {
                if (value.Validity != "synthetic" && value.Validity != "not-present")
                {
                    throw new DiagnosticDataException(
                        "DATA_MODE_VALIDITY_MISMATCH",
                        "SYNTHETIC-Werte muessen als synthetic oder not-present markiert sein.");
                }
            }
            else if (value.Validity == "synthetic")
            {
                throw new DiagnosticDataException(
                    "DATA_MODE_VALIDITY_MISMATCH",
                    "LIVE-Werte duerfen nicht als synthetic markiert sein.");
            }
        }

        private static void NormalizeValues(
            DiagnosticDataEnvelope envelope,
            Ms43OfflineProfile profile)
        {
            Ms43FieldNormalizer normalizer = new Ms43FieldNormalizer(profile);
            IList<DiagnosticDataValue> normalized = new List<DiagnosticDataValue>();
            ISet<string> rawNames = new HashSet<string>(StringComparer.Ordinal);
            foreach (DiagnosticDataValue value in envelope.Values)
            {
                if (!rawNames.Add(value.RawFieldName))
                {
                    throw Invalid("Doppeltes rawFieldName: " + value.RawFieldName + ".");
                }
                if (!profile.CandidateJobs.Contains(value.SourceJob))
                {
                    throw new DiagnosticDataException(
                        "SOURCE_JOB_NOT_IN_STATIC_PROFILE",
                        "sourceJob ist nicht im statischen Offline-Profil belegt: " +
                        value.SourceJob + ".");
                }

                DiagnosticDataValue normalizedValue = normalizer.Normalize(value);
                if (normalizedValue.MappingStatus == "mapped" &&
                    value.MappingStatus != "mapped")
                {
                    throw new DiagnosticDataException(
                        "MAPPING_STATUS_MISMATCH",
                        "Ein statisch belegtes Feld muss als mapped markiert sein.");
                }
                if (normalizedValue.MappingStatus == "unmapped" &&
                    value.MappingStatus != "unmapped")
                {
                    throw new DiagnosticDataException(
                        "MAPPING_STATUS_MISMATCH",
                        "Ein unbekanntes Feld muss als unmapped markiert sein.");
                }

                normalized.Add(normalizedValue);
            }
            envelope.Values = new List<DiagnosticDataValue>(normalized);
        }

        private static void ValidateRawShape(IDictionary<string, object> root)
        {
            RejectUnknownKeys(
                root,
                new[]
                {
                    "schemaVersion",
                    "source",
                    "dataMode",
                    "vehicleProfile",
                    "ecu",
                    "job",
                    "capturedAtUtc",
                    "durationMs",
                    "values",
                    "missingFields",
                    "errors",
                    "runtimeVerified",
                    "fixture"
                },
                "Diagnoseobjekt");

            object runtimeVerified;
            if (!root.TryGetValue("runtimeVerified", out runtimeVerified) ||
                !(runtimeVerified is bool))
            {
                throw Invalid("runtimeVerified muss ein Boolean sein.");
            }

            object duration;
            if (!root.TryGetValue("durationMs", out duration) || !IsIntegralNumber(duration))
            {
                throw Invalid("durationMs muss eine Ganzzahl sein.");
            }

            object job;
            if (!root.TryGetValue("job", out job) ||
                (job != null && !(job is string)))
            {
                throw Invalid("job muss eine Zeichenkette oder null sein.");
            }

            foreach (object item in RequireRawArray(root, "values"))
            {
                IDictionary<string, object> value = item as IDictionary<string, object>;
                if (value == null)
                {
                    throw Invalid("values darf nur JSON-Objekte enthalten.");
                }

                string[] required =
                {
                    "rawFieldName",
                    "normalizedName",
                    "value",
                    "unit",
                    "validity",
                    "sourceJob",
                    "mappingStatus"
                };
                RejectUnknownKeys(value, required, "Messwert");
                foreach (string name in required)
                {
                    if (!value.ContainsKey(name))
                    {
                        throw Invalid("Messwert-Pflichtfeld '" + name + "' fehlt.");
                    }
                }

                object unit = value["unit"];
                if (unit != null && !(unit is string))
                {
                    throw Invalid("unit muss eine Zeichenkette oder null sein.");
                }
                object scalar = value["value"];
                if (scalar != null &&
                    !(scalar is string) &&
                    !(scalar is bool) &&
                    !IsJsonNumber(scalar))
                {
                    throw Invalid("value muss ein JSON-Skalar oder null sein.");
                }
            }

            RequireRawArray(root, "missingFields");
            RequireRawArray(root, "errors");

            object fixtureValue;
            if (root.TryGetValue("fixture", out fixtureValue))
            {
                IDictionary<string, object> fixture =
                    fixtureValue as IDictionary<string, object>;
                if (fixture == null)
                {
                    throw Invalid("fixture muss ein JSON-Objekt sein.");
                }
                string[] fixtureKeys = { "id", "label", "disclaimer" };
                RejectUnknownKeys(fixture, fixtureKeys, "fixture");
                foreach (string name in fixtureKeys)
                {
                    object value;
                    if (!fixture.TryGetValue(name, out value) ||
                        String.IsNullOrWhiteSpace(value as string))
                    {
                        throw Invalid("fixture-Pflichtfeld '" + name + "' fehlt.");
                    }
                }
            }
        }

        private static IList<object> RequireRawArray(
            IDictionary<string, object> root,
            string name)
        {
            object value;
            if (!root.TryGetValue(name, out value))
            {
                throw Invalid("Pflichtfeld '" + name + "' fehlt.");
            }

            object[] objectArray = value as object[];
            if (objectArray != null)
            {
                return new List<object>(objectArray);
            }
            ArrayList arrayList = value as ArrayList;
            if (arrayList != null)
            {
                return arrayList.ToArray();
            }
            throw Invalid(name + " muss ein JSON-Array sein.");
        }

        private static void RejectUnknownKeys(
            IDictionary<string, object> source,
            IEnumerable<string> allowedKeys,
            string context)
        {
            ISet<string> allowed = new HashSet<string>(
                allowedKeys,
                StringComparer.Ordinal);
            foreach (string key in source.Keys)
            {
                if (!allowed.Contains(key))
                {
                    throw Invalid(
                        context + " enthaelt das unbekannte Feld '" + key + "'.");
                }
            }
        }

        private static bool IsIntegralNumber(object value)
        {
            return value is byte ||
                value is sbyte ||
                value is short ||
                value is ushort ||
                value is int ||
                value is uint ||
                value is long ||
                value is ulong;
        }

        private static bool IsJsonNumber(object value)
        {
            return IsIntegralNumber(value) ||
                value is float ||
                value is double ||
                value is decimal;
        }

        private static void ValidateStringList(IList<string> values, string name)
        {
            ISet<string> unique = new HashSet<string>(StringComparer.Ordinal);
            foreach (string value in values)
            {
                if (String.IsNullOrWhiteSpace(value) || !unique.Add(value))
                {
                    throw Invalid(name + " enthaelt einen leeren oder doppelten Eintrag.");
                }
            }
        }

        private static DiagnosticDataException Invalid(string message)
        {
            return new DiagnosticDataException("DATA_SCHEMA_INVALID", message);
        }
    }
}
