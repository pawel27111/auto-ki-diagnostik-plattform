using System;
using System.Windows.Forms;

namespace InpaAi.Copilot
{
    internal static class Program
    {
        [STAThread]
        private static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.ThreadException += delegate(object sender, System.Threading.ThreadExceptionEventArgs args)
            {
                string message = SecretRedactor.Redact(
                    args.Exception.Message,
                    SecretRedactor.CurrentRuntimeSecrets());
                MessageBox.Show(
                    "Unerwarteter Anwendungsfehler: " + message,
                    "INPA AI Copilot",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error);
            };
            Application.Run(new MainForm());
        }
    }
}
