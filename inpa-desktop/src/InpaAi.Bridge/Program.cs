using System;
using System.IO;

namespace InpaAi.Bridge
{
    internal static class Program
    {
        private static int Main(string[] args)
        {
            if (IntPtr.Size != 4)
            {
                Console.Error.WriteLine(
                    "InpaAi.Bridge must run as a 32-bit process; actual pointer size is " +
                    IntPtr.Size + ".");
                return 64;
            }

            BridgeOptions options;
            string optionError;
            if (!TryParseOptions(args, out options, out optionError))
            {
                Console.Error.WriteLine(optionError);
                return 2;
            }

            try
            {
                new BridgeApplication(options).Run(Console.In, Console.Out);
                return 0;
            }
            catch (Exception exception)
            {
                Console.Error.WriteLine(exception.ToString());
                return 1;
            }
        }

        private static bool TryParseOptions(
            string[] args,
            out BridgeOptions options,
            out string error)
        {
            options = new BridgeOptions();
            error = null;

            for (int index = 0; index < args.Length; index++)
            {
                string argument = args[index];
                if (String.Equals(argument, "--ediabas-bin", StringComparison.Ordinal))
                {
                    if (!TryReadPath(args, ref index, out error))
                    {
                        return false;
                    }

                    options.EdiabasBinPath = Path.GetFullPath(args[index]);
                }
                else if (String.Equals(argument, "--ecu-path", StringComparison.Ordinal))
                {
                    if (!TryReadPath(args, ref index, out error))
                    {
                        return false;
                    }

                    options.EcuPath = Path.GetFullPath(args[index]);
                }
                else
                {
                    error = "Unknown command-line option: " + argument;
                    return false;
                }
            }

            return true;
        }

        private static bool TryReadPath(
            string[] args,
            ref int index,
            out string error)
        {
            error = null;
            index++;
            if (index >= args.Length || String.IsNullOrWhiteSpace(args[index]))
            {
                error = "A non-empty path must follow the command-line option.";
                return false;
            }

            return true;
        }
    }
}
