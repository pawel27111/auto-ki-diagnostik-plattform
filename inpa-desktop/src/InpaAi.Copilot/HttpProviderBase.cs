using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

namespace InpaAi.Copilot
{
    internal abstract class HttpProviderBase : IAiProvider
    {
        private readonly ProviderOptions options;
        private readonly HttpClient client;

        protected HttpProviderBase(ProviderOptions options, HttpMessageHandler handler)
        {
            if (options == null)
            {
                throw new ArgumentNullException("options");
            }

            if (options.Timeout <= TimeSpan.Zero || options.Timeout > TimeSpan.FromMinutes(5))
            {
                throw new ProviderException(
                    "INVALID_TIMEOUT",
                    "Der Timeout muss zwischen einer Sekunde und fuenf Minuten liegen.",
                    "configuration");
            }

            if (options.MaximumResponseBytes < 1024 ||
                options.MaximumResponseBytes > 10 * 1024 * 1024)
            {
                throw new ProviderException(
                    "INVALID_RESPONSE_LIMIT",
                    "Die maximale Antwortgroesse liegt ausserhalb des erlaubten Bereichs.",
                    "configuration");
            }

            this.options = options;
            BaseUri = BaseUrlNormalizer.Normalize(options.BaseUrl, options.Kind);

            if (handler == null)
            {
                handler = new HttpClientHandler
                {
                    AllowAutoRedirect = false,
                    UseCookies = false
                };
            }

            client = new HttpClient(handler, true);
            client.Timeout = Timeout.InfiniteTimeSpan;
        }

        public ProviderKind Kind
        {
            get { return options.Kind; }
        }

        public Uri BaseUri { get; private set; }

        protected ProviderOptions Options
        {
            get { return options; }
        }

        public async Task<ProviderConnectionResult> TestConnectionAsync(
            CancellationToken cancellationToken)
        {
            IList<string> models = await FetchModelsAsync(cancellationToken).ConfigureAwait(false);
            return new ProviderConnectionResult
            {
                Connected = true,
                BaseUri = BaseUri,
                ModelCount = models.Count
            };
        }

        public async Task<IList<string>> GetModelsAsync(CancellationToken cancellationToken)
        {
            IList<string> models = await FetchModelsAsync(cancellationToken).ConfigureAwait(false);
            if (models.Count == 0)
            {
                throw new ProviderException(
                    "EMPTY_MODEL_LIST",
                    "Der Provider hat keine geladenen bzw. verfuegbaren Modelle gemeldet.",
                    "model-list");
            }

            return models;
        }

        public abstract Task<string> ChatAsync(
            string modelId,
            IList<ChatMessage> messages,
            CancellationToken cancellationToken);

        protected abstract Task<IList<string>> FetchModelsAsync(
            CancellationToken cancellationToken);

        protected async Task<string> SendAsync(
            HttpMethod method,
            string relativePath,
            object requestBody,
            string phase,
            CancellationToken cancellationToken)
        {
            Uri requestUri = new Uri(BaseUri, relativePath);
            using (HttpRequestMessage request = new HttpRequestMessage(method, requestUri))
            {
                request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
                ApplyAuthorization(request);

                if (requestBody != null)
                {
                    string json = JsonObject.CreateSerializer().Serialize(requestBody);
                    request.Content = new StringContent(json, Encoding.UTF8, "application/json");
                }

                using (CancellationTokenSource timeout =
                    CancellationTokenSource.CreateLinkedTokenSource(cancellationToken))
                {
                    timeout.CancelAfter(options.Timeout);
                    try
                    {
                        using (HttpResponseMessage response = await client.SendAsync(
                            request,
                            HttpCompletionOption.ResponseHeadersRead,
                            timeout.Token).ConfigureAwait(false))
                        {
                            if (!response.IsSuccessStatusCode)
                            {
                                throw CreateHttpError(response.StatusCode, phase);
                            }

                            return await ReadBoundedContentAsync(
                                response,
                                timeout.Token).ConfigureAwait(false);
                        }
                    }
                    catch (ProviderException)
                    {
                        throw;
                    }
                    catch (OperationCanceledException exception)
                    {
                        if (cancellationToken.IsCancellationRequested)
                        {
                            throw new ProviderException(
                                "REQUEST_CANCELLED",
                                "Die Provideranfrage wurde abgebrochen.",
                                phase,
                                null,
                                exception);
                        }

                        throw new ProviderException(
                            "REQUEST_TIMEOUT",
                            "Der Provider hat nicht innerhalb des eingestellten Timeouts geantwortet.",
                            phase,
                            null,
                            exception);
                    }
                    catch (HttpRequestException exception)
                    {
                        throw new ProviderException(
                            "SERVER_UNREACHABLE",
                            "Der Provider ist unter der eingestellten Adresse nicht erreichbar.",
                            phase,
                            null,
                            exception);
                    }
                }
            }
        }

