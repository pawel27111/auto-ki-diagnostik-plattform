using System;
using System.Collections.Generic;
using System.Net;
using System.Threading;
using System.Threading.Tasks;

namespace InpaAi.Copilot
{
    internal enum ProviderKind
    {
        OllamaLocalOrTailscale,
        OllamaCloud,
        LmStudioLocalOrTailscale
    }

    internal static class ProviderKindNames
    {
        public static string ToDisplayName(ProviderKind kind)
        {
            switch (kind)
            {
                case ProviderKind.OllamaLocalOrTailscale:
                    return "Ollama lokal / Tailscale";
                case ProviderKind.OllamaCloud:
                    return "Ollama Cloud";
                case ProviderKind.LmStudioLocalOrTailscale:
                    return "LM Studio lokal / Tailscale";
                default:
                    throw new ArgumentOutOfRangeException("kind");
            }
        }
    }

    internal sealed class ProviderOptions
    {
        public const int DefaultMaximumResponseBytes = 1024 * 1024;

        public ProviderOptions()
        {
            Timeout = TimeSpan.FromSeconds(30);
            MaximumResponseBytes = DefaultMaximumResponseBytes;
        }

        public ProviderKind Kind { get; set; }
        public string BaseUrl { get; set; }
        public TimeSpan Timeout { get; set; }
        public int MaximumResponseBytes { get; set; }
    }

    internal sealed class ProviderConnectionResult
    {
        public bool Connected { get; set; }
        public Uri BaseUri { get; set; }
        public int ModelCount { get; set; }
    }

    internal sealed class ChatMessage
    {
        public ChatMessage(string role, string content)
        {
            Role = role;
            Content = content;
        }

        public string Role { get; private set; }
        public string Content { get; private set; }
    }

    internal sealed class ProviderException : Exception
    {
        public ProviderException(
            string code,
            string message,
            string phase,
            HttpStatusCode? statusCode,
            Exception innerException)
            : base(message, innerException)
        {
            Code = code;
            Phase = phase;
            StatusCode = statusCode;
        }

        public ProviderException(string code, string message, string phase)
            : this(code, message, phase, null, null)
        {
        }

        public string Code { get; private set; }
        public string Phase { get; private set; }
        public HttpStatusCode? StatusCode { get; private set; }
    }

    internal interface IAiProvider : IDisposable
    {
        ProviderKind Kind { get; }
        Uri BaseUri { get; }
        Task<ProviderConnectionResult> TestConnectionAsync(CancellationToken cancellationToken);
        Task<IList<string>> GetModelsAsync(CancellationToken cancellationToken);
        Task<string> ChatAsync(
            string modelId,
            IList<ChatMessage> messages,
            CancellationToken cancellationToken);
    }
}
