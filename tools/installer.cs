using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Reflection;
using System.Text;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;
#if !UNINSTALLER
using System.IO.Compression;
#endif

internal static class AppInstall
{
    internal const string Name = "Josué App";
    internal const string Version = "0.3.0";
    internal const string RegistryKey = @"Software\Microsoft\Windows\CurrentVersion\Uninstall\JosueApp";
    internal static readonly string InstallDir = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", "Josue App");
    internal static readonly string UserDir = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "JosueApp");
    internal static readonly string StartMenuLink = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.Programs), "Josué App.lnk");
    internal static readonly string DesktopLink = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "Josué App.lnk");

    internal static bool IsRunning()
    {
        Process[] processes = Process.GetProcessesByName("Josue App");
        try { return processes.Length > 0; }
        finally { foreach (Process process in processes) process.Dispose(); }
    }

    internal static void CreateShortcut(string path)
    {
        Type shellType = Type.GetTypeFromProgID("WScript.Shell");
        if (shellType == null) throw new InvalidOperationException("O Windows Script Host não está disponível para criar atalhos.");
        dynamic shell = Activator.CreateInstance(shellType);
        dynamic shortcut = shell.CreateShortcut(path);
        shortcut.TargetPath = Path.Combine(InstallDir, "Josue App.exe");
        shortcut.WorkingDirectory = InstallDir;
        shortcut.IconLocation = Path.Combine(InstallDir, "Josue App.exe") + ",0";
        shortcut.Description = Name;
        shortcut.Save();
    }

    internal static void RemoveShortcut(string path)
    {
        if (File.Exists(path)) File.Delete(path);
    }
}

#if UNINSTALLER
internal static class Program
{
    [STAThread]
    private static void Main(string[] args)
    {
        Application.EnableVisualStyles();
        if (args.Length == 1 && args[0] == "--remove")
        {
            try
            {
                Thread.Sleep(900);
                if (AppInstall.IsRunning()) throw new InvalidOperationException("Feche o Josué App antes de desinstalar.");
                if (Directory.Exists(AppInstall.InstallDir)) Directory.Delete(AppInstall.InstallDir, true);
                AppInstall.RemoveShortcut(AppInstall.StartMenuLink);
                AppInstall.RemoveShortcut(AppInstall.DesktopLink);
                Registry.CurrentUser.DeleteSubKey(AppInstall.RegistryKey, false);
                MessageBox.Show("Aplicativo removido. Seus projetos e o motor em " + AppInstall.UserDir + " foram preservados.", AppInstall.Name);
            }
            catch (Exception error) { MessageBox.Show(error.Message, "Falha na desinstalação", MessageBoxButtons.OK, MessageBoxIcon.Error); }
            return;
        }
        if (MessageBox.Show("Desinstalar o Josué App? Os projetos e o motor serão preservados.", AppInstall.Name,
                MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes) return;
        try
        {
            if (AppInstall.IsRunning()) throw new InvalidOperationException("Feche o Josué App antes de desinstalar.");
            string temp = Path.Combine(Path.GetTempPath(), "JosueApp-Uninstall-" + Guid.NewGuid().ToString("N") + ".exe");
            File.Copy(Application.ExecutablePath, temp);
            Process.Start(new ProcessStartInfo(temp, "--remove") { UseShellExecute = true });
        }
        catch (Exception error) { MessageBox.Show(error.Message, "Falha na desinstalação", MessageBoxButtons.OK, MessageBoxIcon.Error); }
    }
}
#else
internal static class Program
{
    [STAThread]
    private static void Main(string[] args)
    {
        if (args.Length == 1 && args[0] == "--verify")
        {
            try
            {
                using (Stream payload = Assembly.GetExecutingAssembly().GetManifestResourceStream("JosueAppPayload"))
                {
                    if (payload == null) throw new InvalidDataException("Pacote do app ausente.");
                    using (ZipArchive zip = new ZipArchive(payload, ZipArchiveMode.Read))
                    {
                        bool app = false, engine = false, uninstaller = false;
                        foreach (ZipArchiveEntry entry in zip.Entries)
                        {
                            string name = entry.FullName.Replace('\\', '/');
                            if (name.EndsWith("/Josue App.exe")) app = true;
                            if (name.EndsWith("/Instalar motor.ps1")) engine = true;
                            if (name.EndsWith("/Desinstalar Josue App.exe")) uninstaller = true;
                        }
                        if (!app || !engine || !uninstaller) throw new InvalidDataException("O pacote está incompleto.");
                    }
                }
                Environment.ExitCode = 0;
            }
            catch { Environment.ExitCode = 1; }
            return;
        }
        bool automatic = args.Length > 0 && args[0] == "--update";
        int waitPid = 0;
        if (automatic)
        {
            foreach (string arg in args)
                if (arg.StartsWith("--wait-pid=", StringComparison.Ordinal))
                    int.TryParse(arg.Substring("--wait-pid=".Length), out waitPid);
        }
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.Run(new InstallForm(automatic, waitPid));
    }
}

internal sealed class InstallForm : Form
{
    private readonly Label status;
    private readonly ProgressBar progress;
    private readonly Button action;
    private readonly CheckBox desktopShortcut;
    private bool busy;
    private bool installed;
    private readonly bool automatic;
    private readonly int waitPid;

