using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Web.Script.Serialization;

namespace InpaAi.Copilot
{
    internal sealed class CopilotSettings
    {
        public CopilotSettings()
        {
            Provider = ProviderKind.OllamaLocalOrTailscale.ToString();
            BaseUrl = "http://127.0.0.1:11434";
            ModelId = String.Empty;
            TimeoutSeconds = 30;
        }

        public string Provider { get; set; }
        public string BaseUrl { get; set; }
        public string ModelId { get; set; }
        public int TimeoutSeconds { get; set; }
    }

    internal sealed class SafeSettingsStore
    {
        private readonly string path;
        private readonly JavaScriptSerializer serializer;

        public SafeSettingsStore(string path)
        {
            this.path = path;
            serializer = JsonObject.CreateSerializer();
        }

        public CopilotSettings Load()
        {
            if (!File.Exists(path))
            {
                return new CopilotSettings();
            }

            try
            {
                CopilotSettings settings =
                    serializer.Deserialize<CopilotSettings>(File.ReadAllText(path, Encoding.UTF8));
                return Validate(settings);
            }
            catch
            {
                return new CopilotSettings();
            }
        }

        public void Save(CopilotSettings settings)
        {
            CopilotSettings safe = Validate(settings);
            string json = serializer.Serialize(safe);
            EnsureNoSecretFields(json);

            string directory = Path.GetDirectoryName(path);
            if (!String.IsNullOrEmpty(directory))
            {
                Directory.CreateDirectory(directory);
            }

            File.WriteAllText(path, json, new UTF8Encoding(false));
        }

        internal static void EnsureNoSecretFields(string json)
        {
            string lower = (json ?? String.Empty).ToLowerInvariant();
            string[] forbidden =
            {
                "api_key",
                "apikey",
                "token",
                "authorization",
                "bearer",
                "prompt",
                "response",
                "vehicle",
                "fahrzeug"
            };

            foreach (string word in forbidden)
            {
                if (lower.Contains(word))
                {
                    throw new InvalidOperationException(
                        "Unsafe field or value detected in settings serialization.");
                }
            }
        }

        private static CopilotSettings Validate(CopilotSettings settings)
        {
            if (settings == null)
            {
                return new CopilotSettings();
            }

            ProviderKind parsedProvider;
            if (!Enum.TryParse(settings.Provider, false, out parsedProvider))
            {
                parsedProvider = ProviderKind.OllamaLocalOrTailscale;
            }

            int timeout = settings.TimeoutSeconds;
            if (timeout < 1 || timeout > 300)
            {
                timeout = 30;
            }

            return new CopilotSettings
            {
                Provider = parsedProvider.ToString(),
                BaseUrl = String.IsNullOrWhiteSpace(settings.BaseUrl)
                    ? "http://127.0.0.1:11434"
                    : settings.BaseUrl,
                ModelId = settings.ModelId ?? String.Empty,
                TimeoutSeconds = timeout
            };
        }
    }
}