        protected virtual void ApplyAuthorization(HttpRequestMessage request)
        {
        }

        protected static void ValidateChatInput(
            string modelId,
            IList<ChatMessage> messages)
        {
            if (String.IsNullOrWhiteSpace(modelId))
            {
                throw new ProviderException(
                    "MODEL_REQUIRED",
                    "Vor der Analyse muss ein Modell ausgewaehlt werden.",
                    "chat-validation");
            }

            if (messages == null || messages.Count == 0)
            {
                throw new ProviderException(
                    "MESSAGES_REQUIRED",
                    "Die Chatanfrage enthaelt keine Nachrichten.",
                    "chat-validation");
            }

            foreach (ChatMessage message in messages)
            {
                if (message == null ||
                    String.IsNullOrWhiteSpace(message.Role) ||
                    String.IsNullOrWhiteSpace(message.Content))
                {
                    throw new ProviderException(
                        "MESSAGE_INVALID",
                        "Eine Chatnachricht ist unvollstaendig.",
                        "chat-validation");
                }
            }
        }

        private async Task<string> ReadBoundedContentAsync(
            HttpResponseMessage response,
            CancellationToken cancellationToken)
        {
            long? contentLength = response.Content.Headers.ContentLength;
            if (contentLength.HasValue && contentLength.Value > options.MaximumResponseBytes)
            {
                throw new ProviderException(
                    "RESPONSE_TOO_LARGE",
                    "Die Providerantwort ueberschreitet die maximale Groesse.",
                    "response-reading");
            }

            using (Stream input = await response.Content.ReadAsStreamAsync().ConfigureAwait(false))
            using (MemoryStream output = new MemoryStream())
            {
                byte[] buffer = new byte[8192];
                int total = 0;
                while (true)
                {
                    int read = await input.ReadAsync(
                        buffer,
                        0,
                        buffer.Length,
                        cancellationToken).ConfigureAwait(false);
                    if (read == 0)
                    {
                        break;
                    }

                    total += read;
                    if (total > options.MaximumResponseBytes)
                    {
                        throw new ProviderException(
                            "RESPONSE_TOO_LARGE",
                            "Die Providerantwort ueberschreitet die maximale Groesse.",
                            "response-reading");
                    }

                    output.Write(buffer, 0, read);
                }

                return Encoding.UTF8.GetString(output.ToArray());
            }
        }

        private static ProviderException CreateHttpError(
            HttpStatusCode statusCode,
            string phase)
        {
            if (statusCode == HttpStatusCode.Unauthorized)
            {
                return new ProviderException(
                    "HTTP_401",
                    "Authentifizierung fehlgeschlagen (HTTP 401).",
                    phase,
                    statusCode,
                    null);
            }

            if (statusCode == HttpStatusCode.Forbidden)
            {
                return new ProviderException(
                    "HTTP_403",
                    "Der Provider hat die Anfrage abgewiesen (HTTP 403).",
                    phase,
                    statusCode,
                    null);
            }

            if (statusCode == HttpStatusCode.NotFound && phase == "chat")
            {
                return new ProviderException(
                    "UNKNOWN_MODEL",
                    "Endpunkt oder Modell wurde nicht gefunden (HTTP 404).",
                    phase,
                    statusCode,
                    null);
            }

            return new ProviderException(
                "HTTP_" + (int)statusCode,
                "Der Provider antwortete mit HTTP " + (int)statusCode + ".",
                phase,
                statusCode,
                null);
        }

        public void Dispose()
        {
            client.Dispose();
        }
    }
}
