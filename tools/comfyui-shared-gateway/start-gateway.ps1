$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$serverScript = Join-Path $root 'server.mjs'
$stdoutLog = Join-Path $root 'gateway.out.log'
$stderrLog = Join-Path $root 'gateway.err.log'
$nodeExe = 'C:\Program Files\nodejs\node.exe'

$comfyPort = 8188
if (-not (Get-NetTCPConnection -LocalPort 8188 -State Listen -ErrorAction SilentlyContinue)) {
  if (Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue) {
    $comfyPort = 8000
  }
}

$comfyBaseUrl = "http://127.0.0.1:$comfyPort"

if (-not (Test-Path $serverScript)) {
  throw "Missing server.mjs: $serverScript"
}

if (-not (Test-Path $nodeExe)) {
  throw "Missing node.exe: $nodeExe"
}

$running = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
  Where-Object { $_.CommandLine -like '*tools\\comfyui-shared-gateway\\server.mjs*' }

if ($running) {
  Write-Output 'Gateway is already running.'
  exit 0
}

$argumentList = @(
  '/c',
  "set `"PORT=8787`" && set `"COMFYUI_BASE_URL=$comfyBaseUrl`" && set `"GATEWAY_SHARED_SECRET=cards-comfy-2026-remote`" && set `"ALLOWED_ORIGIN=https://ttneway.github.io`" && set `"GENERATE_TIMEOUT_MS=300000`" && set `"IDLE_UNLOAD_MS=300000`" && `"$nodeExe`" `"$serverScript`""
)

Start-Process -FilePath 'C:\Windows\System32\cmd.exe' `
  -ArgumentList $argumentList `
  -WorkingDirectory $root `
  -RedirectStandardOutput $stdoutLog `
  -RedirectStandardError $stderrLog `
  -WindowStyle Hidden

Write-Output 'Gateway started.'
