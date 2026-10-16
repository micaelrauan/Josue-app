param([switch]$SkipDesktopBuild, [string]$OutputFile)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$distRoot = Join-Path $projectRoot 'dist'
$stageRoot = Join-Path $projectRoot '.desktop-cache\installer-stage'
$appRoot = Join-Path $stageRoot 'JosueApp-win32-x64'
$zipPath = Join-Path $distRoot 'JosueApp-windows-x64.zip'
$output = if ($OutputFile) { [System.IO.Path]::GetFullPath($OutputFile) } else { Join-Path $distRoot 'JosueApp-Setup.exe' }
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$source = Join-Path $PSScriptRoot 'installer.cs'
$version = (Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json).version
if ((Get-Content -LiteralPath $source -Raw) -notmatch [regex]::Escape("internal const string Version = `"$version`";")) {
    throw 'A versão do instalador deve corresponder à versão do package.json.'
}

if (-not (Test-Path -LiteralPath $compiler)) { throw 'O compilador C# do .NET Framework não foi encontrado.' }
New-Item -ItemType Directory -Force -Path $distRoot | Out-Null
if (-not $SkipDesktopBuild) {
    & (Join-Path $PSScriptRoot 'build-desktop.ps1') -OutputRoot $stageRoot
}
if (-not (Test-Path -LiteralPath (Join-Path $appRoot 'Josue App.exe'))) {
    throw 'O aplicativo desktop não foi encontrado. Execute npm run build:desktop primeiro.'
}

# Build the small uninstaller into the app payload, then refresh the portable ZIP.
& $compiler /nologo /target:winexe /platform:x64 /optimize+ /define:UNINSTALLER "/out:$(Join-Path $appRoot 'Desinstalar Josue App.exe')" /win32icon:$(Join-Path $projectRoot 'desktop\icon.ico') /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:Microsoft.CSharp.dll $source
if ($LASTEXITCODE -ne 0) { throw 'Falha ao compilar o desinstalador.' }
if (Test-Path -LiteralPath $zipPath) { Remove-Item -LiteralPath $zipPath }
Compress-Archive -LiteralPath $appRoot -DestinationPath $zipPath -CompressionLevel Optimal

& $compiler /nologo /target:winexe /platform:x64 /optimize+ "/out:$output" /win32icon:$(Join-Path $projectRoot 'desktop\icon.ico') /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.IO.Compression.dll /reference:System.IO.Compression.FileSystem.dll /reference:Microsoft.CSharp.dll "/resource:$zipPath,JosueAppPayload" $source
if ($LASTEXITCODE -ne 0) { throw 'Falha ao compilar o instalador.' }

Write-Host "Instalador pronto: $output" -ForegroundColor Green
