$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$stdoutLog = Join-Path $root 'caddy.out.log'
$stderrLog = Join-Path $root 'caddy.err.log'

Write-Output '=== Local listeners ==='
Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
  Where-Object { $_.LocalPort -in 80,443 } |
  Select-Object LocalAddress,LocalPort,OwningProcess |
  Format-Table -AutoSize

Write-Output ''
Write-Output '=== Local health via Host header ==='
try {
  $response = Invoke-WebRequest -Uri 'http://127.0.0.1/health' -Headers @{ Host = 'ttneway.ddns.net' } -TimeoutSec 10
  Write-Output $response.Content
} catch {
  Write-Output $_.Exception.Message
}

Write-Output ''
Write-Output '=== caddy.err.log ==='
if (Test-Path $stderrLog) {
  Get-Content $stderrLog -Tail 80
} else {
  Write-Output 'No error log yet.'
}

Write-Output ''
Write-Output '=== caddy.out.log ==='
if (Test-Path $stdoutLog) {
  Get-Content $stdoutLog -Tail 80
} else {
  Write-Output 'No output log yet.'
}
