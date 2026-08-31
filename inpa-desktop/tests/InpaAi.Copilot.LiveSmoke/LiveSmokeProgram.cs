using System;
using System.Collections.Generic;
using System.Reflection;
using System.Threading.Tasks;
using System.Windows.Forms;
using InpaAi.Copilot;

namespace InpaAi.Copilot.LiveSmoke
{
    internal static class LiveSmokeProgram
    {
        private static int exitCode = 1;

        [STAThread]
        private static int Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            MainForm form = new MainForm();
            form.Shown += async delegate
            {
                try
                {
                    ComboBox provider = GetField<ComboBox>(form, "providerCombo");
                    TextBox address = GetField<TextBox>(form, "addressText");
                    ComboBox model = GetField<ComboBox>(form, "modelCombo");
                    ComboBox synthetic = GetField<ComboBox>(form, "syntheticCombo");
                    TextBox diagnosis = GetField<TextBox>(form, "diagnosisText");
                    TextBox raw = GetField<TextBox>(form, "rawResponseText");
                    Label status = GetField<Label>(form, "statusLabel");
                    Label bridgeStatus = GetField<Label>(form, "bridgeStatusLabel");

                    provider.SelectedIndex = 0;
                    address.Text = "http://127.0.0.1:11434";

                    await InvokeTask(form, "TestConnectionAsync");
                    Assert(
                        status.Text.StartsWith("Verbunden:", StringComparison.Ordinal),
                        "connection test failed: " + status.Text);

                    await InvokeTask(form, "RefreshModelsAsync");
                    Assert(model.Items.Count > 0, "model dropdown is empty");
                    Assert(model.SelectedItem != null, "model dropdown has no selection");
                    string selectedModel = model.SelectedItem.ToString();

                    synthetic.SelectedIndex = 0;
                    Invoke(form, "LoadSelectedSyntheticCase");
                    await InvokeTask(form, "AnalyzeAsync");
                    Assert(
                        raw.Text.Length > 0,
                        "provider returned no chat content; status: " + status.Text);

                    bool diagnosisValid = !diagnosis.Text.StartsWith(
                        "Parserfehler:",
                        StringComparison.Ordinal);
                    await WaitForBridgeStatusAsync(bridgeStatus);

                    Console.WriteLine("Provider=OllamaLocal");
                    Console.WriteLine("BaseUrl=http://127.0.0.1:11434/");
                    Console.WriteLine("ModelCount=" + model.Items.Count);
                    Console.WriteLine("SelectedModel=" + selectedModel);
                    Console.WriteLine("ChatRequests=1");
                    Console.WriteLine("SyntheticCase=synthetic-normal");
                    Console.WriteLine("DiagnosisJsonValid=" + diagnosisValid);
                    Console.WriteLine("BridgeStatus=" + bridgeStatus.Text);
                    Console.WriteLine("FinalStatus=" + status.Text);
                    exitCode = diagnosisValid ? 0 : 2;
                }
                catch (Exception exception)
                {
                    Console.Error.WriteLine(
                        "Live smoke failed: " +
                        SecretRedactor.Redact(
                            Unwrap(exception).Message,
                            SecretRedactor.CurrentRuntimeSecrets()));
                    exitCode = 1;
                }
                finally
                {
                    form.Close();
                }
            };

            Application.Run(form);
            form.Dispose();
            return exitCode;
        }

        private static async Task WaitForBridgeStatusAsync(Label bridgeStatus)
        {
            for (int attempt = 0; attempt < 40; attempt++)
            {
                if (!bridgeStatus.Text.Contains("wird geprueft"))
                {
                    return;
                }
                await Task.Delay(50);
            }
        }

        private static async Task InvokeTask(object instance, string methodName)
        {
            Task task = (Task)Invoke(instance, methodName);
            await task;
        }

        private static object Invoke(object instance, string methodName)
        {
            MethodInfo method = instance.GetType().GetMethod(
                methodName,
                BindingFlags.Instance | BindingFlags.NonPublic);
            Assert(method != null, "method missing: " + methodName);
            return method.Invoke(instance, null);
        }

        private static T GetField<T>(object instance, string name) where T : class
        {
            FieldInfo field = instance.GetType().GetField(
                name,
                BindingFlags.Instance | BindingFlags.NonPublic);
            Assert(field != null, "field missing: " + name);
            T result = field.GetValue(instance) as T;
            Assert(result != null, "field type mismatch: " + name);
            return result;
        }

        private static Exception Unwrap(Exception exception)
        {
            TargetInvocationException target = exception as TargetInvocationException;
            return target != null && target.InnerException != null
                ? target.InnerException
                : exception;
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
