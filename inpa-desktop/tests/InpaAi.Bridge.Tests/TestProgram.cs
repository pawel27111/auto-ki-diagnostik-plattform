using System;
using System.IO;
using InpaAi.Bridge;
using InpaAi.Shared;

namespace InpaAi.Bridge.Tests
{
    internal static class TestProgram
    {
        private static int failures;
        private static int testsRun;

        private static int Main()
        {
            Run("allowlist accepts health", AllowlistAcceptsHealth);
            Run("allowlist maps TMODE INFO exactly", AllowlistMapsInfo);
            Run("allowlist maps TMODE INITIALISIERUNG exactly", AllowlistMapsInitialization);
            Run("allowlist rejects write-like command", AllowlistRejectsWriteCommand);
            Run("JSON parses valid request", JsonParsesValidRequest);
            Run("JSON rejects malformed request", JsonRejectsMalformedRequest);
            Run("application returns one line per request", ApplicationReturnsOneLinePerRequest);
            Run("application rejects unknown command", ApplicationRejectsUnknownCommand);
            Run("allowlist rejects MS430DS0 command", RejectsMs430Ds0);
            Run("allowlist rejects IDENT command", RejectsIdent);
            Run("allowlist rejects STATUS command", RejectsStatusCommand);
            Run("allowlist rejects arbitrary SGBD command", RejectsArbitrarySgbd);
            Run("JSON job properties cannot alter health", ExtraPropertiesCannotAlterHealth);
            Run("health confirms x86 test process", HealthConfirmsX86Process);
            Run("all discovery probes map to exact read-only tuples", DiscoveryMappingsAreExact);
            Run("forged discovery job is rejected", ForgedDiscoveryJobIsRejected);
            Run("JSON properties cannot alter discovery tuple", ExtraPropertiesCannotAlterDiscovery);

            Console.WriteLine(
                "Tests: " + (testsRun - failures) + " passed, " + failures + " failed.");
            return failures == 0 ? 0 : 1;
        }

        private static void AllowlistAcceptsHealth()
        {
            AllowedOperation operation;
            Assert(new CommandPolicy().TryResolve("health", out operation), "health rejected");
            Assert(operation.Ecu == null, "health must not select an ECU");
            Assert(operation.Job == null, "health must not select a job");
        }

        private static void AllowlistMapsInfo()
        {
            AllowedOperation operation;
            Assert(new CommandPolicy().TryResolve("tmode-info", out operation), "INFO rejected");
            Assert(operation.Ecu == "TMODE", "unexpected ECU");
            Assert(operation.Job == "INFO", "unexpected job");
        }

        private static void AllowlistMapsInitialization()
        {
            AllowedOperation operation;
            Assert(
                new CommandPolicy().TryResolve("tmode-initialisierung", out operation),
                "INITIALISIERUNG rejected");
            Assert(operation.Ecu == "TMODE", "unexpected ECU");
            Assert(operation.Job == "INITIALISIERUNG", "unexpected job");
        }

        private static void AllowlistRejectsWriteCommand()
        {
            AllowedOperation operation;
            Assert(
                !new CommandPolicy().TryResolve("STEUERN_RESET", out operation),
                "write-like command was accepted");
            Assert(!new CommandPolicy().TryResolve("FS_LOESCHEN", out operation), "delete accepted");
            Assert(!new CommandPolicy().TryResolve("MS430DS0", out operation), "MS43 accepted");
        }

        private static void JsonParsesValidRequest()
        {
            BridgeRequest request;
            string error;
            Assert(
                new JsonLineProtocol().TryParseRequest(
                    "{\"command\":\"health\"}",
                    out request,
                    out error),
                error);
            Assert(request.Command == "health", "command changed during parsing");
        }

        private static void JsonRejectsMalformedRequest()
        {
            BridgeRequest request;
            string error;
            Assert(
                !new JsonLineProtocol().TryParseRequest("{", out request, out error),
                "malformed JSON accepted");
            Assert(!String.IsNullOrEmpty(error), "parse error missing");
        }

        private static void ApplicationReturnsOneLinePerRequest()
        {
            StringReader input = new StringReader(
                "{\"command\":\"health\"}\n{\"command\":\"health\"}\n");
            StringWriter output = new StringWriter();
            new BridgeApplication(new BridgeOptions()).Run(input, output);
            string[] lines = output.ToString().Split(
                new[] { Environment.NewLine },
                StringSplitOptions.RemoveEmptyEntries);
            Assert(lines.Length == 2, "expected exactly two response lines");
        }

        private static void ApplicationRejectsUnknownCommand()
        {
            BridgeResponse response = new BridgeApplication(new BridgeOptions())
                .HandleLine("{\"command\":\"FS_LOESCHEN\"}");
            Assert(!response.success, "unknown command succeeded");
            Assert(response.error.code == "COMMAND_NOT_ALLOWED", "wrong error code");
            Assert(response.error.phase == "allowlist", "wrong error phase");
        }

