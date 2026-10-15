$ErrorActionPreference = 'Stop'
$appRoot = Join-Path $PSScriptRoot 'resources\app'
$engineRoot = Join-Path $env:LOCALAPPDATA 'JosueApp\engine'
& (Join-Path $appRoot 'tools\setup-separation.ps1') -ProjectRoot $appRoot -InstallRoot $engineRoot
if ($LASTEXITCODE -ne 0) { throw 'A instalação do motor não foi concluída.' }
