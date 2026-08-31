using System;
using System.Collections.Generic;
using System.Web.Script.Serialization;

namespace InpaAi.Bridge
{
    internal sealed class JsonLineProtocol
    {
        private readonly JavaScriptSerializer serializer = new JavaScriptSerializer();

        public bool TryParseRequest(string line, out BridgeRequest request, out string error)
        {
            request = null;
            error = null;

            if (String.IsNullOrWhiteSpace(line))
            {
                error = "Request line is empty.";
                return false;
            }

            try
            {
                object parsed = serializer.DeserializeObject(line);
                IDictionary<string, object> values = parsed as IDictionary<string, object>;
                if (values == null)
                {
                    error = "Request must be a JSON object.";
                    return false;
                }

                object commandValue;
                if (!values.TryGetValue("command", out commandValue) || !(commandValue is string))
                {
                    error = "Property 'command' must be a string.";
                    return false;
                }

                string command = (string)commandValue;
                if (String.IsNullOrWhiteSpace(command))
                {
                    error = "Property 'command' must not be empty.";
                    return false;
                }

                request = new BridgeRequest { Command = command };
                return true;
            }
            catch (Exception exception)
            {
                error = "Invalid JSON: " + exception.Message;
                return false;
            }
        }

        public string SerializeResponse(BridgeResponse response)
        {
            return serializer.Serialize(response);
        }
    }
}
