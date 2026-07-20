$ErrorActionPreference = 'Stop'

$repoRoot = 'D:\codexTEST\card\cards-collection'
$comfyUiScript = Join-Path $repoRoot 'tools\startup\start-comfyui.ps1'
$gatewayScript = Join-Path $repoRoot 'tools\comfyui-shared-gateway\start-gateway.ps1'
$tunnelScript = Join-Path $repoRoot 'tools\cloudflared\start-shared-tunnel.ps1'
$startupLog = Join-Path $repoRoot 'tools\startup\startup.log'

function Write-Log($message) {
  $timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
  Add-Content -LiteralPath $startupLog -Value "[$timestamp] $message"
}

function Test-LocalPort([int]$port) {
  try {
    $connection = Get-NetTCPConnection -ComputerName 127.0.0.1 -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if ($connection) { return $true }
  } catch {
  }
  try {
    $client = [System.Net.Sockets.TcpClient]::new()
    $client.Connect('127.0.0.1', $port)
    $client.Dispose()
    return $true
  } catch {
    return $false
  }
}

New-Item -ItemType Directory -Force -Path (Split-Path -Parent $startupLog) | Out-Null
Write-Log 'Starting shared AI stack.'

try {
  $comfyProcess = Start-Process powershell -ArgumentList '-NoProfile','-WindowStyle','Hidden','-ExecutionPolicy','Bypass','-File',$comfyUiScript -WindowStyle Hidden -PassThru
  Write-Log "ComfyUI start script launched (PID $($comfyProcess.Id))."
} catch {
  Write-Log "ComfyUI start failed: $($_.Exception.Message)"
}

$comfyDeadline = (Get-Date).AddMinutes(3)
while ((Get-Date) -lt $comfyDeadline) {
  if (Test-LocalPort 8000) {
    Write-Log 'ComfyUI is ready on port 8000.'
    break
  }
  Start-Sleep -Seconds 3
}

if (-not (Test-LocalPort 8000)) {
  Write-Log 'ComfyUI did not become ready; Gateway and Tunnel will not be started.'
  exit 1
}

try {
  & powershell -NoProfile -ExecutionPolicy Bypass -File $gatewayScript | Out-Null
  Write-Log 'Gateway start script launched.'
} catch {
  Write-Log "Gateway start failed: $($_.Exception.Message)"
}

$gatewayDeadline = (Get-Date).AddSeconds(30)
while ((Get-Date) -lt $gatewayDeadline) {
  if (Test-LocalPort 8787) {
    Write-Log 'Gateway is ready on port 8787.'
    break
  }
  Start-Sleep -Seconds 2
}

if (-not (Test-LocalPort 8787)) {
  Write-Log 'Gateway did not become ready; Tunnel will not be started.'
  exit 1
}

try {
  Start-Process powershell -ArgumentList '-NoProfile','-WindowStyle','Hidden','-ExecutionPolicy','Bypass','-File',$tunnelScript -WindowStyle Hidden
  Write-Log 'Tunnel start script launched in background.'
} catch {
  Write-Log "Tunnel start failed: $($_.Exception.Message)"
}
