using System;
using System.Net.Http;

namespace InpaAi.Copilot
{
    internal static class ProviderFactory
    {
        public static IAiProvider Create(ProviderOptions options)
        {
            return Create(options, null);
        }

        internal static IAiProvider Create(
            ProviderOptions options,
            HttpMessageHandler handler)
        {
            if (options == null)
            {
                throw new ArgumentNullException("options");
            }

            switch (options.Kind)
            {
                case ProviderKind.OllamaLocalOrTailscale:
                case ProviderKind.OllamaCloud:
                    return new OllamaProvider(options, handler);
                case ProviderKind.LmStudioLocalOrTailscale:
                    return new LmStudioProvider(options, handler);
                default:
                    throw new ProviderException(
                        "PROVIDER_NOT_SUPPORTED",
                        "Der ausgewaehlte Provider wird nicht unterstuetzt.",
                        "provider-selection");
            }
        }
    }
}
