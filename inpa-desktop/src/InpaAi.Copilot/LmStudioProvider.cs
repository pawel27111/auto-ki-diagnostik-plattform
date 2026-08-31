using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Threading;
using System.Threading.Tasks;

namespace InpaAi.Copilot
{
    internal sealed class LmStudioProvider : HttpProviderBase
    {
        public LmStudioProvider(ProviderOptions options, HttpMessageHandler handler)
            : base(options, handler)
        {
            if (options.Kind != ProviderKind.LmStudioLocalOrTailscale)
            {
                throw new ArgumentException("Invalid provider kind for LM Studio.", "options");
            }
        }

        public LmStudioProvider(ProviderOptions options)
            : this(options, null)
        {
        }

        protected override async Task<IList<string>> FetchModelsAsync(
            CancellationToken cancellationToken)
        {
            string json = await SendAsync(
                HttpMethod.Get,
                "v1/models",
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
                "v1/chat/completions",
                body,
                "chat",
                cancellationToken).ConfigureAwait(false);
            return ParseChat(json);
        }

        protected override void ApplyAuthorization(HttpRequestMessage request)
        {
            string token = Environment.GetEnvironmentVariable("LM_STUDIO_API_TOKEN");
            if (!String.IsNullOrWhiteSpace(token))
            {
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            }
        }

        internal static IList<string> ParseModels(string json)
        {
            IDictionary<string, object> root = JsonObject.ParseObject(json, "model-list");
            IList<object> models = JsonObject.RequireArray(root, "data", "model-list");
            IList<string> result = new List<string>();
            foreach (object item in models)
            {
                IDictionary<string, object> model = item as IDictionary<string, object>;
                if (model == null)
                {
                    throw new ProviderException(
                        "PROVIDER_JSON_INVALID",
                        "Ein Eintrag in 'data' ist kein JSON-Objekt.",
                        "model-list");
                }

                result.Add(JsonObject.RequireString(model, "id", "model-list"));
            }

            return result;
        }

        internal static string ParseChat(string json)
        {
            IDictionary<string, object> root = JsonObject.ParseObject(json, "chat");
            IList<object> choices = JsonObject.RequireArray(root, "choices", "chat");
            if (choices.Count == 0)
            {
                throw new ProviderException(
                    "PROVIDER_JSON_INVALID",
                    "Feld 'choices' ist leer.",
                    "chat");
            }

            IDictionary<string, object> choice = choices[0] as IDictionary<string, object>;
            if (choice == null)
            {
                throw new ProviderException(
                    "PROVIDER_JSON_INVALID",
                    "Der erste Eintrag in 'choices' ist kein JSON-Objekt.",
                    "chat");
            }

            IDictionary<string, object> message =
                JsonObject.RequireObject(choice, "message", "chat");
            return JsonObject.RequireString(message, "content", "chat");
        }
    }
}
