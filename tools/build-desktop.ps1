param([string]$ElectronZip, [string]$OutputRoot)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$electronVersion = '44.7.0'
$archiveName = "electron-v$electronVersion-win32-x64.zip"
$expectedHash = 'EEE30DC8FA1F5EA95490E59F44E46EA68DD24C6E93D22FACF70FE5C2D4C2665C'
$cacheRoot = Join-Path $projectRoot '.desktop-cache'
$archivePath = if ($ElectronZip) { [System.IO.Path]::GetFullPath($ElectronZip) } else { Join-Path $cacheRoot $archiveName }

if (-not (Test-Path -LiteralPath $archivePath)) {
    if ($ElectronZip) { throw "Arquivo não encontrado: $archivePath" }
    New-Item -ItemType Directory -Force -Path $cacheRoot | Out-Null
    Write-Host "Baixando Electron $electronVersion do projeto oficial..."
    Invoke-WebRequest "https://github.com/electron/electron/releases/download/v$electronVersion/$archiveName" -OutFile $archivePath
}
if ((Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash -ne $expectedHash) {
    throw "O pacote do Electron não passou na verificação SHA-256: $archivePath"
}

$outputDirectory = if ($OutputRoot) { [System.IO.Path]::GetFullPath($OutputRoot) } else { Join-Path $projectRoot 'dist' }
$target = Join-Path $outputDirectory 'JosueApp-win32-x64'
$resolvedProject = [System.IO.Path]::GetFullPath($projectRoot).TrimEnd('\') + '\'
$resolvedTarget = [System.IO.Path]::GetFullPath($target)
if (-not $resolvedTarget.StartsWith($resolvedProject, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'O destino do build está fora do projeto.'
}
New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
if (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target -Recurse -Force }
New-Item -ItemType Directory -Force -Path $target | Out-Null
Expand-Archive -LiteralPath $archivePath -DestinationPath $target -Force

$appRoot = Join-Path $target 'resources\app'
New-Item -ItemType Directory -Force -Path $appRoot | Out-Null
foreach ($name in @('package.json', 'server.js', 'separation.js', 'audio-export.js', 'LICENSE')) {
    Copy-Item -LiteralPath (Join-Path $projectRoot $name) -Destination (Join-Path $appRoot $name)
}
Copy-Item -LiteralPath (Join-Path $projectRoot 'public') -Destination (Join-Path $appRoot 'public') -Recurse
New-Item -ItemType Directory -Force -Path (Join-Path $appRoot 'desktop'), (Join-Path $appRoot 'tools') | Out-Null
Copy-Item -LiteralPath (Join-Path $projectRoot 'desktop\main.cjs') -Destination (Join-Path $appRoot 'desktop\main.cjs')
Copy-Item -LiteralPath (Join-Path $projectRoot 'desktop\icon.ico') -Destination (Join-Path $appRoot 'desktop\icon.ico')
Copy-Item -LiteralPath (Join-Path $projectRoot 'desktop\icon.png') -Destination (Join-Path $appRoot 'desktop\icon.png')
Copy-Item -LiteralPath (Join-Path $projectRoot 'tools\separate_audio.py') -Destination (Join-Path $appRoot 'tools\separate_audio.py')
Copy-Item -LiteralPath (Join-Path $projectRoot 'tools\setup-separation.ps1') -Destination (Join-Path $appRoot 'tools\setup-separation.ps1')
Copy-Item -LiteralPath (Join-Path $projectRoot 'desktop\Instalar motor.ps1') -Destination (Join-Path $target 'Instalar motor.ps1')
$defaultApp = Join-Path $target 'resources\default_app.asar'
if (Test-Path -LiteralPath $defaultApp) { Remove-Item -LiteralPath $defaultApp }

$executable = Join-Path $target 'Josue App.exe'
Move-Item -LiteralPath (Join-Path $target 'electron.exe') -Destination $executable
$iconFile = Join-Path $projectRoot 'desktop\icon.ico'

Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Runtime.InteropServices;

public static class ExecutableIcon {
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern IntPtr BeginUpdateResource(string fileName, bool deleteExistingResources);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool UpdateResource(IntPtr update, IntPtr type, IntPtr name, ushort language, byte[] data, uint size);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool EndUpdateResource(IntPtr update, bool discard);

    public static void Apply(string executable, string iconPath) {
        byte[] icon = File.ReadAllBytes(iconPath);
        using (var input = new BinaryReader(new MemoryStream(icon))) {
            if (input.ReadUInt16() != 0 || input.ReadUInt16() != 1) throw new InvalidDataException("ICO inválido.");
            ushort count = input.ReadUInt16();
            var entries = new byte[count][];
            for (int i = 0; i < count; i++) entries[i] = input.ReadBytes(16);
            IntPtr update = BeginUpdateResource(executable, false);
            if (update == IntPtr.Zero) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
            bool success = false;
            try {
                using (var stream = new MemoryStream())
                using (var group = new BinaryWriter(stream)) {
                    group.Write((ushort)0); group.Write((ushort)1); group.Write(count);
                    for (int i = 0; i < count; i++) {
                        byte[] entry = entries[i];
                        uint length = BitConverter.ToUInt32(entry, 8);
                        uint offset = BitConverter.ToUInt32(entry, 12);
                        byte[] image = new byte[length];
                        Array.Copy(icon, offset, image, 0, length);
                        if (!UpdateResource(update, new IntPtr(3), new IntPtr(i + 1), 0, image, length))
                            throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
                        group.Write(entry, 0, 12);
                        group.Write((ushort)(i + 1));
                    }
                    byte[] data = stream.ToArray();
                    if (!UpdateResource(update, new IntPtr(14), new IntPtr(1), 0, data, (uint)data.Length))
                        throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
                }
                success = true;
            } finally {
                if (!EndUpdateResource(update, !success))
                    throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
            }
        }
    }
}
'@
[ExecutableIcon]::Apply($executable, $iconFile)
$zipOutput = Join-Path $outputDirectory 'JosueApp-windows-x64.zip'
if (Test-Path -LiteralPath $zipOutput) { Remove-Item -LiteralPath $zipOutput }
Compress-Archive -LiteralPath $target -DestinationPath $zipOutput -CompressionLevel Optimal
Write-Host "Desktop pronto: $executable" -ForegroundColor Green
Write-Host "Pacote para distribuição: $zipOutput" -ForegroundColor Green
