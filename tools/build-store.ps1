$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$ManifestPath = Join-Path $Root "manifest.json"
$Manifest = Get-Content $ManifestPath -Raw | ConvertFrom-Json
$Version = $Manifest.version

$Dist = Join-Path $Root "dist"
$Stage = Join-Path $Dist "ddb-maps-qol"
$Zip = Join-Path $Dist ("ddb-maps-qol-v" + $Version + ".zip")

if (Test-Path $Stage) { Remove-Item $Stage -Recurse -Force }
if (Test-Path $Zip) { Remove-Item $Zip -Force }

New-Item -ItemType Directory -Path $Stage -Force | Out-Null

$RuntimeFiles = @(
  "manifest.json",
  "content.js",
  "page-bridge.js",
  "five-tools.js",
  "service-worker.js",
  "popup.html",
  "popup.js",
  "styles.css",
  "icons"
)

foreach ($Item in $RuntimeFiles) {
  $Source = Join-Path $Root $Item
  if (-not (Test-Path $Source)) {
    throw "Arquivo obrigatório ausente: $Item"
  }
  Copy-Item $Source $Stage -Recurse -Force
}

Compress-Archive -Path (Join-Path $Stage "*") -DestinationPath $Zip -CompressionLevel Optimal
Remove-Item $Stage -Recurse -Force

Write-Host ""
Write-Host "Pacote criado:"
Write-Host $Zip
Write-Host ""
Write-Host "Versão do manifest: $Version"
