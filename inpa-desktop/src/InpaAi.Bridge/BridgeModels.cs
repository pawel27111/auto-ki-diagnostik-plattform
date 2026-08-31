using System;
using System.Collections.Generic;

namespace InpaAi.Bridge
{
    internal sealed class BridgeRequest
    {
        public string Command { get; set; }
    }

    internal sealed class AllowedOperation
    {
        public AllowedOperation(
            string command,
            string ecu,
            string job,
            string prgFile,
            string expectedSha256,
            int timeoutMilliseconds,
            bool discovery)
        {
            Command = command;
            Ecu = ecu;
            Job = job;
            PrgFile = prgFile;
            ExpectedSha256 = expectedSha256;
            TimeoutMilliseconds = timeoutMilliseconds;
            Discovery = discovery;
        }

        public string Command { get; private set; }
        public string Ecu { get; private set; }
        public string Job { get; private set; }
        public string PrgFile { get; private set; }
        public string ExpectedSha256 { get; private set; }
        public int TimeoutMilliseconds { get; private set; }
        public bool Discovery { get; private set; }
    }

    internal sealed class BridgeError
    {
        public string code { get; set; }
        public string message { get; set; }
        public string phase { get; set; }
    }

    internal sealed class BridgeResponse
    {
        public bool success { get; set; }
        public string command { get; set; }
        public string ecu { get; set; }
        public string job { get; set; }
        public long durationMs { get; set; }
        public object results { get; set; }
        public BridgeError error { get; set; }

        public static BridgeResponse Success(
            string command,
            string ecu,
            string job,
            long durationMs,
            object results)
        {
            return new BridgeResponse
            {
                success = true,
                command = command,
                ecu = ecu,
                job = job,
                durationMs = durationMs,
                results = results,
                error = null
            };
        }

        public static BridgeResponse Failure(
            string command,
            string ecu,
            string job,
            long durationMs,
            string code,
            string message,
            string phase)
        {
            return new BridgeResponse
            {
                success = false,
                command = command,
                ecu = ecu,
                job = job,
                durationMs = durationMs,
                results = null,
                error = new BridgeError
                {
                    code = code,
                    message = message,
                    phase = phase
                }
            };
        }
    }

    internal sealed class EdiabasException : Exception
    {
        public EdiabasException(string code, string message, string phase)
            : base(message)
        {
            Code = code;
            Phase = phase;
        }

        public string Code { get; private set; }
        public string Phase { get; private set; }
    }

    internal sealed class BridgeOptions
    {
        public const string DefaultEdiabasBinPath = @"C:\EDIABAS\Bin";
        public const string DefaultEcuPath = @"C:\EDIABAS\ECU";

        public BridgeOptions()
        {
            EdiabasBinPath = DefaultEdiabasBinPath;
            EcuPath = DefaultEcuPath;
        }

        public string EdiabasBinPath { get; set; }
        public string EcuPath { get; set; }
    }
}
