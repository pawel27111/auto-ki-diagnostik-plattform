using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Reflection;
using System.Threading;
using System.Windows.Forms;
using InpaAi.Copilot;

namespace InpaAi.Copilot.UiSmoke
{
    internal static class UiSmokeProgram
    {
        [STAThread]
        private static int Main()
        {
            try
            {
                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                using (MainForm form = new MainForm())
                {
                    form.Show();
                    Application.DoEvents();
                    Thread.Sleep(500);
                    Application.DoEvents();
                    form.PerformLayout();

                    ComboBox provider = GetField<ComboBox>(form, "providerCombo");
                    ComboBox model = GetField<ComboBox>(form, "modelCombo");
                    ComboBox synthetic = GetField<ComboBox>(form, "syntheticCombo");
                    TextBox address = GetField<TextBox>(form, "addressText");
                    Label location = GetField<Label>(form, "locationLabel");
                    Label profileStatus =
                        GetField<Label>(form, "ms43ProfileStatusLabel");
                    Label dataMode = GetField<Label>(form, "dataModeLabel");
                    Button liveAccess = GetField<Button>(form, "liveAccessButton");
                    DataGridView catalog = GetField<DataGridView>(form, "catalogGrid");
                    TextBox prompt = GetField<TextBox>(form, "promptText");
                    TextBox catalogSource =
                        GetField<TextBox>(form, "catalogSourceText");
                    Label discoveryStatus =
                        GetField<Label>(form, "vehicleDiscoveryStatusLabel");
                    Label reachableCount =
                        GetField<Label>(form, "reachableCountLabel");
                    Label diagnosticGroups =
                        GetField<Label>(form, "diagnosticGroupsLabel");
                    DataGridView discovery =
                        GetField<DataGridView>(form, "discoveryGrid");

                    Assert(provider.Items.Count == 3, "provider choices missing");
                    Assert(
                        model.DropDownStyle == ComboBoxStyle.DropDownList,
                        "model is not dropdown");
                    Assert(model.Items.Count == 0, "model names are hardcoded");
                    Assert(synthetic.Items.Count == 6, "synthetic choices missing");
                    Assert(
                        profileStatus.Text ==
                            "MS43-Profil: OFFLINE / nicht laufzeitverifiziert",
                        "offline profile status missing");
                    Assert(
                        dataMode.Text.StartsWith("Datenmodus: SYNTHETIC", StringComparison.Ordinal),
                        "synthetic data-mode label missing");
                    Assert(!liveAccess.Enabled, "vehicle access button is enabled");
                    Assert(
                        discoveryStatus.Text == "Fahrzeug nicht geprueft",
                        "initial vehicle state missing");
                    Assert(
                        reachableCount.Text == "Erreichbare Steuergeraete: 0",
                        "initial reachable count missing");
                    Assert(
                        diagnosticGroups.Text.Contains("gesperrt"),
                        "diagnostic groups are not locked");
                    Assert(discovery.Rows.Count == 68, "discovery manifest rows missing");
                    Assert(catalog.Rows.Count == 53, "static catalog is incomplete");
                    Assert(
                        catalogSource.Text.Contains("IPO SHA-256:"),
                        "catalog source details missing");

                    Invoke(form, "LoadSelectedSyntheticCase");
                    Assert(
                        dataMode.Text ==
                            "Datenmodus: SYNTHETIC / keine Fahrzeugdaten",
                        "synthetic fixture mode was not applied");
                    Assert(
                        prompt.Text.Contains("\"schemaVersion\": \"1.0\""),
                        "synthetic data contract was not loaded");

                    provider.SelectedIndex = 1;
                    Assert(address.Text == "https://ollama.com", "cloud address is not fixed");
                    Assert(!address.Enabled, "cloud address can be edited");
                    Assert(location.Text == "CLOUD", "cloud label missing");

                    provider.SelectedIndex = 2;
                    Assert(
                        address.Text == "http://127.0.0.1:1234",
                        "LM Studio default missing");
                    Assert(address.Enabled, "LM Studio address is locked");

                    SplitContainer split = FindControl<SplitContainer>(form);
                    double leftRatio =
                        (double)split.SplitterDistance / (double)split.ClientSize.Width;
                    Assert(leftRatio > 0.38 && leftRatio < 0.52, "workspace split is unbalanced");

                    foreach (string text in new[]
                    {
                        "Verbindung testen",
                        "Modelle aktualisieren",
                        "Analysieren",
                        "Abbrechen",
                        "Bridge pruefen",
                        "Erneut pruefen",
                        "Erkennung abbrechen",
                        "Diagnose-JSON importieren",
                        "Fahrzeugtest noch nicht freigegeben"
                    })
                    {
                        Assert(FindControlByText(form, text) != null, "button missing: " + text);
                    }

                    form.Size = new Size(1180, 790);
                    form.PerformLayout();
                    SaveScreenshot(form, "InpaAi.Copilot.ui-smoke.png");

                    TabControl tabs = FindControl<TabControl>(form);
                    Assert(tabs != null && tabs.TabPages.Count == 4, "discovery tab missing");
                    tabs.SelectedIndex = 3;
                    Application.DoEvents();
                    SaveScreenshot(form, "InpaAi.Copilot.catalog-smoke.png");
                    form.Close();
                    Application.DoEvents();
                }

                VerifyProductionExecutableStarts();
                Console.WriteLine(
                    "PASS WinForms controls, layout render and production executable launch");
                return 0;
            }
            catch (Exception exception)
            {
                Console.Error.WriteLine("FAIL WinForms smoke: " + exception);
                return 1;
            }
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

        private static object Invoke(object instance, string methodName)
        {
            MethodInfo method = instance.GetType().GetMethod(
                methodName,
                BindingFlags.Instance | BindingFlags.NonPublic);
            Assert(method != null, "method missing: " + methodName);
            return method.Invoke(instance, null);
        }

        private static void SaveScreenshot(Form form, string fileName)
        {
            using (Bitmap bitmap = new Bitmap(form.Width, form.Height))
            {
                form.DrawToBitmap(
                    bitmap,
                    new Rectangle(0, 0, bitmap.Width, bitmap.Height));
                bitmap.Save(Path.Combine(
                    AppDomain.CurrentDomain.BaseDirectory,
                    fileName));
            }
        }

        private static void VerifyProductionExecutableStarts()
        {
            string executable = Path.GetFullPath(Path.Combine(
                AppDomain.CurrentDomain.BaseDirectory,
                "..",
                "copilot",
                "InpaAi.Copilot.exe"));
            Assert(File.Exists(executable), "production Copilot executable missing");

            Process process = Process.Start(new ProcessStartInfo
            {
                FileName = executable,
                UseShellExecute = false
            });
            Assert(process != null, "production Copilot did not start");

            using (process)
            {
                try
                {
                    DateTime deadline = DateTime.UtcNow.AddSeconds(10);
                    while (DateTime.UtcNow < deadline)
                    {
                        process.Refresh();
                        if (process.HasExited)
                        {
                            throw new InvalidOperationException(
                                "production Copilot exited during startup with code " +
                                process.ExitCode);
                        }
                        if (String.Equals(
                            process.MainWindowTitle,
                            "INPA AI Copilot - Phase 2C Discovery",
                            StringComparison.Ordinal))
                        {
                            break;
                        }
                        Thread.Sleep(100);
                    }

                    process.Refresh();
                    Assert(
                    process.MainWindowTitle == "INPA AI Copilot - Phase 2C Discovery",
                        "production window title missing");
                }
                finally
                {
                    if (!process.HasExited)
                    {
                        if (process.MainWindowHandle != IntPtr.Zero)
                        {
                            process.CloseMainWindow();
                        }
                        if (!process.WaitForExit(3000))
                        {
                            process.Kill();
                            process.WaitForExit();
                        }
                    }
                }
            }
        }

        private static Control FindControlByText(Control parent, string text)
        {
            foreach (Control child in parent.Controls)
            {
                if (String.Equals(child.Text, text, StringComparison.Ordinal))
                {
                    return child;
                }
                Control nested = FindControlByText(child, text);
                if (nested != null)
                {
                    return nested;
                }
            }
            return null;
        }

        private static T FindControl<T>(Control parent) where T : Control
        {
            foreach (Control child in parent.Controls)
            {
                T match = child as T;
                if (match != null)
                {
                    return match;
                }
                T nested = FindControl<T>(child);
                if (nested != null)
                {
                    return nested;
                }
            }
            return null;
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
