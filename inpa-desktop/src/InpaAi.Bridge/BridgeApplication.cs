using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using InpaAi.Shared;

namespace InpaAi.Bridge
{
    internal sealed class BridgeApplication
    {
        private readonly BridgeOptions options;
        private readonly CommandPolicy commandPolicy;
        private readonly JsonLineProtocol protocol;

        public BridgeApplication(BridgeOptions options)
        {
            this.options = options;
            commandPolicy = new CommandPolicy();
            protocol = new JsonLineProtocol();
        }

        public void Run(TextReader input, TextWriter output)
        {
            string line;
            while ((line = input.ReadLine()) != null)
            {
                BridgeResponse response = HandleLine(line);
                output.WriteLine(protocol.SerializeResponse(response));
                output.Flush();
            }
        }

        internal BridgeResponse HandleLine(string line)
        {
            Stopwatch stopwatch = Stopwatch.StartNew();
            BridgeRequest request;
            string parseError;

            if (!protocol.TryParseRequest(line, out request, out parseError))
            {
                return BridgeResponse.Failure(
                    null,
                    null,
                    null,
                    stopwatch.ElapsedMilliseconds,
                    "INVALID_REQUEST",
                    parseError,
                    "json-parse");
            }

            AllowedOperation operation;
            if (!commandPolicy.TryResolve(request.Command, out operation))
            {
                return BridgeResponse.Failure(
                    request.Command,
                    null,
                    null,
                    stopwatch.ElapsedMilliseconds,
                    "COMMAND_NOT_ALLOWED",
                    "Command is not present in the fixed allowlist.",
                    "allowlist");
            }

            if (operation.Ecu == null)
            {
                IDictionary<string, object> health = new Dictionary<string, object>();
                health["processBitness"] = IntPtr.Size * 8;
                health["ediabasBinPath"] = options.EdiabasBinPath;
                health["ecuPath"] = options.EcuPath;
                health["mode"] = "FIXED_READ_ONLY_DISCOVERY";
                health["discoveryManifestVersion"] = E46DiscoveryManifest.ManifestVersion;
                health["discoveryProbeCount"] = E46DiscoveryManifest.All.Count;
                return BridgeResponse.Success(
                    operation.Command,
                    null,
                    null,
                    stopwatch.ElapsedMilliseconds,
                    health);
            }

            try
            {
                IList<IDictionary<string, object>> results =
                    new EdiabasClient(options).Execute(operation);
                return BridgeResponse.Success(
                    operation.Command,
                    operation.Ecu,
                    operation.Job,
                    stopwatch.ElapsedMilliseconds,
                    results);
            }
            catch (EdiabasException exception)
            {
                return BridgeResponse.Failure(
                    operation.Command,
                    operation.Ecu,
                    operation.Job,
                    stopwatch.ElapsedMilliseconds,
                    exception.Code,
                    exception.Message,
                    exception.Phase);
            }
            catch (Exception exception)
            {
                Console.Error.WriteLine(exception.ToString());
                return BridgeResponse.Failure(
                    operation.Command,
                    operation.Ecu,
                    operation.Job,
                    stopwatch.ElapsedMilliseconds,
                    "UNEXPECTED_ERROR",
                    exception.Message,
                    "bridge");
            }
        }
    }
}
