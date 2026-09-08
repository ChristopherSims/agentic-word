# Package an embeddable Python runtime with mnesis installed for the
# Lexicon Mnesis sidecar (memory.md §13 packaging gate).
#
# Usage:  powershell -ExecutionPolicy Bypass -File package-runtime.ps1
#         [-PythonVersion 3.12.10]
#
# What it does:
#   1. Downloads the Windows embeddable Python zip from python.org.
#   2. Extracts it to ../mnesis-runtime (gitignored except .gitkeep).
#   3. Enables site-packages (uncomments `import site` in python*._pth).
#   4. Bootstraps pip via get-pip.py and installs mnesis==0.3.0.
#
# After this script, `npm run dist` bundles the runtime as
# resources/mnesis-runtime via electron-builder extraResources, and the
# packaged app uses it automatically (mnesis-client resolveMnesisPaths).
#
# macOS/Linux: there is no embeddable distribution; instead place a
# standalone/venv Python with mnesis installed at native/mnesis-runtime/
# (interpreter at mnesis-runtime/bin/python3), or rely on system Python.

param(
  [string]$PythonVersion = "3.12.10",
  [string]$MnesisVersion = "0.3.0"
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot      # native/
$runtimeDir = Join-Path $repoRoot 'mnesis-runtime'
$tempDir = Join-Path $env:TEMP "mnesis-runtime-$([guid]::NewGuid().ToString('N').Substring(0,8))"

$zipName = "python-$PythonVersion-embed-amd64.zip"
$zipUrl = "https://www.python.org/ftp/python/$PythonVersion/$zipName"

try {
  New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null
  New-Item -ItemType Directory -Force -Path $tempDir | Out-Null
  $zipPath = Join-Path $tempDir $zipName

  Write-Host "Downloading $zipUrl"
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  Invoke-WebRequest -Uri $zipUrl -OutFile $zipPath -UseBasicParsing

  Write-Host "Extracting to $runtimeDir"
  # Keep the .gitkeep placeholder tracked content safe: extract over the dir.
  Expand-Archive -Path $zipPath -DestinationPath $runtimeDir -Force

  # Enable site-packages in the embeddable distribution.
  $pthFile = Get-ChildItem -Path $runtimeDir -Filter 'python*._pth' | Select-Object -First 1
  if (-not $pthFile) { throw "python*._pth not found in $runtimeDir" }
  $pthContent = Get-Content $pthFile.FullName -Raw
  if ($pthContent -notmatch '^\s*import\s+site' -and $pthContent -notmatch '#import site') {
    # already enabled
  } else {
    $pthContent = $pthContent -replace '#\s*import\s+site', 'import site'
    Set-Content -Path $pthFile.FullName -Value $pthContent -NoNewline
  }

  $pythonExe = Join-Path $runtimeDir 'python.exe'

  # Bootstrap pip (the embeddable zip ships without it).
  Write-Host 'Bootstrapping pip'
  $getPip = Join-Path $tempDir 'get-pip.py'
  Invoke-WebRequest -Uri 'https://bootstrap.pypa.io/get-pip.py' -OutFile $getPip -UseBasicParsing
  & $pythonExe $getPip --no-warn-script-location --quiet
  if ($LASTEXITCODE -ne 0) { throw 'get-pip failed' }

  Write-Host "Installing mnesis==$MnesisVersion"
  & $pythonExe -m pip install "mnesis==$MnesisVersion" --no-warn-script-location --quiet --no-input
  if ($LASTEXITCODE -ne 0) { throw 'mnesis install failed' }

  Write-Host 'Verifying import'
  & $pythonExe -c 'import mnesis; print("mnesis import ok")'
  if ($LASTEXITCODE -ne 0) { throw 'mnesis import verification failed' }

  Write-Host ''
  Write-Host "Runtime ready at $runtimeDir" -ForegroundColor Green
  Write-Host 'Re-run the worker smoke test (README) against this interpreter, then run: npm run dist'
}
finally {
  Remove-Item -Path $tempDir -Recurse -Force -ErrorAction SilentlyContinue
}
