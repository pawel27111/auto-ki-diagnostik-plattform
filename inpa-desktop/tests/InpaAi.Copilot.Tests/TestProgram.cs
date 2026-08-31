using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using InpaAi.Copilot;
using InpaAi.Shared;

namespace InpaAi.Copilot.Tests
{
    internal static class TestProgram
    {
        private static int testsRun;
        private static int failures;

        private static int Main(string[] args)
        {
            if (args != null && args.Length == 1 &&
                String.Equals(args[0], "--discovery-dry-run", StringComparison.Ordinal))
            {
                Console.Write(DiscoveryDryRunFormatter.Format());
                return 0;
            }

            Run("provider factory selects Ollama local", ProviderFactorySelectsOllamaLocal);
            Run("provider factory selects Ollama cloud", ProviderFactorySelectsOllamaCloud);
            Run("provider factory selects LM Studio", ProviderFactorySelectsLmStudio);
            Run("Ollama URL removes duplicate API path", OllamaUrlNormalization);
            Run("LM Studio URL removes duplicate API path", LmStudioUrlNormalization);
            Run("remote address classification", RemoteClassification);
            Run("URL rejects unsupported schemes", UrlRejectsUnsupportedScheme);
            Run("URL rejects credentials", UrlRejectsCredentials);
            Run("URL rejects forbidden host", UrlRejectsForbiddenHost);
            Run("Ollama tags fixture parsing", ParseOllamaTags);
            Run("Ollama chat fixture parsing", ParseOllamaChat);
            Run("LM Studio models fixture parsing", ParseLmStudioModels);
            Run("LM Studio chat fixture parsing", ParseLmStudioChat);
            Run("missing provider fields are rejected", MissingProviderFieldRejected);
            Run("invalid provider JSON is rejected", InvalidProviderJsonRejected);
            Run("diagnosis contract accepts valid response", DiagnosisAcceptsValid);
            Run("diagnosis contract rejects missing fields", DiagnosisRejectsMissing);
            Run("diagnosis contract rejects invalid severity", DiagnosisRejectsSeverity);
            Run("invalid diagnosis preserves raw response", DiagnosisPreservesRaw);
            Run("secret redaction removes exact and bearer values", SecretRedaction);
            Run("settings contain no credentials or prompts", SettingsContainNoSecrets);
            Run("bridge request is fixed health command", BridgeRequestIsFixed);
            Run("bridge health response parsing", BridgeHealthResponseParsing);
            Run("bridge rejects wrong command", BridgeRejectsWrongCommand);
            RunAsync("bridge process returns one matched health response", BridgeProcessHealth);
            RunAsync("bridge not found is normalized", BridgeNotFound);
            RunAsync("bridge timeout terminates process", BridgeTimeout);
            RunAsync("bridge cancellation terminates process", BridgeCancellation);
            RunAsync("bridge rejects additional response lines", BridgeExtraLine);
            RunAsync("production bridge health integration", ProductionBridgeHealth);
            RunAsync("vehicle not connected is not reported as zero installed", VehicleNotConnected);
            RunAsync("only MS43 reachable builds one-module profile", OnlyMs43Reachable);
            RunAsync("multiple reachable ECUs build dynamic profile", MultipleEcusReachable);
            RunAsync("single discovery timeout is isolated", SingleDiscoveryTimeout);
            RunAsync("complete transport error stops sequential scan", CompleteTransportError);
            RunAsync("discovery cancellation marks remaining probes", DiscoveryCancellation);
            RunAsync("VIN change survives scan invalidation", VinChangeReplacesSessionProfile);
            Run("installed PRG verifier enforces the manifest hash", InstalledPrgVerifierChecksHash);
            RunAsync("bridge discovery protocol feeds the scanner", DiscoveryProtocolFeedsScanner);
            RunAsync("discovery probes are strictly sequential", DiscoveryIsSequential);
            RunAsync("unsupported probe is never sent to bridge", UnsupportedProbeIsNotSent);
            Run("discovery request exposes no ECU or job input", DiscoveryRequestIsFixed);
            Run("dry run is explicit and non-executing", DiscoveryDryRunIsSafe);
            RunAsync("Ollama request uses endpoint and stream false", OllamaRequestShape);
            RunAsync("LM Studio request uses endpoint and stream false", LmStudioRequestShape);
            RunAsync("Ollama cloud base URL is fixed", OllamaCloudUrlIsFixed);
            RunAsync("Ollama cloud requires environment key", OllamaCloudRequiresKey);
            RunAsync("LM Studio token is optional", LmStudioTokenIsOptional);
            RunAsync("HTTP 401 is normalized", Http401IsNormalized);
            RunAsync("HTTP 403 is normalized", Http403IsNormalized);
            RunAsync("empty model list is normalized", EmptyModelListIsNormalized);
            RunAsync("unknown model HTTP 404 is normalized", UnknownModelIsNormalized);
            RunAsync("response size limit is enforced", ResponseSizeLimit);
            RunAsync("provider timeout is normalized", ProviderTimeout);
            RunAsync("provider cancellation is normalized", ProviderCancellation);
            Run("offline profile is locked", OfflineProfileIsLocked);
            Run("offline profile contains static catalog", OfflineProfileCatalog);
            Run("offline profile cannot create bridge request", OfflineProfileCannotExecute);
            Run("execution-enabled profile is rejected", ExecutionEnabledProfileRejected);
            Run("known field normalization is exact", KnownFieldNormalization);
            Run("unknown field is preserved as unmapped", UnknownFieldNormalization);
            Run("normal diagnostic fixture validates", NormalDataContractFixture);
            Run("coolant diagnostic fixture validates", CoolantDataContractFixture);
            Run("fuel-trim diagnostic fixture validates", FuelTrimDataContractFixture);
            Run("wrong unit is rejected", WrongUnitRejected);
            Run("wrong value type is rejected", WrongValueTypeRejected);
            Run("unverified LIVE data is rejected", UnverifiedLiveRejected);
            Run("verified LIVE fixture protocol is accepted", VerifiedLiveAccepted);
            Run("missing data-contract field is rejected", MissingDataContractFieldRejected);
            Run("unexpected data-contract field is rejected", UnexpectedDataContractFieldRejected);
            Run("source-job mismatch is rejected", SourceJobMismatchRejected);
            Run("unproven source job is rejected", UnprovenSourceJobRejected);
            Run("normalized-name mismatch is rejected", NormalizedNameMismatchRejected);
            Run("all synthetic fixtures are explicit", SyntheticFixturesAreExplicit);
            Run("incomplete synthetic fixture declares missing data", SyntheticIncomplete);
            Run("contradictory synthetic fixture declares contradiction", SyntheticContradictory);

            Console.WriteLine(
                "Tests: " + (testsRun - failures) + " passed, " + failures + " failed.");
            return failures == 0 ? 0 : 1;
        }

        private static ProviderOptions Options(ProviderKind kind, string baseUrl)
        {
            return new ProviderOptions
            {
                Kind = kind,
                BaseUrl = baseUrl,
                Timeout = TimeSpan.FromSeconds(5),
                MaximumResponseBytes = 1024 * 1024
            };
        }

        private static void ProviderFactorySelectsOllamaLocal()
        {
            using (IAiProvider provider = ProviderFactory.Create(
                Options(ProviderKind.OllamaLocalOrTailscale, "http://127.0.0.1:11434"),
                new FixtureHandler(JsonResponse("{}"))))
            {
                Assert(provider is OllamaProvider, "wrong adapter");
                Assert(provider.Kind == ProviderKind.OllamaLocalOrTailscale, "wrong kind");
            }
        }

