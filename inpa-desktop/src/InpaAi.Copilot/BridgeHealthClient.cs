using System;
using System.Collections.Generic;
using System.Collections;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using InpaAi.Shared;

namespace InpaAi.Copilot
{
    internal sealed class BridgeHealthResult
    {
        public bool Success { get; set; }
        public int ProcessBitness { get; set; }
        public string Mode { get; set; }
        public string EdiabasBinPath { get; set; }
        public string EcuPath { get; set; }
        public string DiscoveryManifestVersion { get; set; }
        public int DiscoveryProbeCount { get; set; }
        public string StandardError { get; set; }
    }

    internal sealed class BridgeHealthException : Exception
    {
        public BridgeHealthException(string code, string message, string phase)
            : base(message)
        {
            Code = code;
            Phase = phase;
        }

        public string Code { get; private set; }
        public string Phase { get; private set; }
    }

    internal static class BridgeHealthProtocol
    {
        public const string RequestLine = "{\"command\":\"health\"}";

        public static BridgeHealthResult ParseResponse(string line, string standardError)
        {
            IDictionary<string, object> root;
            try
            {
                root = JsonObject.CreateSerializer().DeserializeObject(line)
                    as IDictionary<string, object>;
            }
            catch (Exception exception)
            {
                throw new BridgeHealthException(
                    "BRIDGE_JSON_INVALID",
                    "Die Bridge hat ungueltiges JSON geliefert: " + exception.Message,
                    "bridge-parse");
            }

            if (root == null)
            {
                throw new BridgeHealthException(
                    "BRIDGE_JSON_INVALID",
                    "Die Bridge-Antwort ist kein JSON-Objekt.",
                    "bridge-parse");
            }

            object successValue;
            object commandValue;
            object resultsValue;
            if (!root.TryGetValue("success", out successValue) ||
                !(successValue is bool) ||
                !root.TryGetValue("command", out commandValue) ||
                !String.Equals(commandValue as string, "health", StringComparison.Ordinal) ||
                !root.TryGetValue("results", out resultsValue))
            {
                throw new BridgeHealthException(
                    "BRIDGE_PROTOCOL_INVALID",
                    "Die Bridge-Antwort entspricht nicht dem health-Protokoll.",
                    "bridge-parse");
            }

            if (!(bool)successValue)
            {
                throw new BridgeHealthException(
                    "BRIDGE_HEALTH_FAILED",
                    "Die Bridge meldet health als nicht erfolgreich.",
                    "bridge-health");
            }

            IDictionary<string, object> results =
                resultsValue as IDictionary<string, object>;
            if (results == null)
            {
                throw new BridgeHealthException(
                    "BRIDGE_PROTOCOL_INVALID",
                    "Die Bridge-Antwort enthaelt keine health-Ergebnisse.",
                    "bridge-parse");
            }

            object bitnessValue;
            object modeValue;
            if (!results.TryGetValue("processBitness", out bitnessValue) ||
                !results.TryGetValue("mode", out modeValue))
            {
                throw new BridgeHealthException(
                    "BRIDGE_PROTOCOL_INVALID",
                    "Die Bridge-health-Felder fehlen.",
                    "bridge-parse");
            }

            int bitness;
            try
            {
                bitness = Convert.ToInt32(bitnessValue);
            }
            catch
            {
                throw new BridgeHealthException(
                    "BRIDGE_PROTOCOL_INVALID",
                    "Die Bridge-Bitness ist ungueltig.",
                    "bridge-parse");
            }

            if (bitness != 32)
            {
                throw new BridgeHealthException(
                    "BRIDGE_ARCHITECTURE_INVALID",
                    "Die Bridge meldet nicht 32 Bit.",
                    "bridge-health");
            }

            return new BridgeHealthResult
            {
                Success = true,
                ProcessBitness = bitness,
                Mode = modeValue as string,
                EdiabasBinPath = GetOptionalString(results, "ediabasBinPath"),
                EcuPath = GetOptionalString(results, "ecuPath") ?? @"C:\EDIABAS\ECU",
                DiscoveryManifestVersion =
                    GetOptionalString(results, "discoveryManifestVersion"),
                DiscoveryProbeCount = GetOptionalInt(results, "discoveryProbeCount"),
                StandardError = standardError ?? String.Empty
            };
        }

        private static string GetOptionalString(
            IDictionary<string, object> values,
            string name)
        {
            object value;
            return values.TryGetValue(name, out value) ? value as string : null;
        }

        private static int GetOptionalInt(
            IDictionary<string, object> values,
            string name)
        {
            object value;
            if (!values.TryGetValue(name, out value))
            {
                return 0;
            }

            try
            {
                return Convert.ToInt32(value);
            }
            catch
            {
                return 0;
            }
        }
    }

    internal static class BridgeDiscoveryProtocol
    {
        public static string BuildRequest(DiscoveryProbeDefinition definition)
        {
            if (definition == null)
            {
                throw new ArgumentNullException("definition");
            }

            return "{\"command\":\"" + definition.Command + "\"}";
        }

