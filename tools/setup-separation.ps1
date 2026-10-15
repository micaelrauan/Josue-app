param(
    [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot),
    [string]$InstallRoot = $ProjectRoot
)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$env:PYTHONUTF8 = '1'
$projectPath = [System.IO.Path]::GetFullPath($ProjectRoot)
$installPath = [System.IO.Path]::GetFullPath($InstallRoot)
New-Item -ItemType Directory -Force -Path $installPath | Out-Null
Set-Location -LiteralPath $projectPath

# An old Python registration can point to a directory that no longer exists.
# Try 3.11 first, then 3.10 without changing or uninstalling other Python installs.
function Test-CompatiblePython([string]$Path, [string]$Version) {
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $false }
    try {
        $actual = & $Path -c 'import sys; print(sys.version_info[0], sys.version_info[1], sep=chr(46))' 2>$null
        return ($LASTEXITCODE -eq 0 -and ($actual | Select-Object -Last 1).Trim() -eq $Version)
    } catch { return $false }
}

$pythonPath = $null
$runtimePath = Join-Path $installPath '.runtime'
# Reuse a working runtime before launching any Python installer. This also
# avoids maintenance mode for an older registration pointing to a deleted path.
foreach ($version in @('3.11', '3.10')) {
    $candidate = Join-Path $runtimePath ("python" + $version.Replace('.', '') + '\python.exe')
    if (Test-CompatiblePython $candidate $version) { $pythonPath = $candidate; break }
}
if (-not $pythonPath) {
foreach ($version in @('3.11', '3.10')) {
    $compact = $version.Replace('.', '')
    $targetPath = Join-Path $runtimePath "python$compact"
    $localPython = Join-Path $targetPath 'python.exe'
    if (Test-CompatiblePython $localPython $version) { $pythonPath = $localPython; break }

    $existingPython = $null
    try {
        $existingPython = & py "-$version" -c 'import sys; print(sys.executable)' 2>$null
        if ($LASTEXITCODE -ne 0) { $existingPython = $null }
    } catch { $existingPython = $null }
    if ($existingPython -and (Test-CompatiblePython ($existingPython | Select-Object -Last 1).Trim() $version)) {
        $pythonPath = ($existingPython | Select-Object -Last 1).Trim()
        break
    }

    $release = if ($version -eq '3.11') { '3.11.9' } else { '3.10.11' }
    New-Item -ItemType Directory -Force -Path $runtimePath | Out-Null
    $installerPath = Join-Path $runtimePath "python-$release-amd64.exe"
    if (-not (Test-Path -LiteralPath $installerPath)) {
        Write-Host "Baixando Python $release do site oficial..."
        Invoke-WebRequest "https://www.python.org/ftp/python/$release/python-$release-amd64.exe" -OutFile $installerPath
    }
    $signature = Get-AuthenticodeSignature -LiteralPath $installerPath
    if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'Python Software Foundation') {
        throw "A assinatura do instalador do Python $release não pôde ser validada."
    }
    $install = Start-Process -FilePath $installerPath -ArgumentList @('/quiet', 'InstallAllUsers=0', "TargetDir=`"$targetPath`"", 'Include_launcher=0', 'Include_test=0', 'Shortcuts=0', 'AssociateFiles=0', 'PrependPath=0') -WindowStyle Hidden -PassThru -Wait
    if ($install.ExitCode -in @(0, 3010) -and (Test-CompatiblePython $localPython $version)) {
        $pythonPath = $localPython
        break
    }
    Write-Warning "Python $release não foi criado em $targetPath (código $($install.ExitCode)). Tentando outra versão compatível."
}
}
if (-not $pythonPath) { throw 'Não foi possível preparar Python 3.11 nem 3.10. Confira o log e o espaço livre.' }
Write-Host "Usando Python: $pythonPath"

Write-Host 'Preparando ambiente local de separação...'
$venvPath = Join-Path $installPath '.venv'
& $pythonPath -m venv $venvPath
if ($LASTEXITCODE -ne 0) { throw 'Falha ao criar o ambiente Python.' }
$venvPython = Join-Path $venvPath 'Scripts\python.exe'
& $venvPython -m pip install --upgrade pip
if ($LASTEXITCODE -ne 0) { throw 'Falha ao preparar pip. Verifique sua conexão.' }
& $venvPython -m pip install 'torch==2.0.1' 'torchaudio==2.0.2' --index-url https://download.pytorch.org/whl/cpu
if ($LASTEXITCODE -ne 0) { throw 'Falha ao instalar PyTorch.' }
& $venvPython -m pip install 'numpy<2' 'demucs==4.0.1' soundfile imageio-ffmpeg
if ($LASTEXITCODE -ne 0) { throw 'Falha ao instalar Demucs.' }
$worker = Join-Path $projectPath 'tools\separate_audio.py'
& $venvPython $worker --check
if ($LASTEXITCODE -ne 0) { throw 'As dependências do motor não passaram na verificação.' }
$env:TORCH_HOME = Join-Path $installPath '.models'
& $venvPython $worker --download-models
if ($LASTEXITCODE -ne 0) { throw 'Falha ao baixar modelos. Execute este comando novamente para tentar outra vez.' }
Write-Host 'Motor instalado. Reinicie o Josué App.' -ForegroundColor Green
