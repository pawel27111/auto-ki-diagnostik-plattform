using System;
using System.Collections.Generic;
using InpaAi.Shared;

namespace InpaAi.Bridge
{
    internal sealed class CommandPolicy
    {
        private static readonly IDictionary<string, AllowedOperation> Operations =
            BuildOperations();

        public bool TryResolve(string command, out AllowedOperation operation)
        {
            operation = null;
            return command != null && Operations.TryGetValue(command, out operation);
        }

        public bool IsExecutable(AllowedOperation operation)
        {
            if (operation == null || operation.Ecu == null)
            {
                return false;
            }

            AllowedOperation allowed;
            return Operations.TryGetValue(operation.Command, out allowed) &&
                String.Equals(allowed.Ecu, operation.Ecu, StringComparison.Ordinal) &&
                String.Equals(allowed.Job, operation.Job, StringComparison.Ordinal) &&
                String.Equals(allowed.PrgFile, operation.PrgFile, StringComparison.Ordinal) &&
                String.Equals(
                    allowed.ExpectedSha256,
                    operation.ExpectedSha256,
                    StringComparison.Ordinal) &&
                allowed.TimeoutMilliseconds == operation.TimeoutMilliseconds &&
                allowed.Discovery == operation.Discovery;
        }

        private static IDictionary<string, AllowedOperation> BuildOperations()
        {
            IDictionary<string, AllowedOperation> operations =
                new Dictionary<string, AllowedOperation>(StringComparer.Ordinal);
            operations.Add(
                "health",
                new AllowedOperation("health", null, null, null, null, 0, false));
            operations.Add(
                "tmode-info",
                new AllowedOperation(
                    "tmode-info",
                    "TMODE",
                    "INFO",
                    "TMode.prg",
                    null,
                    30000,
                    false));
            operations.Add(
                "tmode-initialisierung",
                new AllowedOperation(
                    "tmode-initialisierung",
                    "TMODE",
                    "INITIALISIERUNG",
                    "TMode.prg",
                    null,
                    30000,
                    false));

            foreach (DiscoveryProbeDefinition probe in E46DiscoveryManifest.All)
            {
                operations.Add(
                    probe.Command,
                    new AllowedOperation(
                        probe.Command,
                        probe.Sgbd,
                        probe.Job,
                        probe.PrgFile,
                        probe.PrgSha256,
                        probe.TimeoutMilliseconds,
                        true));
            }

            return operations;
        }
    }
}