        public static DiscoveryBridgeResponse ParseResponse(
            string line,
            DiscoveryProbeDefinition definition)
        {
            IDictionary<string, object> root;
            try
            {
                root = JsonObject.CreateSerializer().DeserializeObject(line)
                    as IDictionary<string, object>;
            }
            catch (Exception exception)
            {
                throw Protocol("Ungueltige Discovery-JSON-Antwort: " + exception.Message);
            }

            object successValue;
            object commandValue;
            object ecuValue;
            object jobValue;
            if (root == null ||
                !root.TryGetValue("success", out successValue) ||
                !(successValue is bool) ||
                !root.TryGetValue("command", out commandValue) ||
                !String.Equals(
                    commandValue as string,
                    definition.Command,
                    StringComparison.Ordinal) ||
                !root.TryGetValue("ecu", out ecuValue) ||
                !String.Equals(ecuValue as string, definition.Sgbd, StringComparison.Ordinal) ||
                !root.TryGetValue("job", out jobValue) ||
                !String.Equals(jobValue as string, definition.Job, StringComparison.Ordinal))
            {
                throw Protocol("Discovery-Antwort passt nicht zur festen Manifest-Probe.");
            }

            long duration = GetDuration(root);
            if ((bool)successValue)
            {
                object resultsValue;
                if (!root.TryGetValue("results", out resultsValue))
                {
                    throw Protocol("Discovery-Ergebnisse fehlen.");
                }

                return new DiscoveryBridgeResponse
                {
                    Success = true,
                    Command = definition.Command,
                    Ecu = definition.Sgbd,
                    Job = definition.Job,
                    DurationMilliseconds = duration,
                    ResultSets = ParseResultSets(resultsValue)
                };
            }

            object errorValue;
            IDictionary<string, object> error;
            if (!root.TryGetValue("error", out errorValue) ||
                (error = errorValue as IDictionary<string, object>) == null)
            {
                throw Protocol("Discovery-Fehlerobjekt fehlt.");
            }

            return new DiscoveryBridgeResponse
            {
                Success = false,
                Command = definition.Command,
                Ecu = definition.Sgbd,
                Job = definition.Job,
                DurationMilliseconds = duration,
                ResultSets = new List<IDictionary<string, object>>(),
                Error = new DiscoveryBridgeError
                {
                    Code = GetString(error, "code"),
                    Message = GetString(error, "message"),
                    Phase = GetString(error, "phase")
                }
            };
        }

        private static IList<IDictionary<string, object>> ParseResultSets(object value)
        {
            IEnumerable sequence = value as IEnumerable;
            if (sequence == null || value is string || value is IDictionary)
            {
                throw Protocol("Discovery-results ist kein Array.");
            }

            IList<IDictionary<string, object>> result =
                new List<IDictionary<string, object>>();
            foreach (object item in sequence)
            {
                IDictionary<string, object> fields = item as IDictionary<string, object>;
                if (fields == null)
                {
                    throw Protocol("Discovery-result-set ist kein Objekt.");
                }
                result.Add(fields);
            }

            return result;
        }

        private static long GetDuration(IDictionary<string, object> root)
        {
            object value;
            try
            {
                return root.TryGetValue("durationMs", out value)
                    ? Math.Max(0, Convert.ToInt64(value))
                    : 0;
            }
            catch
            {
                throw Protocol("Discovery-durationMs ist ungueltig.");
            }
        }

        private static string GetString(IDictionary<string, object> values, string name)
        {
            object value;
            return values.TryGetValue(name, out value) ? value as string : null;
        }

        private static BridgeHealthException Protocol(string message)
        {
            return new BridgeHealthException(
                "BRIDGE_PROTOCOL_INVALID",
                message,
                "bridge-parse");
        }
    }

    internal sealed class BridgeHealthClient : IDisposable, IDiscoveryProbeClient
    {
        private const int MaximumBridgeOutputCharacters = 65536;
        private readonly string bridgePath;
        private readonly SemaphoreSlim gate = new SemaphoreSlim(1, 1);

        public BridgeHealthClient(string bridgePath)
        {
            this.bridgePath = bridgePath;
        }

        public async Task<BridgeHealthResult> CheckAsync(
            TimeSpan timeout,
            CancellationToken cancellationToken)
        {
            BridgeInvocationResult invocation = await InvokeAsync(
                BridgeHealthProtocol.RequestLine,
                timeout,
                cancellationToken).ConfigureAwait(false);
            return BridgeHealthProtocol.ParseResponse(
                invocation.ResponseLine,
                invocation.StandardError);
        }

