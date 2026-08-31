using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Threading;
using Ediabas;

namespace InpaAi.Bridge
{
    internal sealed class EdiabasClient
    {
        private readonly BridgeOptions options;

        public EdiabasClient(BridgeOptions options)
        {
            this.options = options;
        }

        public IList<IDictionary<string, object>> Execute(AllowedOperation operation)
        {
            ValidateOperation(operation);
            ValidatePaths(operation);

            if (!NativeMethods.SetDllDirectory(options.EdiabasBinPath))
            {
                throw new EdiabasException(
                    "DLL_SEARCH_PATH_FAILED",
                    "SetDllDirectory failed with Win32 error " + Marshal.GetLastWin32Error() + ".",
                    "native-loader");
            }

            bool initializationAttempted = false;
            try
            {
                initializationAttempted = true;
                if (!API.apiInit())
                {
                    throw CreateApiException("EDIABAS_INIT_FAILED", "initialization");
                }

                // apiSetConfig changes only this API session; no INI or registry is written.
                if (!API.apiSetConfig("EcuPath", options.EcuPath))
                {
                    throw CreateApiException("ECU_PATH_CONFIG_FAILED", "session-config");
                }

                API.apiJob(operation.Ecu, operation.Job, String.Empty, String.Empty);
                WaitForCompletion(operation.TimeoutMilliseconds);

                int state = API.apiState();
                if (state == API.APIERROR)
                {
                    throw CreateApiException("EDIABAS_JOB_FAILED", "job");
                }

                if (state != API.APIREADY)
                {
                    throw new EdiabasException(
                        "EDIABAS_UNEXPECTED_STATE",
                        "EDIABAS returned unexpected state " + state + ".",
                        "job");
                }

                return ReadResults();
            }
            finally
            {
                if (initializationAttempted)
                {
                    try
                    {
                        API.apiEnd();
                    }
                    catch (Exception cleanupException)
                    {
                        Console.Error.WriteLine(
                            "EDIABAS cleanup failed: " + cleanupException.Message);
                    }
                }

                NativeMethods.SetDllDirectory(null);
            }
        }

        private static void ValidateOperation(AllowedOperation operation)
        {
            if (!new CommandPolicy().IsExecutable(operation))
            {
                throw new EdiabasException(
                    "OPERATION_NOT_ALLOWED",
                    "The ECU/job tuple is not present in the fixed read-only allowlist.",
                    "allowlist");
            }
        }

        private void ValidatePaths(AllowedOperation operation)
        {
            string apiPath = Path.Combine(options.EdiabasBinPath, "api32.dll");
            string prgPath = Path.Combine(options.EcuPath, operation.PrgFile);

            if (!File.Exists(apiPath))
            {
                throw new EdiabasException(
                    "API32_NOT_FOUND",
                    "Required file was not found: " + apiPath,
                    "path-validation");
            }

            if (!File.Exists(prgPath))
            {
                throw new EdiabasException(
                    operation.Discovery ? "DISCOVERY_PRG_NOT_FOUND" : "TMODE_NOT_FOUND",
                    "Required file was not found: " + prgPath,
                    operation.Discovery ? "probe-validation" : "path-validation");
            }

            if (operation.Discovery)
            {
                string actualHash = ComputeSha256(prgPath);
                if (!String.Equals(
                    actualHash,
                    operation.ExpectedSha256,
                    StringComparison.Ordinal))
                {
                    throw new EdiabasException(
                        "DISCOVERY_PRG_UNVERIFIED",
                        "The installed PRG does not match the offline-verified manifest hash.",
                        "probe-validation");
                }
            }
        }

        private static string ComputeSha256(string path)
        {
            using (FileStream stream = File.OpenRead(path))
            using (SHA256 algorithm = SHA256.Create())
            {
                return BitConverter.ToString(algorithm.ComputeHash(stream)).Replace("-", String.Empty);
            }
        }

        private static void WaitForCompletion(int timeoutMilliseconds)
        {
            Stopwatch stopwatch = Stopwatch.StartNew();
            while (API.apiState() == API.APIBUSY)
            {
                if (stopwatch.ElapsedMilliseconds > timeoutMilliseconds)
                {
                    API.apiBreak();
                    throw new EdiabasException(
                        "EDIABAS_TIMEOUT",
                        "EDIABAS job exceeded the " + timeoutMilliseconds + " ms timeout.",
                        "job-wait");
                }

                Thread.Sleep(10);
            }
        }