        private static void HealthConfirmsX86Process()
        {
            Assert(IntPtr.Size == 4, "test process is not x86");
            BridgeResponse response = new BridgeApplication(new BridgeOptions())
                .HandleLine("{\"command\":\"health\"}");
            Assert(response.success, "health failed");
            System.Collections.Generic.IDictionary<string, object> health =
                response.results as System.Collections.Generic.IDictionary<string, object>;
            Assert(health != null, "health results missing");
            Assert(
                (string)health["mode"] == "FIXED_READ_ONLY_DISCOVERY",
                "read-only discovery mode missing");
            Assert(
                Convert.ToInt32(health["discoveryProbeCount"]) ==
                    E46DiscoveryManifest.All.Count,
                "manifest count mismatch");
        }

        private static void DiscoveryMappingsAreExact()
        {
            CommandPolicy policy = new CommandPolicy();
            foreach (DiscoveryProbeDefinition probe in E46DiscoveryManifest.All)
            {
                AllowedOperation operation;
                Assert(policy.TryResolve(probe.Command, out operation), probe.Command);
                Assert(operation.Discovery, "probe is not marked discovery");
                Assert(operation.Ecu == probe.Sgbd, "SGBD changed: " + probe.Command);
                Assert(operation.Job == probe.Job, "job changed: " + probe.Command);
                Assert(operation.PrgFile == probe.PrgFile, "PRG changed: " + probe.Command);
                Assert(
                    operation.ExpectedSha256 == probe.PrgSha256,
                    "PRG hash changed: " + probe.Command);
                Assert(operation.TimeoutMilliseconds == probe.TimeoutMilliseconds, "timeout changed");
                Assert(policy.IsExecutable(operation), "mapped operation is not executable");
                Assert(
                    operation.Job == "IDENT" || operation.Job == "IDENT_AIF" ||
                    (operation.Ecu == "CDC" && operation.Job == "SER_NR_DOM_LESEN"),
                    "non-identification job in discovery allowlist");
            }
        }

        private static void ForgedDiscoveryJobIsRejected()
        {
            DiscoveryProbeDefinition probe = E46DiscoveryManifest.All[0];
            AllowedOperation forged = new AllowedOperation(
                probe.Command,
                probe.Sgbd,
                "FS_LOESCHEN",
                probe.PrgFile,
                probe.PrgSha256,
                probe.TimeoutMilliseconds,
                true);
            Assert(
                !new CommandPolicy().IsExecutable(forged),
                "forged write-like discovery tuple accepted");
        }

        private static void ExtraPropertiesCannotAlterDiscovery()
        {
            DiscoveryProbeDefinition probe = E46DiscoveryManifest.All[0];
            BridgeRequest request;
            string error;
            string json = "{\"command\":\"" + probe.Command +
                "\",\"sgbd\":\"CUSTOM\",\"job\":\"FS_LOESCHEN\"}";
            Assert(
                new JsonLineProtocol().TryParseRequest(json, out request, out error),
                error);
            AllowedOperation operation;
            Assert(new CommandPolicy().TryResolve(request.Command, out operation), "not resolved");
            Assert(operation.Ecu == probe.Sgbd, "extra SGBD changed fixed tuple");
            Assert(operation.Job == probe.Job, "extra job changed fixed tuple");
        }

        private static void RejectsMs430Ds0()
        {
            AssertCommandRejected("MS430DS0");
        }

        private static void RejectsIdent()
        {
            AssertCommandRejected("IDENT");
        }

        private static void RejectsStatusCommand()
        {
            AssertCommandRejected("STATUS_MOTORDREHZAHL");
        }

        private static void RejectsArbitrarySgbd()
        {
            AssertCommandRejected("DME_CUSTOM");
        }

        private static void ExtraPropertiesCannotAlterHealth()
        {
            BridgeResponse response = new BridgeApplication(new BridgeOptions()).HandleLine(
                "{\"command\":\"health\",\"sgbd\":\"MS430DS0\",\"job\":\"IDENT\"}");
            Assert(response.success, "health with extra properties failed");
            Assert(response.ecu == null, "extra sgbd altered health ECU");
            Assert(response.job == null, "extra job altered health job");
        }

        private static void AssertCommandRejected(string command)
        {
            BridgeResponse response = new BridgeApplication(new BridgeOptions()).HandleLine(
                "{\"command\":\"" + command + "\"}");
            Assert(!response.success, command + " unexpectedly succeeded");
            Assert(response.error.code == "COMMAND_NOT_ALLOWED", "wrong error code");
            Assert(response.error.phase == "allowlist", "wrong error phase");
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

        private static void Assert(bool condition, string message)
        {
            if (!condition)
            {
                throw new InvalidOperationException(message);
            }
        }
    }
}
