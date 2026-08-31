using System;
using System.Collections.Generic;
using System.Text.RegularExpressions;

namespace InpaAi.Copilot
{
    internal static class SecretRedactor
    {
        private static readonly Regex BearerPattern = new Regex(
            @"(?i)\bBearer\s+[^\s,;]+",
            RegexOptions.Compiled | RegexOptions.CultureInvariant);

        public static string Redact(string value, IEnumerable<string> knownSecrets)
        {
            if (value == null)
            {
                return null;
            }

            string result = BearerPattern.Replace(value, "Bearer [REDACTED]");
            if (knownSecrets != null)
            {
                foreach (string secret in knownSecrets)
                {
                    if (!String.IsNullOrEmpty(secret))
                    {
                        result = result.Replace(secret, "[REDACTED]");
                    }
                }
            }

            return result;
        }

        public static IEnumerable<string> CurrentRuntimeSecrets()
        {
            return new[]
            {
                Environment.GetEnvironmentVariable("OLLAMA_API_KEY"),
                Environment.GetEnvironmentVariable("LM_STUDIO_API_TOKEN")
            };
        }
    }
}
