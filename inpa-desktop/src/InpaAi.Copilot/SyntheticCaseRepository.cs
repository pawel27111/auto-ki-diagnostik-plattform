using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Web.Script.Serialization;

namespace InpaAi.Copilot
{
    internal sealed class SyntheticCase
    {
        public string Id { get; set; }
        public string Label { get; set; }
        public string Json { get; set; }

        public override string ToString()
        {
            return Label;
        }
    }

    internal static class SyntheticCaseRepository
    {
        public static IList<SyntheticCase> Load(string directory)
        {
            IList<SyntheticCase> cases = new List<SyntheticCase>();
            if (!Directory.Exists(directory))
            {
                return cases;
            }

            JavaScriptSerializer serializer = JsonObject.CreateSerializer();
            string[] paths = Directory.GetFiles(directory, "*.json");
            Array.Sort(paths, StringComparer.OrdinalIgnoreCase);
            foreach (string path in paths)
            {
                string json = File.ReadAllText(path, Encoding.UTF8);
                IDictionary<string, object> root =
                    serializer.DeserializeObject(json) as IDictionary<string, object>;
                if (root == null)
                {
                    continue;
                }

                object dataMode;
                object runtimeVerified;
                object fixtureValue;
                IDictionary<string, object> fixture;
                object id;
                object label;
                if (!root.TryGetValue("dataMode", out dataMode) ||
                    !String.Equals(dataMode as string, "SYNTHETIC", StringComparison.Ordinal) ||
                    !root.TryGetValue("runtimeVerified", out runtimeVerified) ||
                    !(runtimeVerified is bool) ||
                    (bool)runtimeVerified ||
                    !root.TryGetValue("fixture", out fixtureValue) ||
                    (fixture = fixtureValue as IDictionary<string, object>) == null ||
                    !fixture.TryGetValue("id", out id) ||
                    !fixture.TryGetValue("label", out label))
                {
                    continue;
                }

                cases.Add(new SyntheticCase
                {
                    Id = id as string,
                    Label = "[SYNTHETIC] " + (label as string),
                    Json = json
                });
            }

            return cases;
        }
    }
}
