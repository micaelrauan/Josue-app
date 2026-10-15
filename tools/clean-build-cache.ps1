$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot)).TrimEnd('\')
$cacheRoot = Join-Path $projectRoot '.desktop-cache'
if (-not (Test-Path -LiteralPath $cacheRoot)) { exit 0 }

$targets = @()
$stage = Join-Path $cacheRoot 'installer-stage'
if (Test-Path -LiteralPath $stage) { $targets += $stage }
$targets += @(Get-ChildItem -LiteralPath $cacheRoot -Directory -Filter 'extract-test-*' | Select-Object -ExpandProperty FullName)

foreach ($target in $targets) {
    $resolved = (Resolve-Path -LiteralPath $target).Path
    if (-not $resolved.StartsWith($cacheRoot + '\', [StringComparison]::OrdinalIgnoreCase)) {
        throw "Destino fora do cache do projeto: $resolved"
    }
    Write-Host "Removendo $resolved"
    Remove-Item -LiteralPath $resolved -Recurse -Force
}
Write-Host 'Cache temporário do instalador limpo.' -ForegroundColor Green
