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

New-Item -ItemType Directory -Force -Path (Split-Path -Parent $startupLog) | Out-Null
Write-Log 'Starting shared AI stack.'

try {
  & powershell -NoProfile -ExecutionPolicy Bypass -File $comfyUiScript | Out-Null
  Write-Log 'ComfyUI start script finished.'
} catch {
  Write-Log "ComfyUI start failed: $($_.Exception.Message)"
}

Start-Sleep -Seconds 5

try {
  & powershell -NoProfile -ExecutionPolicy Bypass -File $gatewayScript | Out-Null
  Write-Log 'Gateway start script finished.'
} catch {
  Write-Log "Gateway start failed: $($_.Exception.Message)"
}

Start-Sleep -Seconds 5

try {
  Start-Process powershell `
    -ArgumentList '-NoProfile','-WindowStyle','Hidden','-ExecutionPolicy','Bypass','-File',$tunnelScript `
    -WindowStyle Hidden
  Write-Log 'Tunnel start script launched in background.'
} catch {
  Write-Log "Tunnel start failed: $($_.Exception.Message)"
}