        private static IList<IDictionary<string, object>> ReadResults()
        {
            ushort resultSetCount;
            if (!API.apiResultSets(out resultSetCount))
            {
                throw CreateApiException("RESULT_SET_ENUMERATION_FAILED", "result-reading");
            }

            IList<IDictionary<string, object>> resultSets =
                new List<IDictionary<string, object>>();

            for (int resultSetIndex = 0; resultSetIndex <= resultSetCount; resultSetIndex++)
            {
                ushort resultSet = (ushort)resultSetIndex;
                ushort resultCount;
                if (!API.apiResultNumber(out resultCount, resultSet))
                {
                    throw CreateApiException("RESULT_ENUMERATION_FAILED", "result-reading");
                }

                IDictionary<string, object> fields =
                    new Dictionary<string, object>(StringComparer.Ordinal);

                for (ushort index = 1; index <= resultCount; index++)
                {
                    string name;
                    if (!API.apiResultName(out name, index, resultSet))
                    {
                        throw CreateApiException("RESULT_NAME_FAILED", "result-reading");
                    }

                    int format;
                    if (!API.apiResultFormat(out format, name, resultSet))
                    {
                        throw CreateApiException("RESULT_FORMAT_FAILED", "result-reading");
                    }

                    fields[name] = ReadValue(name, resultSet, format);
                }

                resultSets.Add(fields);
            }

            return resultSets;
        }

        private static object ReadValue(string name, ushort resultSet, int format)
        {
            bool success;
            object value;

            switch (format)
            {
                case API.APIFORMAT_CHAR:
                    char charValue;
                    success = API.apiResultChar(out charValue, name, resultSet);
                    value = charValue.ToString();
                    break;
                case API.APIFORMAT_BYTE:
                    byte byteValue;
                    success = API.apiResultByte(out byteValue, name, resultSet);
                    value = byteValue;
                    break;
                case API.APIFORMAT_INTEGER:
                    short intValue;
                    success = API.apiResultInt(out intValue, name, resultSet);
                    value = intValue;
                    break;
                case API.APIFORMAT_WORD:
                    ushort wordValue;
                    success = API.apiResultWord(out wordValue, name, resultSet);
                    value = wordValue;
                    break;
                case API.APIFORMAT_LONG:
                    int longValue;
                    success = API.apiResultLong(out longValue, name, resultSet);
                    value = longValue;
                    break;
                case API.APIFORMAT_DWORD:
                    uint dwordValue;
                    success = API.apiResultDWord(out dwordValue, name, resultSet);
                    value = dwordValue;
                    break;
                case API.APIFORMAT_TEXT:
                    string textValue;
                    success = API.apiResultText(out textValue, name, resultSet, String.Empty);
                    value = textValue;
                    break;
                case API.APIFORMAT_BINARY:
                    byte[] binaryValue;
                    ushort binaryLength;
                    success = API.apiResultBinary(
                        out binaryValue,
                        out binaryLength,
                        name,
                        resultSet);
                    value = Convert.ToBase64String(binaryValue, 0, binaryLength);
                    break;
                case API.APIFORMAT_REAL:
                    double realValue;
                    success = API.apiResultReal(out realValue, name, resultSet);
                    value = realValue;
                    break;
                default:
                    throw new EdiabasException(
                        "RESULT_FORMAT_UNSUPPORTED",
                        "Unsupported EDIABAS result format " + format + " for field " + name + ".",
                        "result-reading");
            }

            if (!success)
            {
                throw CreateApiException("RESULT_VALUE_FAILED", "result-reading");
            }

            return value;
        }

        private static EdiabasException CreateApiException(
            string fallbackCode,
            string phase)
        {
            int errorCode = API.apiErrorCode();
            string errorText = API.apiErrorText();
            string code = errorCode == 0 ? fallbackCode : "EDIABAS_" + errorCode;
            string message = String.IsNullOrEmpty(errorText)
                ? fallbackCode
                : errorText;
            return new EdiabasException(code, message, phase);
        }

        private static class NativeMethods
        {
            [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
            [return: MarshalAs(UnmanagedType.Bool)]
            internal static extern bool SetDllDirectory(string pathName);
        }
    }
}