        private static void ProviderFactorySelectsOllamaCloud()
        {
            using (IAiProvider provider = ProviderFactory.Create(
                Options(ProviderKind.OllamaCloud, "http://untrusted.invalid"),
                new FixtureHandler(JsonResponse("{}"))))
            {
                Assert(provider is OllamaProvider, "wrong adapter");
                Assert(provider.BaseUri.Host == "ollama.com", "cloud host is not fixed");
                Assert(provider.BaseUri.Scheme == "https", "cloud scheme is not HTTPS");
            }
        }

        private static void ProviderFactorySelectsLmStudio()
        {
            using (IAiProvider provider = ProviderFactory.Create(
                Options(ProviderKind.LmStudioLocalOrTailscale, "http://127.0.0.1:1234"),
                new FixtureHandler(JsonResponse("{}"))))
            {
                Assert(provider is LmStudioProvider, "wrong adapter");
            }
        }

        private static void OllamaUrlNormalization()
        {
            Uri uri = BaseUrlNormalizer.Normalize(
                "http://example.test/proxy/api/tags/",
                ProviderKind.OllamaLocalOrTailscale);
            Assert(uri.AbsoluteUri == "http://example.test/proxy/", uri.AbsoluteUri);
        }

        private static void LmStudioUrlNormalization()
        {
            Uri uri = BaseUrlNormalizer.Normalize(
                "https://example.test/base/v1/chat/completions",
                ProviderKind.LmStudioLocalOrTailscale);
            Assert(uri.AbsoluteUri == "https://example.test/base/", uri.AbsoluteUri);
        }

        private static void RemoteClassification()
        {
            Uri uri = new Uri("http://100.64.0.10:11434/");
            Assert(
                BaseUrlNormalizer.Classify(
                    uri,
                    ProviderKind.OllamaLocalOrTailscale) == "TAILSCALE/REMOTE",
                "remote classification missing");
        }

        private static void UrlRejectsUnsupportedScheme()
        {
            ExpectProviderException(
                delegate
                {
                    BaseUrlNormalizer.Normalize(
                        "ftp://localhost/",
                        ProviderKind.OllamaLocalOrTailscale);
                },
                "INVALID_BASE_URL");
        }

        private static void UrlRejectsCredentials()
        {
            ExpectProviderException(
                delegate
                {
                    BaseUrlNormalizer.Normalize(
                        "http://user:password@localhost:11434/",
                        ProviderKind.OllamaLocalOrTailscale);
                },
                "INVALID_BASE_URL");
        }

        private static void UrlRejectsForbiddenHost()
        {
            ExpectProviderException(
                delegate
                {
                    BaseUrlNormalizer.Normalize(
                        "https://api.openai.com/",
                        ProviderKind.LmStudioLocalOrTailscale);
                },
                "FORBIDDEN_HOST");
        }

        private static void ParseOllamaTags()
        {
            IList<string> models = OllamaProvider.ParseModels(
                ReadFixture("provider", "ollama-tags.json"));
            Assert(models.SequenceEqual(new[]
            {
                "fixture-ollama-model:latest",
                "fixture-ollama-small:1"
            }), "model IDs changed");
        }

        private static void ParseOllamaChat()
        {
            string content = OllamaProvider.ParseChat(
                ReadFixture("provider", "ollama-chat.json"));
            Assert(DiagnosisContract.Parse(content).Success, "fixture diagnosis invalid");
        }

        private static void ParseLmStudioModels()
        {
            IList<string> models = LmStudioProvider.ParseModels(
                ReadFixture("provider", "lmstudio-models.json"));
            Assert(models.Count == 1, "unexpected model count");
            Assert(models[0] == "fixture-lmstudio-model", "model ID changed");
        }

        private static void ParseLmStudioChat()
        {
            string content = LmStudioProvider.ParseChat(
                ReadFixture("provider", "lmstudio-chat.json"));
            Assert(DiagnosisContract.Parse(content).Success, "fixture diagnosis invalid");
        }

        private static void MissingProviderFieldRejected()
        {
            ExpectProviderException(
                delegate { OllamaProvider.ParseModels("{\"notModels\":[]}"); },
                "PROVIDER_JSON_INVALID");
            ExpectProviderException(
                delegate { LmStudioProvider.ParseChat("{\"choices\":[]}"); },
                "PROVIDER_JSON_INVALID");
        }

        private static void InvalidProviderJsonRejected()
        {
            ExpectProviderException(
                delegate { OllamaProvider.ParseChat("{"); },
                "PROVIDER_JSON_INVALID");
        }

        private static string ValidDiagnosisJson()
        {
            return "{\"summary\":\"Test\",\"severity\":\"info\"," +
                "\"observations\":[\"SYNTHETIC\"],\"possibleCauses\":[]," +
                "\"nextChecks\":[\"Nur pruefen\"]," +
                "\"limitations\":[\"Keine echte Fahrzeugdiagnose\"]}";
        }

        private static void DiagnosisAcceptsValid()
        {
            DiagnosisParseResult parsed = DiagnosisContract.Parse(ValidDiagnosisJson());
            Assert(parsed.Success, parsed.Error);
            Assert(parsed.Diagnosis.Severity == "info", "severity changed");
        }

        private static void DiagnosisRejectsMissing()
        {
            DiagnosisParseResult parsed = DiagnosisContract.Parse(
                "{\"summary\":\"x\",\"severity\":\"info\"}");
            Assert(!parsed.Success, "missing arrays accepted");
            Assert(parsed.Diagnosis == null, "missing fields were invented");
        }

        private static void DiagnosisRejectsSeverity()
        {
            DiagnosisParseResult parsed = DiagnosisContract.Parse(
                ValidDiagnosisJson().Replace("\"info\"", "\"high\""));
            Assert(!parsed.Success, "invalid severity accepted");
        }

        private static void DiagnosisPreservesRaw()
        {
            const string raw = "not-json-model-output";
            DiagnosisParseResult parsed = DiagnosisContract.Parse(raw);
            Assert(!parsed.Success, "invalid response accepted");
            Assert(parsed.RawResponse == raw, "raw response changed");
        }

        private static void SecretRedaction()
        {
            const string secret = "fixture-secret-value";
            string redacted = SecretRedactor.Redact(
                "Authorization: Bearer " + secret + " and " + secret,
                new[] { secret });
            Assert(!redacted.Contains(secret), "secret remained");
            Assert(redacted.Contains("[REDACTED]"), "redaction marker missing");
        }

