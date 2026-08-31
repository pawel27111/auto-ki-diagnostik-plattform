using System;
using System.Collections.Generic;

namespace InpaAi.Copilot
{
    internal static class BaseUrlNormalizer
    {
        private static readonly string[] OllamaSuffixes =
        {
            "/api/tags",
            "/api/chat",
            "/api"
        };

        private static readonly string[] LmStudioSuffixes =
        {
            "/v1/chat/completions",
            "/v1/models",
            "/v1"
        };

        public static Uri Normalize(string rawUrl, ProviderKind kind)
        {
            if (kind == ProviderKind.OllamaCloud)
            {
                return new Uri("https://ollama.com/", UriKind.Absolute);
            }

            Uri uri;
            if (String.IsNullOrWhiteSpace(rawUrl) ||
                !Uri.TryCreate(rawUrl.Trim(), UriKind.Absolute, out uri))
            {
                throw new ProviderException(
                    "INVALID_BASE_URL",
                    "Die Serveradresse ist keine gueltige absolute URL.",
                    "url-validation");
            }

            if (!String.Equals(uri.Scheme, Uri.UriSchemeHttp, StringComparison.OrdinalIgnoreCase) &&
                !String.Equals(uri.Scheme, Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase))
            {
                throw new ProviderException(
                    "INVALID_BASE_URL",
                    "Nur http- und https-Adressen sind erlaubt.",
                    "url-validation");
            }

            if (String.IsNullOrWhiteSpace(uri.Host) ||
                !String.IsNullOrEmpty(uri.UserInfo) ||
                !String.IsNullOrEmpty(uri.Query) ||
                !String.IsNullOrEmpty(uri.Fragment))
            {
                throw new ProviderException(
                    "INVALID_BASE_URL",
                    "Die Serveradresse darf keine Zugangsdaten, Query oder Fragmente enthalten.",
                    "url-validation");
            }

            if (IsForbiddenHost(uri.Host))
            {
                throw new ProviderException(
                    "FORBIDDEN_HOST",
                    "Diese Domain ist fuer den Copilot nicht erlaubt.",
                    "url-validation");
            }

            string path = uri.AbsolutePath.TrimEnd('/');
            string[] suffixes = kind == ProviderKind.LmStudioLocalOrTailscale
                ? LmStudioSuffixes
                : OllamaSuffixes;
            foreach (string suffix in suffixes)
            {
                if (path.EndsWith(suffix, StringComparison.OrdinalIgnoreCase))
                {
                    path = path.Substring(0, path.Length - suffix.Length).TrimEnd('/');
                    break;
                }
            }

            UriBuilder builder = new UriBuilder(uri);
            builder.Path = path + "/";
            builder.Query = String.Empty;
            builder.Fragment = String.Empty;
            return builder.Uri;
        }

        public static string Classify(Uri baseUri, ProviderKind kind)
        {
            if (kind == ProviderKind.OllamaCloud)
            {
                return "CLOUD";
            }

            if (baseUri.IsLoopback ||
                String.Equals(baseUri.Host, "localhost", StringComparison.OrdinalIgnoreCase))
            {
                return "LOCAL";
            }

            return "TAILSCALE/REMOTE";
        }

        private static bool IsForbiddenHost(string host)
        {
            return String.Equals(host, "openai.com", StringComparison.OrdinalIgnoreCase) ||
                host.EndsWith(".openai.com", StringComparison.OrdinalIgnoreCase);
        }
    }
}
