$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$projectPath = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectPath

# Python 3.11 is compatible with the PyTorch versions supported by Demucs 4.
$pythonPath = Join-Path $projectPath '.runtime\python311\python.exe'
if (-not (Test-Path -LiteralPath $pythonPath)) {
    $existingPython = $null
    try {
        $existingPython = & py -3.11 -c 'import sys; print(sys.executable)' 2>$null
        if ($LASTEXITCODE -ne 0) { $existingPython = $null }
    } catch { $existingPython = $null }
    if ($existingPython) {
        $pythonPath = $existingPython.Trim()
    } else {
        $runtimePath = Join-Path $projectPath '.runtime'
        New-Item -ItemType Directory -Force -Path $runtimePath | Out-Null
        $installerPath = Join-Path $runtimePath 'python-3.11.9-amd64.exe'
        Write-Host 'Baixando Python 3.11 do site oficial...'
        Invoke-WebRequest 'https://www.python.org/ftp/python/3.11.9/python-3.11.9-amd64.exe' -OutFile $installerPath
        $signature = Get-AuthenticodeSignature -LiteralPath $installerPath
        if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'Python Software Foundation') {
            throw 'A assinatura do instalador do Python não pôde ser validada.'
        }
        $targetPath = Join-Path $runtimePath 'python311'
        $install = Start-Process -FilePath $installerPath -ArgumentList @('/quiet', 'InstallAllUsers=0', "TargetDir=`"$targetPath`"", 'Include_launcher=0', 'Include_test=0', 'Shortcuts=0', 'AssociateFiles=0', 'PrependPath=0') -WindowStyle Hidden -PassThru -Wait
        if ($install.ExitCode -notin @(0, 3010)) { throw "Falha ao instalar Python: $($install.ExitCode)" }
    }
}

Write-Host 'Preparando ambiente local de separação...'
& $pythonPath -m venv .venv
if ($LASTEXITCODE -ne 0) { throw 'Falha ao criar o ambiente Python.' }
$venvPython = Join-Path $projectPath '.venv\Scripts\python.exe'
& $venvPython -m pip install --upgrade pip
if ($LASTEXITCODE -ne 0) { throw 'Falha ao preparar pip. Verifique sua conexão.' }
& $venvPython -m pip install 'torch==2.0.1' 'torchaudio==2.0.2' --index-url https://download.pytorch.org/whl/cpu
if ($LASTEXITCODE -ne 0) { throw 'Falha ao instalar PyTorch.' }
& $venvPython -m pip install 'numpy<2' 'demucs==4.0.1' soundfile imageio-ffmpeg
if ($LASTEXITCODE -ne 0) { throw 'Falha ao instalar Demucs.' }
$env:TORCH_HOME = Join-Path $projectPath '.models'
& $venvPython tools/separate_audio.py --download-models
if ($LASTEXITCODE -ne 0) { throw 'Falha ao baixar modelos. Execute este comando novamente para tentar outra vez.' }
Write-Host 'Motor instalado. Reinicie npm run dev e abra o endereço mostrado no terminal.' -ForegroundColor Green
