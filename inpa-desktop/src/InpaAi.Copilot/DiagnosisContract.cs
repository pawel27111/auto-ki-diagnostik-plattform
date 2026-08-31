using System;
using System.Collections.Generic;
using System.Text;

namespace InpaAi.Copilot
{
    internal sealed class DiagnosisResponse
    {
        public string Summary { get; set; }
        public string Severity { get; set; }
        public IList<string> Observations { get; set; }
        public IList<string> PossibleCauses { get; set; }
        public IList<string> NextChecks { get; set; }
        public IList<string> Limitations { get; set; }
    }

    internal sealed class DiagnosisParseResult
    {
        public bool Success { get; set; }
        public DiagnosisResponse Diagnosis { get; set; }
        public string Error { get; set; }
        public string RawResponse { get; set; }
    }

    internal static class DiagnosisContract
    {
        public const string SystemPrompt =
            "Du bist ein ausschliesslich lesender Diagnoseassistent. " +
            "Verwende nur die im Benutzertext uebergebenen Messwerte. " +
            "Behandle jeden fehlenden Wert ausdruecklich als 'nicht vorhanden'. " +
            "Erfinde keine Sensorwerte, Fehlercodes, Grenzwerte oder Fahrzeugzustaende. " +
            "Trenne Beobachtungen, moegliche Ursachen und naechste Pruefschritte. " +
            "Kennzeichne Unsicherheit. Schlage niemals Schreib-, Loesch-, Reset-, " +
            "Codier- oder Aktorbefehle vor. Sage bei SYNTHETIC-Daten deutlich, dass " +
            "kuenstliche Testdaten keine echte Fahrzeugdiagnose sind. " +
            "Antworte ausschliesslich als einzelnes JSON-Objekt mit genau diesen " +
            "Pflichtfeldern: summary (string), severity (info|warning|critical|unknown), " +
            "observations (string[]), possibleCauses (string[]), nextChecks (string[]), " +
            "limitations (string[]).";

        private static readonly ISet<string> Severities =
            new HashSet<string>(StringComparer.Ordinal)
            {
                "info",
                "warning",
                "critical",
                "unknown"
            };

        public static DiagnosisParseResult Parse(string rawResponse)
        {
            DiagnosisParseResult failure = new DiagnosisParseResult
            {
                Success = false,
                Diagnosis = null,
                Error = null,
                RawResponse = rawResponse ?? String.Empty
            };

            try
            {
                IDictionary<string, object> root =
                    JsonObject.ParseObject(rawResponse, "diagnosis-parse");
                string summary = JsonObject.RequireString(root, "summary", "diagnosis-parse");
                string severity = JsonObject.RequireString(root, "severity", "diagnosis-parse");
                if (!Severities.Contains(severity))
                {
                    throw new ProviderException(
                        "DIAGNOSIS_SCHEMA_INVALID",
                        "Feld 'severity' enthaelt einen ungueltigen Wert.",
                        "diagnosis-parse");
                }

                DiagnosisResponse response = new DiagnosisResponse
                {
                    Summary = summary,
                    Severity = severity,
                    Observations = RequireStringArray(root, "observations"),
                    PossibleCauses = RequireStringArray(root, "possibleCauses"),
                    NextChecks = RequireStringArray(root, "nextChecks"),
                    Limitations = RequireStringArray(root, "limitations")
                };

                return new DiagnosisParseResult
                {
                    Success = true,
                    Diagnosis = response,
                    Error = null,
                    RawResponse = rawResponse
                };
            }
            catch (Exception exception)
            {
                failure.Error = exception.Message;
                return failure;
            }
        }

        public static string Format(DiagnosisResponse diagnosis)
        {
            StringBuilder builder = new StringBuilder();
            builder.AppendLine("Zusammenfassung");
            builder.AppendLine(diagnosis.Summary);
            builder.AppendLine();
            builder.AppendLine("Schweregrad: " + diagnosis.Severity);
            AppendSection(builder, "Beobachtungen", diagnosis.Observations);
            AppendSection(builder, "Moegliche Ursachen", diagnosis.PossibleCauses);
            AppendSection(builder, "Naechste Pruefschritte", diagnosis.NextChecks);
            AppendSection(builder, "Einschraenkungen", diagnosis.Limitations);
            return builder.ToString().TrimEnd();
        }

        private static IList<string> RequireStringArray(
            IDictionary<string, object> root,
            string name)
        {
            IList<object> values = JsonObject.RequireArray(root, name, "diagnosis-parse");
            IList<string> result = new List<string>();
            foreach (object value in values)
            {
                string text = value as string;
                if (String.IsNullOrWhiteSpace(text))
                {
                    throw new ProviderException(
                        "DIAGNOSIS_SCHEMA_INVALID",
                        "Feld '" + name + "' muss ausschliesslich nicht leere Texte enthalten.",
                        "diagnosis-parse");
                }

                result.Add(text);
            }

            return result;
        }

        private static void AppendSection(
            StringBuilder builder,
            string heading,
            IList<string> values)
        {
            builder.AppendLine();
            builder.AppendLine(heading);
            foreach (string value in values)
            {
                builder.AppendLine("- " + value);
            }
        }
    }
}