        public async Task<DiscoveryBridgeResponse> ProbeAsync(
            DiscoveryProbeDefinition definition,
            CancellationToken cancellationToken)
        {
            try
            {
                BridgeInvocationResult invocation = await InvokeAsync(
                    BridgeDiscoveryProtocol.BuildRequest(definition),
                    TimeSpan.FromMilliseconds(definition.TimeoutMilliseconds + 2000),
                    cancellationToken).ConfigureAwait(false);
                return BridgeDiscoveryProtocol.ParseResponse(
                    invocation.ResponseLine,
                    definition);
            }
            catch (BridgeHealthException exception)
            {
                if (exception.Code == "BRIDGE_CANCELLED" ||
                    cancellationToken.IsCancellationRequested)
                {
                    throw new OperationCanceledException(cancellationToken);
                }

                throw new DiscoveryTransportException(
                    exception.Code,
                    exception.Message,
                    exception.Phase);
            }
        }

        private async Task<BridgeInvocationResult> InvokeAsync(
            string requestLine,
            TimeSpan timeout,
            CancellationToken cancellationToken)
        {
            await gate.WaitAsync(cancellationToken).ConfigureAwait(false);
            Process process = null;
            try
            {
                if (!File.Exists(bridgePath))
                {
                    throw new BridgeHealthException(
                        "BRIDGE_NOT_FOUND",
                        "Die InpaAi.Bridge wurde nicht gefunden: " + bridgePath,
                        "bridge-start");
                }

                ProcessStartInfo startInfo = new ProcessStartInfo
                {
                    FileName = bridgePath,
                    UseShellExecute = false,
                    CreateNoWindow = true,
                    RedirectStandardInput = true,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true
                };

                process = new Process
                {
                    StartInfo = startInfo,
                    EnableRaisingEvents = true
                };

                TaskCompletionSource<int> exited = new TaskCompletionSource<int>();
                process.Exited += delegate
                {
                    try
                    {
                        exited.TrySetResult(process.ExitCode);
                    }
                    catch
                    {
                        exited.TrySetResult(-1);
                    }
                };

                if (!process.Start())
                {
                    throw new BridgeHealthException(
                        "BRIDGE_START_FAILED",
                        "Die InpaAi.Bridge konnte nicht gestartet werden.",
                        "bridge-start");
                }

                process.StandardInput.WriteLine(requestLine);
                process.StandardInput.Close();

                Task<string> standardOutputTask = process.StandardOutput.ReadToEndAsync();
                Task<string> standardErrorTask = process.StandardError.ReadToEndAsync();
                Task operation = Task.WhenAll(
                    (Task)standardOutputTask,
                    (Task)standardErrorTask,
                    (Task)exited.Task);
                Task delay = Task.Delay(timeout, cancellationToken);
                Task completed = await Task.WhenAny(operation, delay).ConfigureAwait(false);

                if (completed != operation)
                {
                    TryKill(process);
                    if (cancellationToken.IsCancellationRequested)
                    {
                        throw new BridgeHealthException(
                            "BRIDGE_CANCELLED",
                            "Die Bridge-health-Anfrage wurde abgebrochen.",
                            "bridge-wait");
                    }

                    throw new BridgeHealthException(
                        "BRIDGE_TIMEOUT",
                        "Die Bridge hat nicht innerhalb des Timeouts geantwortet.",
                        "bridge-wait");
                }

                await operation.ConfigureAwait(false);
                string standardOutput = standardOutputTask.Result;
                string standardError = SecretRedactor.Redact(
                    standardErrorTask.Result,
                    SecretRedactor.CurrentRuntimeSecrets());

                if (standardOutput.Length > MaximumBridgeOutputCharacters ||
                    standardError.Length > MaximumBridgeOutputCharacters)
                {
                    throw new BridgeHealthException(
                        "BRIDGE_RESPONSE_TOO_LARGE",
                        "Die Bridge-Ausgabe ueberschreitet das erlaubte Limit.",
                        "bridge-read");
                }

                if (exited.Task.Result != 0)
                {
                    throw new BridgeHealthException(
                        "BRIDGE_EXIT_ERROR",
                        "Die Bridge wurde mit Exitcode " + exited.Task.Result + " beendet.",
                        "bridge-exit");
                }

                string[] lines = standardOutput
                    .Split(new[] { "\r\n", "\n" }, StringSplitOptions.RemoveEmptyEntries);
                if (lines.Length != 1)
                {
                    throw new BridgeHealthException(
                        "BRIDGE_PROTOCOL_INVALID",
                        "Erwartet wurde genau eine Bridge-Antwortzeile.",
                        "bridge-parse");
                }

                return new BridgeInvocationResult
                {
                    ResponseLine = lines[0],
                    StandardError = standardError
                };
            }
            finally
            {
                if (process != null)
                {
                    TryKill(process);
                    process.Dispose();
                }

                gate.Release();
            }
        }

        private static void TryKill(Process process)
        {
            try
            {
                if (!process.HasExited)
                {
                    process.Kill();
                    process.WaitForExit(2000);
                }
            }
            catch
            {
            }
        }

        public void Dispose()
        {
            // SemaphoreSlim has no unmanaged state. Keeping it undisposed avoids
            // racing an in-flight cancellation during FormClosing.
        }

        private sealed class BridgeInvocationResult
        {
            public string ResponseLine { get; set; }
            public string StandardError { get; set; }
        }
    }
}
