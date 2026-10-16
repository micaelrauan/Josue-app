param([string]$ElectronZip)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$version = '44.7.0'
$name = "electron-v$version-win32-x64.zip"
$hash = 'EEE30DC8FA1F5EA95490E59F44E46EA68DD24C6E93D22FACF70FE5C2D4C2665C'
$cache = Join-Path $projectRoot '.desktop-cache'
$archive = if ($ElectronZip) { [IO.Path]::GetFullPath($ElectronZip) } else { Join-Path $cache $name }
$runtime = Join-Path $cache 'dev-electron'
$executable = Join-Path $runtime 'electron.exe'
$marker = Join-Path $runtime 'archive.sha256'

if (-not (Test-Path -LiteralPath $executable) -or -not (Test-Path -LiteralPath $marker) -or
    (Get-Content -LiteralPath $marker -Raw).Trim() -ne $hash) {
    New-Item -ItemType Directory -Force -Path $cache | Out-Null
    if (-not (Test-Path -LiteralPath $archive)) {
        if ($ElectronZip) { throw "Arquivo não encontrado: $archive" }
        Write-Host "Baixando Electron $version para desenvolvimento..."
        Invoke-WebRequest "https://github.com/electron/electron/releases/download/v$version/$name" -OutFile $archive
    }
    if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ne $hash) {
        throw 'O pacote do Electron não passou na verificação SHA-256.'
    }
    $resolvedRoot = [IO.Path]::GetFullPath($projectRoot).TrimEnd('\') + '\'
    $resolvedRuntime = [IO.Path]::GetFullPath($runtime)
    if (-not $resolvedRuntime.StartsWith($resolvedRoot, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'O cache de desenvolvimento deve ficar dentro do projeto.'
    }
    if (Test-Path -LiteralPath $runtime) { Remove-Item -LiteralPath $runtime -Recurse -Force }
    Expand-Archive -LiteralPath $archive -DestinationPath $runtime
    Set-Content -LiteralPath $marker -Value $hash -NoNewline
}

Write-Host 'Abrindo Josué App em modo de desenvolvimento. Ctrl+C encerra.'
# Windows AppContainer needs read access to the unpacked runtime.
$previousPreference = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
& icacls $runtime /grant '*S-1-15-2-1:(OI)(CI)(RX)' /T /Q 2>$null | Out-Null
$aclGranted = $LASTEXITCODE -eq 0
$ErrorActionPreference = $previousPreference
if (-not $aclGranted) {
    throw 'O Windows negou permissão de leitura do cache para o Electron. Execute npm run dev:desktop em um PowerShell normal da sua conta.'
}
& node (Join-Path $PSScriptRoot 'dev-runner.mjs') $executable
exit $LASTEXITCODE
