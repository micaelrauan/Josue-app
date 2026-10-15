param(
    [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot),
    [string]$InstallRoot = $ProjectRoot
)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$projectPath = [System.IO.Path]::GetFullPath($ProjectRoot)
$installPath = [System.IO.Path]::GetFullPath($InstallRoot)
New-Item -ItemType Directory -Force -Path $installPath | Out-Null
Set-Location -LiteralPath $projectPath

# Python 3.11 is compatible with the PyTorch versions supported by Demucs 4.
$pythonPath = Join-Path $installPath '.runtime\python311\python.exe'
if (-not (Test-Path -LiteralPath $pythonPath)) {
    $existingPython = $null
    try {
        $existingPython = & py -3.11 -c 'import sys; print(sys.executable)' 2>$null
        if ($LASTEXITCODE -ne 0) { $existingPython = $null }
    } catch { $existingPython = $null }
    if ($existingPython) {
        $pythonPath = $existingPython.Trim()
    } else {
        $runtimePath = Join-Path $installPath '.runtime'
        New-Item -ItemType Directory -Force -Path $runtimePath | Out-Null
        $installerPath = Join-Path $runtimePath 'python-3.11.9-amd64.exe'
        if (-not (Test-Path -LiteralPath $installerPath)) {
            Write-Host 'Baixando Python 3.11 do site oficial...'
            Invoke-WebRequest 'https://www.python.org/ftp/python/3.11.9/python-3.11.9-amd64.exe' -OutFile $installerPath
        }
        $signature = Get-AuthenticodeSignature -LiteralPath $installerPath
        if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'Python Software Foundation') {
            throw 'A assinatura do instalador do Python não pôde ser validada.'
        }
        $targetPath = Join-Path $runtimePath 'python311'
        $install = Start-Process -FilePath $installerPath -ArgumentList @('/quiet', 'InstallAllUsers=0', "TargetDir=`"$targetPath`"", 'Include_launcher=0', 'Include_test=0', 'Shortcuts=0', 'AssociateFiles=0', 'PrependPath=0') -WindowStyle Hidden -PassThru -Wait
        if ($install.ExitCode -notin @(0, 3010)) { throw "Falha ao instalar Python: $($install.ExitCode)" }
        if (-not (Test-Path -LiteralPath (Join-Path $targetPath 'python.exe'))) {
            throw 'O instalador terminou, mas Python 3.11 não apareceu na pasta do motor. Há uma instalação antiga registrada em uma pasta apagada. Abra o instalador do Python 3.11, escolha Reparar e depois Desinstalar; em seguida execute Instalar motor.ps1 novamente.'
        }
    }
}

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
$env:TORCH_HOME = Join-Path $installPath '.models'
& $venvPython (Join-Path $projectPath 'tools\separate_audio.py') --download-models
if ($LASTEXITCODE -ne 0) { throw 'Falha ao baixar modelos. Execute este comando novamente para tentar outra vez.' }
Write-Host 'Motor instalado. Reinicie o Josué App.' -ForegroundColor Green