        private static void SettingsContainNoSecrets()
        {
            string directory = Path.Combine(
                Path.GetTempPath(),
                "InpaAi.Copilot.Tests-" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(directory);
            string path = Path.Combine(directory, "settings.json");
            try
            {
                SafeSettingsStore store = new SafeSettingsStore(path);
                store.Save(new CopilotSettings
                {
                    Provider = ProviderKind.OllamaLocalOrTailscale.ToString(),
                    BaseUrl = "http://127.0.0.1:11434",
                    ModelId = "fixture-model",
                    TimeoutSeconds = 15
                });
                string json = File.ReadAllText(path);
                Assert(!json.ToLowerInvariant().Contains("authorization"), "auth field stored");
                Assert(!json.ToLowerInvariant().Contains("api_key"), "key field stored");
                Assert(!json.ToLowerInvariant().Contains("prompt"), "prompt field stored");
                CopilotSettings loaded = store.Load();
                Assert(loaded.ModelId == "fixture-model", "safe model ID not restored");
            }
            finally
            {
                if (File.Exists(path))
                {
                    File.Delete(path);
                }
                if (Directory.Exists(directory))
                {
                    Directory.Delete(directory);
                }
            }
        }

        private static void BridgeRequestIsFixed()
        {
            Assert(
                BridgeHealthProtocol.RequestLine == "{\"command\":\"health\"}",
                "bridge request is not fixed health");
            Assert(!BridgeHealthProtocol.RequestLine.Contains("ecu"), "generic ECU input exposed");
            Assert(!BridgeHealthProtocol.RequestLine.Contains("job"), "generic job input exposed");
        }

        private static void BridgeHealthResponseParsing()
        {
            BridgeHealthResult result = BridgeHealthProtocol.ParseResponse(
                "{\"success\":true,\"command\":\"health\",\"results\":" +
                "{\"processBitness\":32,\"mode\":\"TMODE_ONLY\"}}",
                String.Empty);
            Assert(result.Success, "health failed");
            Assert(result.ProcessBitness == 32, "wrong architecture");
            Assert(result.Mode == "TMODE_ONLY", "wrong mode");
        }

        private static void BridgeRejectsWrongCommand()
        {
            ExpectBridgeException(
                delegate
                {
                    BridgeHealthProtocol.ParseResponse(
                        "{\"success\":true,\"command\":\"tmode-info\",\"results\":" +
                        "{\"processBitness\":32,\"mode\":\"TMODE_ONLY\"}}",
                        String.Empty);
                },
                "BRIDGE_PROTOCOL_INVALID");
        }

        private static async Task BridgeProcessHealth()
        {
            string path = Path.Combine(
                AppDomain.CurrentDomain.BaseDirectory,
                "InpaAi.FakeBridge.exe");
            using (BridgeHealthClient client = new BridgeHealthClient(path))
            {
                BridgeHealthResult result = await client.CheckAsync(
                    TimeSpan.FromSeconds(2),
                    CancellationToken.None);
                Assert(result.Success, "fixture bridge health failed");
                Assert(result.StandardError.Length == 0, "unexpected stderr");
            }
        }

        private static async Task BridgeNotFound()
        {
            string path = Path.Combine(
                AppDomain.CurrentDomain.BaseDirectory,
                "does-not-exist-bridge.exe");
            using (BridgeHealthClient client = new BridgeHealthClient(path))
            {
                BridgeHealthException exception = await ExpectBridgeExceptionAsync(
                    delegate
                    {
                        return client.CheckAsync(
                            TimeSpan.FromMilliseconds(100),
                            CancellationToken.None);
                    });
                Assert(exception.Code == "BRIDGE_NOT_FOUND", exception.Code);
            }
        }

        private static async Task BridgeTimeout()
        {
            string path = Path.Combine(
                AppDomain.CurrentDomain.BaseDirectory,
                "InpaAi.FakeBridge-Hang.exe");
            using (BridgeHealthClient client = new BridgeHealthClient(path))
            {
                BridgeHealthException exception = await ExpectBridgeExceptionAsync(
                    delegate
                    {
                        return client.CheckAsync(
                            TimeSpan.FromMilliseconds(100),
                            CancellationToken.None);
                    });
                Assert(exception.Code == "BRIDGE_TIMEOUT", exception.Code);
            }
        }

        private static async Task BridgeCancellation()
        {
            string path = Path.Combine(
                AppDomain.CurrentDomain.BaseDirectory,
                "InpaAi.FakeBridge-Hang.exe");
            using (BridgeHealthClient client = new BridgeHealthClient(path))
            using (CancellationTokenSource cancellation = new CancellationTokenSource())
            {
                cancellation.CancelAfter(100);
                BridgeHealthException exception = await ExpectBridgeExceptionAsync(
                    delegate
                    {
                        return client.CheckAsync(
                            TimeSpan.FromSeconds(5),
                            cancellation.Token);
                    });
                Assert(exception.Code == "BRIDGE_CANCELLED", exception.Code);
            }
        }

        private static async Task BridgeExtraLine()
        {
            string path = Path.Combine(
                AppDomain.CurrentDomain.BaseDirectory,
                "InpaAi.FakeBridge-Extra.exe");
            using (BridgeHealthClient client = new BridgeHealthClient(path))
            {
                BridgeHealthException exception = await ExpectBridgeExceptionAsync(
                    delegate
                    {
                        return client.CheckAsync(
                            TimeSpan.FromSeconds(2),
                            CancellationToken.None);
                    });
                Assert(exception.Code == "BRIDGE_PROTOCOL_INVALID", exception.Code);
            }
        }

        private static async Task ProductionBridgeHealth()
        {
            string path = Path.GetFullPath(Path.Combine(
                AppDomain.CurrentDomain.BaseDirectory,
                "..",
                "bridge",
                "InpaAi.Bridge.exe"));
            using (BridgeHealthClient client = new BridgeHealthClient(path))
            {
                BridgeHealthResult result = await client.CheckAsync(
                    TimeSpan.FromSeconds(10),
                    CancellationToken.None);
                Assert(result.Success, "production health failed");
                Assert(result.ProcessBitness == 32, "production bridge is not x86");
            }
        }

        private static async Task VehicleNotConnected()
        {
            SimulatedDiscoveryProbeClient client = new SimulatedDiscoveryProbeClient(
                delegate(DiscoveryProbeDefinition probe, int attempt, CancellationToken token)
                {
                    return Task.FromResult(NoResponse(probe));
                });
            VehicleDiscoveryProfile profile = await Scanner(
                client,
                FindProbes("engine.ms43", "chassis.dsc-mk60", "security.ews3"))
                .ScanAsync(null, CancellationToken.None);
            Assert(
                profile.State == VehicleDiscoveryState.ConnectionUnconfirmed,
                "disconnected vehicle was treated as recognized");
            Assert(!profile.ConnectionConfirmed, "connection incorrectly confirmed");
            Assert(profile.ReachableCount == 0, "reachable count is not zero");
            Assert(client.CallOrder.Count == 6, "one retry per no-response probe was not enforced");
        }

        private static async Task OnlyMs43Reachable()
        {
            const string vin = "WBAET11020AA12345";
            SimulatedDiscoveryProbeClient client = new SimulatedDiscoveryProbeClient(
                delegate(DiscoveryProbeDefinition probe, int attempt, CancellationToken token)
                {
                    return Task.FromResult(
                        probe.ModuleKey == "engine.ms43"
                            ? Reachable(probe, vin)
                            : NoResponse(probe));
                });
            VehicleDiscoveryProfile profile = await Scanner(
                client,
                FindProbes("engine.ms43", "chassis.dsc-mk60", "security.ews3"))
                .ScanAsync(null, CancellationToken.None);
            Assert(profile.ConnectionConfirmed, "MS43 did not confirm vehicle");
            Assert(profile.ReachableCount == 1, "unexpected reachable count");
            Assert(profile.Vin == vin, "safe VIN was not bound to profile");
            Assert(
                VehicleCapabilityContext.CanUseEcu(profile, "MS430DS0"),
                "confirmed MS43 is not available");
            Assert(
                !VehicleCapabilityContext.CanUseEcu(profile, "DSC_MK60"),
                "unconfirmed DSC became available");
        }

        private static async Task MultipleEcusReachable()
        {
            ISet<string> reachable = new HashSet<string>(StringComparer.Ordinal)
            {
                "engine.ms43",
                "chassis.dsc-mk60",
                "body.zke5"
            };
            SimulatedDiscoveryProbeClient client = new SimulatedDiscoveryProbeClient(
                delegate(DiscoveryProbeDefinition probe, int attempt, CancellationToken token)
                {
                    return Task.FromResult(
                        reachable.Contains(probe.ModuleKey)
                            ? Reachable(probe, "WBAET11020AA12345")
                            : NoResponse(probe));
                });
            VehicleDiscoveryProfile profile = await Scanner(
                client,
                FindProbes("engine.ms43", "chassis.dsc-mk60", "body.zke5", "infotainment.radio"))
                .ScanAsync(null, CancellationToken.None);
            Assert(profile.ReachableCount == 3, "multi-ECU profile is incomplete");
            string context = VehicleCapabilityContext.BuildAiContext(profile);
            Assert(context.Contains("MS430DS0"), "MS43 missing from AI context");
            Assert(context.Contains("DSC_MK60"), "DSC missing from AI context");
            Assert(context.Contains("ZKE5"), "ZKE missing from AI context");
            Assert(!context.Contains("RADIO"), "unconfirmed radio leaked into AI context");
            Assert(
                !VehicleCapabilityContext.SpeechModuleKeys(profile).Contains("infotainment.radio"),
                "unconfirmed radio leaked into speech modules");
        }

        private static async Task SingleDiscoveryTimeout()
        {
            SimulatedDiscoveryProbeClient client = new SimulatedDiscoveryProbeClient(
                delegate(DiscoveryProbeDefinition probe, int attempt, CancellationToken token)
                {
                    return Task.FromResult(
                        probe.ModuleKey == "engine.ms43"
                            ? Reachable(probe, null)
                            : Failure(
                                probe,
                                "EDIABAS_TIMEOUT",
                                "fixture timeout",
                                "job-wait"));
                });
            VehicleDiscoveryProfile profile = await Scanner(
                client,
                FindProbes("engine.ms43", "security.ews3"))
                .ScanAsync(null, CancellationToken.None);
            DiscoveryProbeResult timedOut = profile.Results[1];
            Assert(profile.ConnectionConfirmed, "isolated timeout invalidated reachable ECU");
            Assert(timedOut.Status == DiscoveryProbeStatus.NoResponse, "timeout status mismatch");
            Assert(timedOut.Attempts == 2, "timeout did not receive exactly one retry");
        }

        private static async Task CompleteTransportError()
        {
            SimulatedDiscoveryProbeClient client = new SimulatedDiscoveryProbeClient(
                delegate(DiscoveryProbeDefinition probe, int attempt, CancellationToken token)
                {
                    throw new DiscoveryTransportException(
                        "BRIDGE_EXIT_ERROR",
                        "fixture transport failed",
                        "bridge-exit");
                });
            VehicleDiscoveryProfile profile = await Scanner(
                client,
                FindProbes("engine.ms43", "chassis.dsc-mk60", "security.ews3"))
                .ScanAsync(null, CancellationToken.None);
            Assert(!profile.ConnectionConfirmed, "transport failure confirmed vehicle");
            Assert(client.CallOrder.Count == 1, "scan continued after complete transport failure");
            Assert(
                profile.Results.All(item => item.Status == DiscoveryProbeStatus.TransportError),
                "remaining probes were not marked TransportError");
        }

        private static async Task DiscoveryCancellation()
        {
            using (CancellationTokenSource cancellation = new CancellationTokenSource())
            {
                SimulatedDiscoveryProbeClient client = new SimulatedDiscoveryProbeClient(
                    async delegate(
                        DiscoveryProbeDefinition probe,
                        int attempt,
                        CancellationToken token)
                    {
                        if (probe.ModuleKey == "engine.ms43")
                        {
                            return Reachable(probe, null);
                        }
                        cancellation.Cancel();
                        await Task.Delay(10, token);
                        return Reachable(probe, null);
                    });
                VehicleDiscoveryProfile profile = await Scanner(
                    client,
                    FindProbes("engine.ms43", "chassis.dsc-mk60", "security.ews3"))
                    .ScanAsync(null, cancellation.Token);
                Assert(profile.State == VehicleDiscoveryState.Cancelled, "scan not cancelled");
                Assert(!profile.ConnectionConfirmed, "partial cancelled scan unlocked vehicle");
                Assert(profile.Results[1].Status == DiscoveryProbeStatus.Cancelled, "active probe status");
                Assert(profile.Results[2].Status == DiscoveryProbeStatus.Cancelled, "remaining probe status");
            }
        }

        private static async Task VinChangeReplacesSessionProfile()
        {
            VehicleDiscoveryProfile first = await ScanSingleVin("WBAET11020AA12345");
            VehicleDiscoveryProfile second = await ScanSingleVin("WBAET11020BB67890");
            VehicleDiscoverySessionStore store = new VehicleDiscoverySessionStore();
            Assert(!store.Store(first), "initial profile reported VIN change");
            Assert(store.GetForVin(first.Vin) == first, "first VIN cache miss");
            string previousVin = store.Current.Vin;
            store.Clear();
            Assert(store.Current == null, "scan invalidation retained the old profile");
            Assert(
                store.Store(second, previousVin),
                "VIN change was lost after scan invalidation");
            Assert(store.GetForVin(first.Vin) == null, "old VIN profile was retained");
            Assert(store.GetForVin(second.Vin) == second, "new VIN profile missing");
        }

        private static void InstalledPrgVerifierChecksHash()
        {
            string directory = Path.Combine(
                Path.GetTempPath(),
                "InpaAi.DiscoveryVerifier.Tests-" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(directory);
            string fileName = "fixture.prg";
            string path = Path.Combine(directory, fileName);
            try
            {
                File.WriteAllBytes(path, Encoding.ASCII.GetBytes("verified-prg-fixture"));
                string expectedHash;
                using (FileStream stream = File.OpenRead(path))
                using (SHA256 algorithm = SHA256.Create())
                {
                    expectedHash = BitConverter.ToString(algorithm.ComputeHash(stream))
                        .Replace("-", String.Empty);
                }

                DiscoveryProbeDefinition probe = new DiscoveryProbeDefinition(
                    "fixture.ecu",
                    "fixture.family",
                    "Fixture ECU",
                    "FIXTURE",
                    fileName,
                    expectedHash,
                    null,
                    "discover-fixture",
                    "IDENT",
                    new[] { "JOB_STATUS", "ID_BMW_NR" },
                    new string[0],
                    1000,
                    0,
                    new[] { "Fixture" });
                InstalledPrgVerifier verifier = new InstalledPrgVerifier(directory);
                string error;
                Assert(verifier.IsSupported(probe, out error), error);

                File.AppendAllText(path, "changed", Encoding.ASCII);
                Assert(
                    !verifier.IsSupported(probe, out error),
                    "changed PRG unexpectedly passed hash verification");
                Assert(
                    error != null && error.Contains("Hash"),
                    "hash mismatch did not produce a useful error");
            }
            finally
            {
                if (File.Exists(path))
                {
                    File.Delete(path);
                }
                if (Directory.Exists(directory))
                {
                    Directory.Delete(directory);
                }
            }
        }

        private static async Task DiscoveryProtocolFeedsScanner()
        {
            const string vin = "WBAET11020AA12345";
            DiscoveryProbeDefinition probe = FindProbe("engine.ms43");
            string json =
                "{\"success\":true,\"command\":\"" + probe.Command +
                "\",\"ecu\":\"" + probe.Sgbd +
                "\",\"job\":\"" + probe.Job +
                "\",\"durationMs\":17,\"results\":[{" +
                "\"JOB_STATUS\":\"OKAY\",\"ID_BMW_NR\":\"fixture-bmw\"," +
                "\"AIF_FG_NR\":\"" + vin + "\"}]}";
            DiscoveryBridgeResponse parsed = BridgeDiscoveryProtocol.ParseResponse(json, probe);
            SimulatedDiscoveryProbeClient client = new SimulatedDiscoveryProbeClient(
                delegate(DiscoveryProbeDefinition item, int attempt, CancellationToken token)
                {
                    return Task.FromResult(parsed);
                });
            VehicleDiscoveryProfile profile = await Scanner(
                client,
                new List<DiscoveryProbeDefinition> { probe })
                .ScanAsync(null, CancellationToken.None);

            Assert(profile.ConnectionConfirmed, "parsed bridge response did not confirm ECU");
            Assert(profile.ReachableCount == 1, "parsed bridge response lost the ECU");
            Assert(profile.Vin == vin, "parsed bridge response lost the VIN");
        }

        private static async Task DiscoveryIsSequential()
        {
            IList<DiscoveryProbeDefinition> probes =
                FindProbes("engine.ms43", "chassis.dsc-mk60", "security.ews3");
            SimulatedDiscoveryProbeClient client = new SimulatedDiscoveryProbeClient(
                async delegate(DiscoveryProbeDefinition probe, int attempt, CancellationToken token)
                {
                    await Task.Delay(5, token);
                    return Reachable(probe, null);
                });
            await Scanner(client, probes).ScanAsync(null, CancellationToken.None);
            Assert(client.MaximumConcurrentCalls == 1, "discovery ran bridge calls in parallel");
            Assert(
                client.CallOrder.SequenceEqual(probes.Select(item => item.Command)),
                "discovery order changed");
        }

        private static async Task UnsupportedProbeIsNotSent()
        {
            DiscoveryProbeDefinition probe = FindProbe("chassis.dsc-mk60");
            SimulatedDiscoveryProbeClient client = new SimulatedDiscoveryProbeClient(
                delegate(DiscoveryProbeDefinition item, int attempt, CancellationToken token)
                {
                    throw new InvalidOperationException("unsupported probe was executed");
                });
            VehicleDiscoveryProfile profile = await new VehicleDiscoveryScanner(
                new List<DiscoveryProbeDefinition> { probe },
                client,
                new RejectOneDiscoveryVerifier(probe.ModuleKey))
                .ScanAsync(null, CancellationToken.None);
            Assert(client.CallOrder.Count == 0, "unsupported probe reached bridge");
            Assert(
                profile.Results[0].Status == DiscoveryProbeStatus.UnsupportedProbe,
                "unsupported status missing");
        }

        private static void DiscoveryRequestIsFixed()
        {
            foreach (DiscoveryProbeDefinition probe in E46DiscoveryManifest.All)
            {
                string request = BridgeDiscoveryProtocol.BuildRequest(probe);
                Assert(
                    request == "{\"command\":\"" + probe.Command + "\"}",
                    "request is not command-only");
                Assert(!request.Contains("job"), "generic job input exposed");
                Assert(!request.Contains("sgbd"), "generic SGBD input exposed");
                Assert(probe.MaximumRetries <= 1, "more than one retry configured");
            }
        }

        private static void DiscoveryDryRunIsSafe()
        {
            string dryRun = DiscoveryDryRunFormatter.Format();
            Assert(dryRun.Contains("NO BRIDGE OR EDIABAS JOB EXECUTED"), "offline marker missing");
            Assert(dryRun.Contains("Execution: sequential"), "sequential marker missing");
            Assert(dryRun.Contains("STOP: live discovery"), "live-test stop missing");
            Assert(
                dryRun.Split(new[] { Environment.NewLine }, StringSplitOptions.None).Length >
                    E46DiscoveryManifest.All.Count,
                "manifest rows missing from dry run");
        }

        private static VehicleDiscoveryScanner Scanner(
            IDiscoveryProbeClient client,
            IList<DiscoveryProbeDefinition> probes)
        {
            return new VehicleDiscoveryScanner(
                probes,
                client,
                new AllowAllDiscoveryVerifier());
        }

        private static IList<DiscoveryProbeDefinition> FindProbes(params string[] moduleKeys)
        {
            return moduleKeys.Select(FindProbe).ToList();
        }

        private static DiscoveryProbeDefinition FindProbe(string moduleKey)
        {
            DiscoveryProbeDefinition probe = E46DiscoveryManifest.All.FirstOrDefault(
                item => item.ModuleKey == moduleKey);
            Assert(probe != null, "manifest probe missing: " + moduleKey);
            return probe;
        }

        private static async Task<VehicleDiscoveryProfile> ScanSingleVin(string vin)
        {
            SimulatedDiscoveryProbeClient client = new SimulatedDiscoveryProbeClient(
                delegate(DiscoveryProbeDefinition probe, int attempt, CancellationToken token)
                {
                    return Task.FromResult(Reachable(probe, vin));
                });
            return await Scanner(
                client,
                FindProbes("engine.ms43"))
                .ScanAsync(null, CancellationToken.None);
        }

        private static DiscoveryBridgeResponse Reachable(
            DiscoveryProbeDefinition probe,
            string vin)
        {
            IDictionary<string, object> fields =
                new Dictionary<string, object>(StringComparer.Ordinal);
            foreach (string field in probe.ExpectedResultFields)
            {
                fields[field] = field == "JOB_STATUS"
                    ? "OKAY"
                    : field == "AIF_FG_NR"
                        ? vin ?? "not-a-safe-vin"
                        : "fixture-" + field;
            }
            return new DiscoveryBridgeResponse
            {
                Success = true,
                Command = probe.Command,
                Ecu = probe.Sgbd,
                Job = probe.Job,
                DurationMilliseconds = 12,
                ResultSets = new List<IDictionary<string, object>> { fields }
            };
        }

        private static DiscoveryBridgeResponse NoResponse(DiscoveryProbeDefinition probe)
        {
            return Failure(
                probe,
                "EDIABAS_IFH_0009",
                "IFH-0009 NO RESPONSE FROM CONTROL UNIT",
                "job");
        }

        private static DiscoveryBridgeResponse Failure(
            DiscoveryProbeDefinition probe,
            string code,
            string message,
            string phase)
        {
            return new DiscoveryBridgeResponse
            {
                Success = false,
                Command = probe.Command,
                Ecu = probe.Sgbd,
                Job = probe.Job,
                DurationMilliseconds = 25,
                ResultSets = new List<IDictionary<string, object>>(),
                Error = new DiscoveryBridgeError
                {
                    Code = code,
                    Message = message,
                    Phase = phase
                }
            };
        }

        private static async Task OllamaRequestShape()
        {
            HttpRequestMessage captured = null;
            string body = null;
            FixtureHandler handler = new FixtureHandler(
                async delegate(HttpRequestMessage request, CancellationToken token)
                {
                    captured = request;
                    body = request.Content == null
                        ? null
                        : await request.Content.ReadAsStringAsync();
                    return JsonResponse(ReadFixture("provider", "ollama-chat.json"));
                });
            using (IAiProvider provider = ProviderFactory.Create(
                Options(ProviderKind.OllamaLocalOrTailscale, "http://localhost:11434/api"),
                handler))
            {
                await provider.ChatAsync(
                    "fixture-ollama-model:latest",
                    TestMessages(),
                    CancellationToken.None);
            }
            Assert(captured.RequestUri.AbsoluteUri == "http://localhost:11434/api/chat", "bad URL");
            Assert(body.Contains("\"stream\":false"), "stream is not false");
            Assert(captured.Headers.Authorization == null, "local auth was forced");
        }

        private static async Task LmStudioRequestShape()
        {
            HttpRequestMessage captured = null;
            string body = null;
            FixtureHandler handler = new FixtureHandler(
                async delegate(HttpRequestMessage request, CancellationToken token)
                {
                    captured = request;
                    body = request.Content == null
                        ? null
                        : await request.Content.ReadAsStringAsync();
                    return JsonResponse(ReadFixture("provider", "lmstudio-chat.json"));
                });
            using (IAiProvider provider = ProviderFactory.Create(
                Options(ProviderKind.LmStudioLocalOrTailscale, "http://localhost:1234/v1"),
                handler))
            {
                await provider.ChatAsync(
                    "fixture-lmstudio-model",
                    TestMessages(),
                    CancellationToken.None);
            }
            Assert(
                captured.RequestUri.AbsoluteUri ==
                    "http://localhost:1234/v1/chat/completions",
                "bad URL");
            Assert(body.Contains("\"stream\":false"), "stream is not false");
        }

        private static async Task OllamaCloudUrlIsFixed()
        {
            string original = Environment.GetEnvironmentVariable("OLLAMA_API_KEY");
            Environment.SetEnvironmentVariable("OLLAMA_API_KEY", "fixture-cloud-key");
            try
            {
                HttpRequestMessage captured = null;
                FixtureHandler handler = new FixtureHandler(
                    delegate(HttpRequestMessage request, CancellationToken token)
                    {
                        captured = request;
                        return Task.FromResult(JsonResponse("{\"models\":[]}"));
                    });
                using (IAiProvider provider = ProviderFactory.Create(
                    Options(ProviderKind.OllamaCloud, "http://redirect.invalid"),
                    handler))
                {
                    ProviderConnectionResult result =
                        await provider.TestConnectionAsync(CancellationToken.None);
                    Assert(result.BaseUri.AbsoluteUri == "https://ollama.com/", "base not fixed");
                }
                Assert(
                    captured.RequestUri.AbsoluteUri == "https://ollama.com/api/tags",
                    "cloud endpoint changed");
                Assert(captured.Headers.Authorization != null, "cloud auth missing");
            }
            finally
            {
                Environment.SetEnvironmentVariable("OLLAMA_API_KEY", original);
            }
        }

        private static async Task OllamaCloudRequiresKey()
        {
            string original = Environment.GetEnvironmentVariable("OLLAMA_API_KEY");
            Environment.SetEnvironmentVariable("OLLAMA_API_KEY", null);
            try
            {
                using (IAiProvider provider = ProviderFactory.Create(
                    Options(ProviderKind.OllamaCloud, "https://ollama.com"),
                    new FixtureHandler(JsonResponse("{\"models\":[]}"))))
                {
                    ProviderException exception = await ExpectProviderExceptionAsync(
                        delegate { return provider.TestConnectionAsync(CancellationToken.None); });
                    Assert(exception.Code == "OLLAMA_API_KEY_MISSING", exception.Code);
                }
            }
            finally
            {
                Environment.SetEnvironmentVariable("OLLAMA_API_KEY", original);
            }
        }

        private static async Task LmStudioTokenIsOptional()
        {
            string original = Environment.GetEnvironmentVariable("LM_STUDIO_API_TOKEN");
            Environment.SetEnvironmentVariable("LM_STUDIO_API_TOKEN", null);
            try
            {
                HttpRequestMessage captured = null;
                FixtureHandler handler = new FixtureHandler(
                    delegate(HttpRequestMessage request, CancellationToken token)
                    {
                        captured = request;
                        return Task.FromResult(JsonResponse("{\"data\":[]}"));
                    });
                using (IAiProvider provider = ProviderFactory.Create(
                    Options(ProviderKind.LmStudioLocalOrTailscale, "http://localhost:1234"),
                    handler))
                {
                    await provider.TestConnectionAsync(CancellationToken.None);
                }
                Assert(captured.Headers.Authorization == null, "optional auth was forced");
            }
            finally
            {
                Environment.SetEnvironmentVariable("LM_STUDIO_API_TOKEN", original);
            }
        }

        private static async Task Http401IsNormalized()
        {
            using (IAiProvider provider = ProviderFactory.Create(
                Options(ProviderKind.OllamaLocalOrTailscale, "http://localhost:11434"),
                new FixtureHandler(JsonResponse("{}", HttpStatusCode.Unauthorized))))
            {
                ProviderException exception = await ExpectProviderExceptionAsync(
                    delegate { return provider.GetModelsAsync(CancellationToken.None); });
                Assert(exception.Code == "HTTP_401", exception.Code);
            }
        }

        private static async Task Http403IsNormalized()
        {
            using (IAiProvider provider = ProviderFactory.Create(
                Options(ProviderKind.LmStudioLocalOrTailscale, "http://localhost:1234"),
                new FixtureHandler(JsonResponse("{}", HttpStatusCode.Forbidden))))
            {
                ProviderException exception = await ExpectProviderExceptionAsync(
                    delegate { return provider.GetModelsAsync(CancellationToken.None); });
                Assert(exception.Code == "HTTP_403", exception.Code);
            }
        }

        private static async Task EmptyModelListIsNormalized()
        {
            using (IAiProvider provider = ProviderFactory.Create(
                Options(ProviderKind.OllamaLocalOrTailscale, "http://localhost:11434"),
                new FixtureHandler(JsonResponse("{\"models\":[]}"))))
            {
                ProviderException exception = await ExpectProviderExceptionAsync(
                    delegate { return provider.GetModelsAsync(CancellationToken.None); });
                Assert(exception.Code == "EMPTY_MODEL_LIST", exception.Code);
            }
        }

        private static async Task UnknownModelIsNormalized()
        {
            using (IAiProvider provider = ProviderFactory.Create(
                Options(ProviderKind.OllamaLocalOrTailscale, "http://localhost:11434"),
                new FixtureHandler(JsonResponse("{}", HttpStatusCode.NotFound))))
            {
                ProviderException exception = await ExpectProviderExceptionAsync(
                    delegate
                    {
                        return provider.ChatAsync(
                            "unknown-fixture-model",
                            TestMessages(),
                            CancellationToken.None);
                    });
                Assert(exception.Code == "UNKNOWN_MODEL", exception.Code);
            }
        }

        private static async Task ResponseSizeLimit()
        {
            ProviderOptions options = Options(
                ProviderKind.OllamaLocalOrTailscale,
                "http://localhost:11434");
            options.MaximumResponseBytes = 1024;
            string oversized = "{\"models\":[{\"name\":\"" + new string('x', 2000) + "\"}]}";
            using (IAiProvider provider = ProviderFactory.Create(
                options,
                new FixtureHandler(JsonResponse(oversized))))
            {
                ProviderException exception = await ExpectProviderExceptionAsync(
                    delegate { return provider.GetModelsAsync(CancellationToken.None); });
                Assert(exception.Code == "RESPONSE_TOO_LARGE", exception.Code);
            }
        }

        private static async Task ProviderTimeout()
        {
            ProviderOptions options = Options(
                ProviderKind.OllamaLocalOrTailscale,
                "http://localhost:11434");
            options.Timeout = TimeSpan.FromMilliseconds(60);
            FixtureHandler handler = new FixtureHandler(
                async delegate(HttpRequestMessage request, CancellationToken token)
                {
                    await Task.Delay(TimeSpan.FromSeconds(5), token);
                    return JsonResponse("{\"models\":[]}");
                });
            using (IAiProvider provider = ProviderFactory.Create(options, handler))
            {
                ProviderException exception = await ExpectProviderExceptionAsync(
                    delegate { return provider.TestConnectionAsync(CancellationToken.None); });
                Assert(exception.Code == "REQUEST_TIMEOUT", exception.Code);
            }
        }

        private static async Task ProviderCancellation()
        {
            FixtureHandler handler = new FixtureHandler(
                async delegate(HttpRequestMessage request, CancellationToken token)
                {
                    await Task.Delay(TimeSpan.FromSeconds(5), token);
                    return JsonResponse("{\"models\":[]}");
                });
            using (IAiProvider provider = ProviderFactory.Create(
                Options(ProviderKind.OllamaLocalOrTailscale, "http://localhost:11434"),
                handler))
            using (CancellationTokenSource cancellation = new CancellationTokenSource())
            {
                cancellation.CancelAfter(60);
                ProviderException exception = await ExpectProviderExceptionAsync(
                    delegate { return provider.TestConnectionAsync(cancellation.Token); });
                Assert(exception.Code == "REQUEST_CANCELLED", exception.Code);
            }
        }

        private static void OfflineProfileIsLocked()
        {
            Ms43OfflineProfile profile = LoadOfflineProfile();
            Assert(profile.ProfileState == "OFFLINE_ONLY", profile.ProfileState);
            Assert(!profile.RuntimeVerified, "offline profile marked runtime verified");
            Assert(!profile.ExecutionEnabled, "offline profile enabled execution");
            Assert(profile.Sgbd == "MS430DS0", profile.Sgbd);
        }

        private static void OfflineProfileCatalog()
        {
            Ms43OfflineProfile profile = LoadOfflineProfile();
            Assert(profile.CandidateJobs.Count == 36, "unexpected candidate job count");
            Assert(profile.Catalog.Count == 53, "unexpected catalog entry count");
            Assert(
                profile.Catalog.Any(
                    item => item.ResultField == "STAT_MOTORDREHZAHL_WERT" &&
                        item.Job == "STATUS_MOTORDREHZAHL" &&
                        item.Unit == "1/min"),
                "engine-speed evidence missing");
            Assert(
                !profile.Catalog.Any(item => item.Group == "Last"),
                "unproven load group was invented");
        }

        private static void OfflineProfileCannotExecute()
        {
            Ms43OfflineProfile profile = LoadOfflineProfile();
            Assert(
                !OfflineExecutionPolicy.CanCreateBridgeRequest(profile),
                "OFFLINE_ONLY profile can create a bridge request");
        }

        private static void ExecutionEnabledProfileRejected()
        {
            string json = ReadFixture("security", "ms43-profile.execution-enabled.json");
            ExpectOfflineProfileException(
                delegate { Ms43OfflineProfileRepository.Parse(json); },
                "OFFLINE_PROFILE_EXECUTION_FLAG");
        }

        private static void KnownFieldNormalization()
        {
            DiagnosticDataEnvelope envelope = ParseContractFixture(
                "synthetic",
                "01-unauffaellig.json");
            DiagnosticDataValue value = envelope.Values.First(
                item => item.RawFieldName == "STAT_MOTORDREHZAHL_WERT");
            Assert(value.NormalizedName == "engine.speed", value.NormalizedName);
            Assert(value.MappingStatus == "mapped", value.MappingStatus);
            Assert(value.SourceJob == "STATUS_MOTORDREHZAHL", value.SourceJob);
        }

        private static void UnknownFieldNormalization()
        {
            DiagnosticDataEnvelope envelope = ParseContractFixture(
                "synthetic",
                "06-unbekanntes-ergebnisfeld.json");
            DiagnosticDataValue value = envelope.Values.First(
                item => item.RawFieldName == "STAT_UNBEKANNT_TEST_WERT");
            Assert(value.NormalizedName == value.RawFieldName, "unknown name was interpreted");
            Assert(value.MappingStatus == "unmapped", value.MappingStatus);
            Assert(Convert.ToDouble(value.Value) == 123.45, "unknown value changed");
            Assert(value.Unit == "fixture-unit", "unknown unit changed");
        }

        private static void NormalDataContractFixture()
        {
            DiagnosticDataEnvelope envelope = ParseContractFixture(
                "synthetic",
                "01-unauffaellig.json");
            Assert(envelope.DataMode == "SYNTHETIC", envelope.DataMode);
            Assert(!envelope.RuntimeVerified, "synthetic marked runtime verified");
            Assert(envelope.Values.Count == 6, "unexpected normal value count");
        }

        private static void CoolantDataContractFixture()
        {
            DiagnosticDataEnvelope envelope = ParseContractFixture(
                "synthetic",
                "02-kuehlmitteltemperatur-erhoeht.json");
            DiagnosticDataValue value = envelope.Values.First(
                item => item.RawFieldName == "STAT_MOTORTEMPERATUR_WERT");
            Assert(Convert.ToDouble(value.Value) == 118.0, "coolant fixture changed");
            Assert(value.Unit == "\u00b0C", value.Unit);
        }

        private static void FuelTrimDataContractFixture()
        {
            DiagnosticDataEnvelope envelope = ParseContractFixture(
                "synthetic",
                "03-gemischkorrektur-leerlauf.json");
            Assert(
                envelope.Values.Any(
                    item => item.RawFieldName == "STAT_LAMBDA_ADD_1_WERT"),
                "additive adaptation missing");
            Assert(
                envelope.Values.Any(
                    item => item.RawFieldName == "STAT_LAMBDA_MUL_1_WERT"),
                "multiplicative adaptation missing");
        }

        private static void WrongUnitRejected()
        {
            ExpectDiagnosticDataException(
                delegate
                {
                    ParseContractFixture("data-contract-invalid", "wrong-unit.json");
                },
                "UNIT_MISMATCH");
        }

        private static void WrongValueTypeRejected()
        {
            ExpectDiagnosticDataException(
                delegate
                {
                    ParseContractFixture(
                        "data-contract-invalid",
                        "wrong-value-type.json");
                },
                "VALUE_TYPE_MISMATCH");
        }

        private static void UnverifiedLiveRejected()
        {
            ExpectDiagnosticDataException(
                delegate
                {
                    ParseContractFixture(
                        "data-contract-invalid",
                        "live-runtime-unverified.json");
                },
                "LIVE_RUNTIME_UNVERIFIED");
        }

        private static void VerifiedLiveAccepted()
        {
            IDictionary<string, object> root = ParseMutableFixture(
                "data-contract-invalid",
                "live-runtime-unverified.json");
            root["runtimeVerified"] = true;
            string json = JsonObject.CreateSerializer().Serialize(root);
            DiagnosticDataEnvelope envelope =
                DiagnosticDataContract.ParseAndNormalize(json, LoadOfflineProfile());
            Assert(envelope.DataMode == "LIVE", envelope.DataMode);
            Assert(envelope.RuntimeVerified, "verified LIVE flag lost");
        }

        private static void MissingDataContractFieldRejected()
        {
            IDictionary<string, object> root = ParseMutableFixture(
                "synthetic",
                "01-unauffaellig.json");
            root.Remove("missingFields");
            string json = JsonObject.CreateSerializer().Serialize(root);
            ExpectDiagnosticDataException(
                delegate
                {
                    DiagnosticDataContract.ParseAndNormalize(json, LoadOfflineProfile());
                },
                "DATA_SCHEMA_INVALID");
        }

        private static void SourceJobMismatchRejected()
        {
            IDictionary<string, object> root = ParseMutableFixture(
                "synthetic",
                "01-unauffaellig.json");
            IDictionary<string, object> value = FirstMutableValue(root);
            value["sourceJob"] = "STATUS_UBATT";
            string json = JsonObject.CreateSerializer().Serialize(root);
            ExpectDiagnosticDataException(
                delegate
                {
                    DiagnosticDataContract.ParseAndNormalize(json, LoadOfflineProfile());
                },
                "SOURCE_JOB_MISMATCH");
        }

        private static void UnexpectedDataContractFieldRejected()
        {
            IDictionary<string, object> root = ParseMutableFixture(
                "synthetic",
                "01-unauffaellig.json");
            root["jobOverride"] = "STATUS_MOTORDREHZAHL";
            string json = JsonObject.CreateSerializer().Serialize(root);
            ExpectDiagnosticDataException(
                delegate
                {
                    DiagnosticDataContract.ParseAndNormalize(json, LoadOfflineProfile());
                },
                "DATA_SCHEMA_INVALID");
        }

        private static void UnprovenSourceJobRejected()
        {
            IDictionary<string, object> root = ParseMutableFixture(
                "synthetic",
                "06-unbekanntes-ergebnisfeld.json");
            IList<object> values = JsonObject.RequireArray(root, "values", "test");
            IDictionary<string, object> unknown =
                values[1] as IDictionary<string, object>;
            Assert(unknown != null, "unknown fixture value is missing");
            unknown["sourceJob"] = "FS_LOESCHEN";
            string json = JsonObject.CreateSerializer().Serialize(root);
            ExpectDiagnosticDataException(
                delegate
                {
                    DiagnosticDataContract.ParseAndNormalize(json, LoadOfflineProfile());
                },
                "SOURCE_JOB_NOT_IN_STATIC_PROFILE");
        }

        private static void NormalizedNameMismatchRejected()
        {
            IDictionary<string, object> root = ParseMutableFixture(
                "synthetic",
                "01-unauffaellig.json");
            IDictionary<string, object> value = FirstMutableValue(root);
            value["normalizedName"] = "invented.name";
            string json = JsonObject.CreateSerializer().Serialize(root);
            ExpectDiagnosticDataException(
                delegate
                {
                    DiagnosticDataContract.ParseAndNormalize(json, LoadOfflineProfile());
                },
                "NORMALIZED_NAME_MISMATCH");
        }

        private static void SyntheticFixturesAreExplicit()
        {
            string directory = FixtureDirectory("synthetic");
            IList<SyntheticCase> cases = SyntheticCaseRepository.Load(directory);
            Assert(cases.Count == 6, "expected six valid synthetic cases");
            foreach (string path in Directory.GetFiles(directory, "*.json"))
            {
                string json = File.ReadAllText(path);
                DiagnosticDataEnvelope envelope =
                    DiagnosticDataContract.ParseAndNormalize(json, LoadOfflineProfile());
                Assert(envelope.DataMode == "SYNTHETIC", "SYNTHETIC marker missing");
                Assert(!envelope.RuntimeVerified, "runtime flag set on synthetic fixture");
                Assert(
                    envelope.Fixture != null &&
                    envelope.Fixture.Disclaimer.Contains("Kuenstliche"),
                    "synthetic disclaimer missing");
            }
        }

        private static void SyntheticIncomplete()
        {
            DiagnosticDataEnvelope envelope = ParseContractFixture(
                "synthetic",
                "04-unvollstaendig.json");
            Assert(envelope.MissingFields.Count == 4, "missing-data declaration absent");
            foreach (string missing in envelope.MissingFields)
            {
                Assert(
                    !envelope.Values.Any(value => value.RawFieldName == missing),
                    "missing field was filled with a replacement: " + missing);
            }
        }

        private static void SyntheticContradictory()
        {
            DiagnosticDataEnvelope envelope = ParseContractFixture(
                "synthetic",
                "05-widerspruechlich.json");
            Assert(
                envelope.Errors.Any(
                    error => error.StartsWith(
                        "SYNTHETIC_CONTRADICTION:",
                        StringComparison.Ordinal)),
                "contradiction declaration absent");
        }

        private static Ms43OfflineProfile LoadOfflineProfile()
        {
            return Ms43OfflineProfileRepository.Load(Path.Combine(
                AppDomain.CurrentDomain.BaseDirectory,
                "config",
                "ms43-profile.offline.json"));
        }

        private static DiagnosticDataEnvelope ParseContractFixture(
            string category,
            string name)
        {
            return DiagnosticDataContract.ParseAndNormalize(
                ReadFixture(category, name),
                LoadOfflineProfile());
        }

        private static IDictionary<string, object> ParseMutableFixture(
            string category,
            string name)
        {
            IDictionary<string, object> root = JsonObject.CreateSerializer()
                .DeserializeObject(ReadFixture(category, name))
                as IDictionary<string, object>;
            Assert(root != null, "fixture root is not an object");
            return root;
        }

        private static IDictionary<string, object> FirstMutableValue(
            IDictionary<string, object> root)
        {
            IList<object> values = JsonObject.RequireArray(root, "values", "test");
            Assert(values.Count > 0, "fixture has no values");
            IDictionary<string, object> value =
                values[0] as IDictionary<string, object>;
            Assert(value != null, "fixture value is not an object");
            return value;
        }

        private static IList<ChatMessage> TestMessages()
        {
            return new List<ChatMessage>
            {
                new ChatMessage("system", DiagnosisContract.SystemPrompt),
                new ChatMessage("user", "{\"classification\":\"SYNTHETIC\"}")
            };
        }

        private static HttpResponseMessage JsonResponse(string json)
        {
            return JsonResponse(json, HttpStatusCode.OK);
        }

        private static HttpResponseMessage JsonResponse(string json, HttpStatusCode status)
        {
            return new HttpResponseMessage(status)
            {
                Content = new StringContent(json, Encoding.UTF8, "application/json")
            };
        }

        private static string FixtureDirectory(string category)
        {
            return Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "fixtures", category);
        }

        private static string ReadFixture(string category, string name)
        {
            return File.ReadAllText(Path.Combine(FixtureDirectory(category), name));
        }

        private static void ExpectProviderException(Action action, string code)
        {
            try
            {
                action();
                throw new InvalidOperationException("ProviderException expected");
            }
            catch (ProviderException exception)
            {
                Assert(exception.Code == code, "expected " + code + ", got " + exception.Code);
            }
        }

        private static async Task<ProviderException> ExpectProviderExceptionAsync(
            Func<Task> action)
        {
            try
            {
                await action();
            }
            catch (ProviderException exception)
            {
                return exception;
            }
            throw new InvalidOperationException("ProviderException expected");
        }

        private static void ExpectBridgeException(Action action, string code)
        {
            try
            {
                action();
                throw new InvalidOperationException("BridgeHealthException expected");
            }
            catch (BridgeHealthException exception)
            {
                Assert(exception.Code == code, "expected " + code + ", got " + exception.Code);
            }
        }

        private static void ExpectDiagnosticDataException(Action action, string code)
        {
            try
            {
                action();
                throw new InvalidOperationException("DiagnosticDataException expected");
            }
            catch (DiagnosticDataException exception)
            {
                Assert(exception.Code == code, "expected " + code + ", got " + exception.Code);
            }
        }

        private static void ExpectOfflineProfileException(Action action, string code)
        {
            try
            {
                action();
                throw new InvalidOperationException("OfflineProfileException expected");
            }
            catch (OfflineProfileException exception)
            {
                Assert(exception.Code == code, "expected " + code + ", got " + exception.Code);
            }
        }

        private static async Task<BridgeHealthException> ExpectBridgeExceptionAsync(
            Func<Task> action)
        {
            try
            {
                await action();
            }
            catch (BridgeHealthException exception)
            {
                return exception;
            }
            throw new InvalidOperationException("BridgeHealthException expected");
        }

        private static void Run(string name, Action test)
        {
            testsRun++;
            try
            {
                test();
                Console.WriteLine("PASS " + name);
            }
            catch (Exception exception)
            {
                failures++;
                Console.Error.WriteLine("FAIL " + name + ": " + exception.Message);
            }
        }

        private static void RunAsync(string name, Func<Task> test)
        {
            Run(name, delegate { test().GetAwaiter().GetResult(); });
        }

        private static void Assert(bool condition, string message)
        {
            if (!condition)
            {
                throw new InvalidOperationException(message);
            }
        }

        private sealed class FixtureHandler : HttpMessageHandler
        {
            private readonly Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>>
                handler;

            public FixtureHandler(HttpResponseMessage response)
            {
                handler = delegate { return Task.FromResult(response); };
            }

            public FixtureHandler(
                Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> handler)
            {
                this.handler = handler;
            }

            protected override Task<HttpResponseMessage> SendAsync(
                HttpRequestMessage request,
                CancellationToken cancellationToken)
            {
                return handler(request, cancellationToken);
            }
        }
    }
}
