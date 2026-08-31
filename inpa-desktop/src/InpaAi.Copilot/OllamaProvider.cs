using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Threading;
using System.Threading.Tasks;

namespace InpaAi.Copilot
{
    internal sealed class OllamaProvider : HttpProviderBase
    {
        public OllamaProvider(ProviderOptions options, HttpMessageHandler handler)
            : base(options, handler)
        {
            if (options.Kind != ProviderKind.OllamaLocalOrTailscale &&
                options.Kind != ProviderKind.OllamaCloud)
            {
                throw new ArgumentException("Invalid provider kind for Ollama.", "options");
            }
        }

        public OllamaProvider(ProviderOptions options)
            : this(options, null)
        {
        }

        protected override async Task<IList<string>> FetchModelsAsync(
            CancellationToken cancellationToken)
        {
            string json = await SendAsync(
                HttpMethod.Get,
                "api/tags",
                null,
                "model-list",
                cancellationToken).ConfigureAwait(false);
            return ParseModels(json);
        }

        public override async Task<string> ChatAsync(
            string modelId,
            IList<ChatMessage> messages,
            CancellationToken cancellationToken)
        {
            ValidateChatInput(modelId, messages);

            IList<object> serializedMessages = new List<object>();
            foreach (ChatMessage message in messages)
            {
                serializedMessages.Add(new Dictionary<string, object>
                {
                    { "role", message.Role },
                    { "content", message.Content }
                });
            }

            IDictionary<string, object> body = new Dictionary<string, object>
            {
                { "model", modelId },
                { "messages", serializedMessages },
                { "stream", false }
            };

            string json = await SendAsync(
                HttpMethod.Post,
                "api/chat",
                body,
                "chat",
                cancellationToken).ConfigureAwait(false);
            return ParseChat(json);
        }

        protected override void ApplyAuthorization(HttpRequestMessage request)
        {
            if (Kind != ProviderKind.OllamaCloud)
            {
                return;
            }

            string apiKey = Environment.GetEnvironmentVariable("OLLAMA_API_KEY");
            if (String.IsNullOrWhiteSpace(apiKey))
            {
                throw new ProviderException(
                    "OLLAMA_API_KEY_MISSING",
                    "OLLAMA_API_KEY ist fuer Ollama Cloud nicht vorhanden.",
                    "authentication");
            }

            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);
        }

        internal static IList<string> ParseModels(string json)
        {
            IDictionary<string, object> root = JsonObject.ParseObject(json, "model-list");
            IList<object> models = JsonObject.RequireArray(root, "models", "model-list");
            IList<string> result = new List<string>();
            foreach (object item in models)
            {
                IDictionary<string, object> model = item as IDictionary<string, object>;
                if (model == null)
                {
                    throw new ProviderException(
                        "PROVIDER_JSON_INVALID",
                        "Ein Eintrag in 'models' ist kein JSON-Objekt.",
                        "model-list");
                }

                result.Add(JsonObject.RequireString(model, "name", "model-list"));
            }

            return result;
        }

        internal static string ParseChat(string json)
        {
            IDictionary<string, object> root = JsonObject.ParseObject(json, "chat");
            IDictionary<string, object> message =
                JsonObject.RequireObject(root, "message", "chat");
            return JsonObject.RequireString(message, "content", "chat");
        }
    }
}
