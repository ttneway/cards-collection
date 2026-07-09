$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$stdoutLog = Join-Path $root 'gateway.out.log'
$stderrLog = Join-Path $root 'gateway.err.log'

Write-Output '=== Gateway health ==='
try {
  $response = Invoke-WebRequest -Uri 'http://127.0.0.1:8787/health' -Headers @{ 'x-shared-secret' = 'cards-comfy-2026-remote' } -TimeoutSec 10
  Write-Output $response.Content
} catch {
  Write-Output $_.Exception.Message
}

Write-Output ''
Write-Output '=== gateway.err.log ==='
if (Test-Path $stderrLog) {
  Get-Content $stderrLog -Tail 80
} else {
  Write-Output 'No error log yet.'
}

Write-Output ''
Write-Output '=== gateway.out.log ==='
if (Test-Path $stdoutLog) {
  Get-Content $stdoutLog -Tail 80
} else {
  Write-Output 'No output log yet.'
}
