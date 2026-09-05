using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;

// Windows-subsystem entry point: no console is allocated, even before PowerShell starts.
internal static class Launcher {
    [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr window);
    [DllImport("user32.dll")] static extern bool ShowWindowAsync(IntPtr window, int command);
    [DllImport("user32.dll")] static extern bool IsIconic(IntPtr window);
    [STAThread] static void Main(string[] args) {
        try {
            bool startup = args.Length == 1 && args[0] == "--startup";
            if (args.Length > 0 && !startup) throw new ArgumentException("Unsupported launcher option.");
            string root = AppDomain.CurrentDomain.BaseDirectory;
            string script = Path.Combine(root, "Launch.ps1");
            if (!File.Exists(script)) throw new FileNotFoundException("Codex Sidecar installation is incomplete.");
            var info = new ProcessStartInfo {
                FileName = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), @"WindowsPowerShell\v1.0\powershell.exe"),
                Arguments = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File \"" + script + "\"" + (startup ? " -Startup" : ""),
                WorkingDirectory = root, UseShellExecute = false, CreateNoWindow = true, WindowStyle = ProcessWindowStyle.Hidden
            };
            using (var child = Process.Start(info)) { }
            if (startup) return;
            for (int attempt = 0; attempt < 40; attempt++) {
                foreach (string name in new [] { "Codex", "ChatGPT" }) foreach (var process in Process.GetProcessesByName(name)) {
                    using (process) try {
                        string file = process.MainModule.FileName;
                        if (file.IndexOf(@"\WindowsApps\OpenAI.Codex_", StringComparison.OrdinalIgnoreCase) < 0 ||
                            !String.Equals(Path.GetFileName(Path.GetDirectoryName(file)), "app", StringComparison.OrdinalIgnoreCase) || process.MainWindowHandle == IntPtr.Zero) continue;
                        if (IsIconic(process.MainWindowHandle)) ShowWindowAsync(process.MainWindowHandle, 9);
                        SetForegroundWindow(process.MainWindowHandle); return;
                    } catch { }
                }
                Thread.Sleep(250);
            }
        } catch (Exception error) { MessageBox.Show(error.Message, "Codex Sidecar", MessageBoxButtons.OK, MessageBoxIcon.Information); }
    }
}
