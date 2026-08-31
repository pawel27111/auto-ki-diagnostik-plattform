using System;
using System.Diagnostics;
using System.Threading;

internal static class FakeBridge
{
    private static int Main()
    {
        string executableName = Process.GetCurrentProcess().MainModule.ModuleName;
        string request = Console.ReadLine();

        if (executableName.IndexOf("Hang", StringComparison.OrdinalIgnoreCase) >= 0)
        {
            Thread.Sleep(30000);
            return 0;
        }

        if (!String.Equals(request, "{\"command\":\"health\"}", StringComparison.Ordinal))
        {
            Console.Error.WriteLine("Unexpected test request.");
            return 2;
        }

        Console.WriteLine(
            "{\"success\":true,\"command\":\"health\",\"results\":" +
            "{\"processBitness\":32,\"mode\":\"FIXED_READ_ONLY_DISCOVERY\"," +
            "\"ecuPath\":\"C:\\\\EDIABAS\\\\ECU\"," +
            "\"discoveryManifestVersion\":\"2C.2\",\"discoveryProbeCount\":68}}");

        if (executableName.IndexOf("Extra", StringComparison.OrdinalIgnoreCase) >= 0)
        {
            Console.WriteLine("{\"unexpected\":true}");
        }

        return 0;
    }
}