    internal InstallForm(bool automatic, int waitPid)
    {
        this.automatic = automatic;
        this.waitPid = waitPid;
        Text = "Instalar " + AppInstall.Name;
        ClientSize = new Size(520, 280);
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        StartPosition = FormStartPosition.CenterScreen;
        Font = new Font("Segoe UI", 9F);
        try { Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch { }
        Controls.Add(new Label { Text = AppInstall.Name, Font = new Font("Segoe UI", 19F, FontStyle.Bold),
            Location = new Point(24, 20), Size = new Size(470, 42) });
        Controls.Add(new Label { Text = "Instala o aplicativo e prepara automaticamente o motor de separação.\n" +
            "Internet e alguns GB livres são necessários para Python, Demucs e modelos.",
            Location = new Point(26, 76), Size = new Size(465, 45) });
        Controls.Add(new Label { Text = "Destino: " + AppInstall.InstallDir,
            Location = new Point(26, 130), Size = new Size(465, 33), AutoEllipsis = true });
        desktopShortcut = new CheckBox { Text = "Criar atalho na área de trabalho", Checked = !automatic || File.Exists(AppInstall.DesktopLink),
            Location = new Point(26, 165), Size = new Size(350, 25) };
        Controls.Add(desktopShortcut);
        progress = new ProgressBar { Location = new Point(26, 199), Size = new Size(466, 14), Style = ProgressBarStyle.Continuous };
        Controls.Add(progress);
        status = new Label { Text = "Pronto para instalar.", Location = new Point(26, 220), Size = new Size(365, 44), AutoEllipsis = true };
        Controls.Add(status);
        action = new Button { Text = "Instalar", Location = new Point(395, 226), Size = new Size(97, 30) };
        action.Click += ActionClick;
        Controls.Add(action);
        FormClosing += delegate(object sender, FormClosingEventArgs e) { if (busy) e.Cancel = true; };
        if (automatic) Shown += delegate { BeginInvoke((Action)delegate() { ActionClick(this, EventArgs.Empty); }); };
    }

    private void ActionClick(object sender, EventArgs e)
    {
        if (installed)
        {
            Process.Start(Path.Combine(AppInstall.InstallDir, "Josue App.exe"));
            Close();
            return;
        }
        busy = true;
        action.Enabled = false;
        desktopShortcut.Enabled = false;
        progress.Style = ProgressBarStyle.Marquee;
        bool shortcut = desktopShortcut.Checked;
        Thread worker = new Thread(delegate()
        {
            try
            {
                if (automatic && waitPid > 0)
                {
                    try
                    {
                        using (Process previous = Process.GetProcessById(waitPid))
                            if (!previous.WaitForExit(30000)) throw new InvalidOperationException("O aplicativo não fechou para atualizar.");
                    }
                    catch (ArgumentException) { }
                    for (int attempt = 0; attempt < 20 && AppInstall.IsRunning(); attempt++) Thread.Sleep(500);
                }
                Install(shortcut);
                BeginInvoke((Action)delegate()
                {
                    busy = false;
                    installed = true;
                    progress.Style = ProgressBarStyle.Continuous;
                    progress.Value = 100;
                    status.Text = "Instalação concluída. O motor está pronto.";
                    action.Text = "Abrir app";
                    action.Enabled = true;
                    if (automatic)
                    {
                        try
                        {
                            Process.Start(Path.Combine(AppInstall.InstallDir, "Josue App.exe"));
                            Close();
                        }
                        catch (Exception error) { status.Text = "Atualizado. Abra o aplicativo pelo menu Iniciar: " + error.Message; }
                    }
                });
            }
            catch (Exception error)
            {
                BeginInvoke((Action)delegate()
                {
                    busy = false;
                    progress.Style = ProgressBarStyle.Continuous;
                    status.Text = "Falha: " + error.Message;
                    action.Text = "Tentar de novo";
                    action.Enabled = true;
                    MessageBox.Show(this, error.Message + "\n\nDetalhes: " + Path.Combine(AppInstall.UserDir, "install.log"),
                        "Instalação incompleta", MessageBoxButtons.OK, MessageBoxIcon.Error);
                });
            }
        });
        worker.IsBackground = true;
        worker.Start();
    }

    private void SetStatus(string message)
    {
        if (IsHandleCreated) BeginInvoke((Action)delegate() { status.Text = message; });
    }

    private void Install(bool shortcut)
    {
        if (AppInstall.IsRunning()) throw new InvalidOperationException("Feche o Josué App antes de instalar ou atualizar.");
        Directory.CreateDirectory(AppInstall.UserDir);
        string logPath = Path.Combine(AppInstall.UserDir, "install.log");
        using (StreamWriter log = new StreamWriter(logPath, true))
        {
            log.AutoFlush = true;
            log.WriteLine("\n=== Instalação " + DateTime.Now.ToString("s") + " ===");
            string staging = AppInstall.InstallDir + ".installing";
            string backup = AppInstall.InstallDir + ".previous";
            SetStatus("Extraindo arquivos do aplicativo...");
            if (Directory.Exists(staging)) Directory.Delete(staging, true);
            Directory.CreateDirectory(staging);
            try
            {
                ExtractPayload(staging);
                if (!File.Exists(Path.Combine(staging, "Josue App.exe")))
                    throw new InvalidDataException("O executável do aplicativo não foi encontrado no pacote.");
                if (Directory.Exists(backup)) Directory.Delete(backup, true);
                if (Directory.Exists(AppInstall.InstallDir)) Directory.Move(AppInstall.InstallDir, backup);
                try { Directory.Move(staging, AppInstall.InstallDir); }
                catch
                {
                    if (Directory.Exists(backup) && !Directory.Exists(AppInstall.InstallDir))
                        Directory.Move(backup, AppInstall.InstallDir);
                    throw;
                }
                if (Directory.Exists(backup)) Directory.Delete(backup, true);
            }
            finally { if (Directory.Exists(staging)) Directory.Delete(staging, true); }

            SetStatus("Criando atalhos...");
            AppInstall.CreateShortcut(AppInstall.StartMenuLink);
            if (shortcut) AppInstall.CreateShortcut(AppInstall.DesktopLink);
            else AppInstall.RemoveShortcut(AppInstall.DesktopLink);
            using (RegistryKey key = Registry.CurrentUser.CreateSubKey(AppInstall.RegistryKey))
            {
                key.SetValue("DisplayName", AppInstall.Name);
                key.SetValue("DisplayVersion", AppInstall.Version);
                key.SetValue("Publisher", "Josué App");
                key.SetValue("InstallLocation", AppInstall.InstallDir);
                key.SetValue("DisplayIcon", Path.Combine(AppInstall.InstallDir, "Josue App.exe"));
                key.SetValue("UninstallString", "\"" + Path.Combine(AppInstall.InstallDir, "Desinstalar Josue App.exe") + "\"");
                key.SetValue("NoModify", 1, RegistryValueKind.DWord);
                key.SetValue("NoRepair", 1, RegistryValueKind.DWord);
            }

            SetStatus("Instalando o motor. Isso pode levar vários minutos...");
            string script = Path.Combine(AppInstall.InstallDir, "Instalar motor.ps1");
            if (!File.Exists(script)) throw new FileNotFoundException("Script do motor ausente.", script);
            ProcessStartInfo start = new ProcessStartInfo("powershell.exe", "-NoProfile -ExecutionPolicy Bypass -File \"" + script + "\"");
            start.WorkingDirectory = AppInstall.InstallDir;
            start.UseShellExecute = false;
            start.CreateNoWindow = true;
            start.RedirectStandardOutput = true;
            start.RedirectStandardError = true;
            start.StandardOutputEncoding = new UTF8Encoding(false);
            start.StandardErrorEncoding = new UTF8Encoding(false);
            using (Process process = new Process())
            {
                process.StartInfo = start;
                DataReceivedEventHandler output = delegate(object sender, DataReceivedEventArgs e)
                {
                    if (e.Data == null) return;
                    lock (log) { log.WriteLine(e.Data); }
                    string line = e.Data.Trim();
                    if (line.Length > 0 && line.Length < 180) SetStatus(line);
                };
                process.OutputDataReceived += output;
                process.ErrorDataReceived += output;
                if (!process.Start()) throw new InvalidOperationException("O PowerShell do motor não iniciou.");
                process.BeginOutputReadLine();
                process.BeginErrorReadLine();
                process.WaitForExit();
                if (process.ExitCode != 0) throw new InvalidOperationException("O motor falhou (código " + process.ExitCode + "). Verifique a conexão e tente novamente.");
            }
        }
    }

    private static void ExtractPayload(string destination)
    {
        using (Stream payload = Assembly.GetExecutingAssembly().GetManifestResourceStream("JosueAppPayload"))
        {
            if (payload == null) throw new InvalidDataException("Pacote do aplicativo ausente.");
            using (ZipArchive zip = new ZipArchive(payload, ZipArchiveMode.Read))
            {
                const string prefix = "JosueApp-win32-x64/";
                string safeRoot = Path.GetFullPath(destination).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
                foreach (ZipArchiveEntry entry in zip.Entries)
                {
                    string name = entry.FullName.Replace('\\', '/');
                    if (!name.StartsWith(prefix, StringComparison.Ordinal))
                        throw new InvalidDataException("Caminho inesperado no pacote: " + entry.FullName);
                    string relative = name.Substring(prefix.Length).Replace('/', Path.DirectorySeparatorChar);
                    if (relative.Length == 0) continue;
                    string target = Path.GetFullPath(Path.Combine(destination, relative));
                    if (!target.StartsWith(safeRoot, StringComparison.OrdinalIgnoreCase))
                        throw new InvalidDataException("Caminho inválido no pacote: " + entry.FullName);
                    if (name.EndsWith("/")) { Directory.CreateDirectory(target); continue; }
                    Directory.CreateDirectory(Path.GetDirectoryName(target));
                    using (Stream input = entry.Open())
                    using (Stream output = new FileStream(target, FileMode.CreateNew, FileAccess.Write)) input.CopyTo(output);
                }
            }
        }
    }
}
#endif
