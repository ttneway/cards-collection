$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $root
$stderrLog = Join-Path $repoRoot 'cloudflared-stderr.log'
$urlFile = Join-Path $root 'current-url.txt'

Write-Output '=== current-url.txt ==='
if (Test-Path $urlFile) {
  Get-Content $urlFile
} else {
  Write-Output 'No current URL file yet.'
}

Write-Output ''
Write-Output '=== latest cloudflared log ==='
if (Test-Path $stderrLog) {
  Get-Content $stderrLog -Tail 80
} else {
  Write-Output 'No cloudflared log yet.'
}
