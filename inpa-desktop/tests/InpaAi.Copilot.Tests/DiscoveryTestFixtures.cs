using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using InpaAi.Copilot;
using InpaAi.Shared;

namespace InpaAi.Copilot.Tests
{
    internal sealed class AllowAllDiscoveryVerifier : IDiscoveryProbeVerifier
    {
        public bool IsSupported(DiscoveryProbeDefinition definition, out string error)
        {
            error = null;
            return true;
        }
    }

    internal sealed class RejectOneDiscoveryVerifier : IDiscoveryProbeVerifier
    {
        private readonly string moduleKey;

        public RejectOneDiscoveryVerifier(string moduleKey)
        {
            this.moduleKey = moduleKey;
        }

        public bool IsSupported(DiscoveryProbeDefinition definition, out string error)
        {
            if (definition.ModuleKey == moduleKey)
            {
                error = "fixture unsupported";
                return false;
            }
            error = null;
            return true;
        }
    }

    internal sealed class SimulatedDiscoveryProbeClient : IDiscoveryProbeClient
    {
        private readonly Func<
            DiscoveryProbeDefinition,
            int,
            CancellationToken,
            Task<DiscoveryBridgeResponse>> handler;
        private readonly IDictionary<string, int> attempts =
            new Dictionary<string, int>(StringComparer.Ordinal);
        private int active;
        private int maximumActive;

        public SimulatedDiscoveryProbeClient(
            Func<
                DiscoveryProbeDefinition,
                int,
                CancellationToken,
                Task<DiscoveryBridgeResponse>> handler)
        {
            this.handler = handler;
            CallOrder = new List<string>();
        }

        public IList<string> CallOrder { get; private set; }

        public int MaximumConcurrentCalls
        {
            get { return maximumActive; }
        }

        public async Task<DiscoveryBridgeResponse> ProbeAsync(
            DiscoveryProbeDefinition definition,
            CancellationToken cancellationToken)
        {
            int current = Interlocked.Increment(ref active);
            int observed;
            do
            {
                observed = maximumActive;
                if (current <= observed)
                {
                    break;
                }
            }
            while (Interlocked.CompareExchange(ref maximumActive, current, observed) != observed);

            int attempt;
            lock (attempts)
            {
                attempts.TryGetValue(definition.Command, out attempt);
                attempt++;
                attempts[definition.Command] = attempt;
                CallOrder.Add(definition.Command);
            }

            try
            {
                return await handler(definition, attempt, cancellationToken)
                    .ConfigureAwait(false);
            }
            finally
            {
                Interlocked.Decrement(ref active);
            }
        }
    }
}
