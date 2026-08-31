using System;
using System.Collections;
using System.Collections.Generic;
using System.Web.Script.Serialization;

namespace InpaAi.Copilot
{
    internal static class JsonObject
    {
        public static JavaScriptSerializer CreateSerializer()
        {
            return new JavaScriptSerializer
            {
                MaxJsonLength = ProviderOptions.DefaultMaximumResponseBytes,
                RecursionLimit = 64
            };
        }

        public static IDictionary<string, object> ParseObject(string json, string phase)
        {
            if (String.IsNullOrWhiteSpace(json))
            {
                throw new ProviderException(
                    "PROVIDER_JSON_INVALID",
                    "Der Provider hat eine leere JSON-Antwort geliefert.",
                    phase);
            }

            try
            {
                object value = CreateSerializer().DeserializeObject(json);
                IDictionary<string, object> result = value as IDictionary<string, object>;
                if (result == null)
                {
                    throw new ProviderException(
                        "PROVIDER_JSON_INVALID",
                        "Die Provider-Antwort ist kein JSON-Objekt.",
                        phase);
                }

                return result;
            }
            catch (ProviderException)
            {
                throw;
            }
            catch (Exception exception)
            {
                throw new ProviderException(
                    "PROVIDER_JSON_INVALID",
                    "Die Provider-Antwort enthaelt ungueltiges JSON.",
                    phase,
                    null,
                    exception);
            }
        }

        public static IDictionary<string, object> RequireObject(
            IDictionary<string, object> source,
            string name,
            string phase)
        {
            object value;
            IDictionary<string, object> result;
            if (!source.TryGetValue(name, out value) ||
                (result = value as IDictionary<string, object>) == null)
            {
                throw Missing(name, "JSON-Objekt", phase);
            }

            return result;
        }

        public static IList<object> RequireArray(
            IDictionary<string, object> source,
            string name,
            string phase)
        {
            object value;
            if (!source.TryGetValue(name, out value))
            {
                throw Missing(name, "JSON-Array", phase);
            }

            object[] objectArray = value as object[];
            if (objectArray != null)
            {
                return new List<object>(objectArray);
            }

            ArrayList arrayList = value as ArrayList;
            if (arrayList != null)
            {
                return arrayList.ToArray();
            }

            throw Missing(name, "JSON-Array", phase);
        }

        public static string RequireString(
            IDictionary<string, object> source,
            string name,
            string phase)
        {
            object value;
            string result;
            if (!source.TryGetValue(name, out value) ||
                (result = value as string) == null ||
                String.IsNullOrWhiteSpace(result))
            {
                throw Missing(name, "nicht leere Zeichenkette", phase);
            }

            return result;
        }

        private static ProviderException Missing(
            string name,
            string expected,
            string phase)
        {
            return new ProviderException(
                "PROVIDER_JSON_INVALID",
                "Feld '" + name + "' fehlt oder ist keine " + expected + ".",
                phase);
        }
    }
}
