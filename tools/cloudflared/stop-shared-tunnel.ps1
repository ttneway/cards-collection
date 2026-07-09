$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$cloudflaredExe = Join-Path $repoRoot 'cloudflared.exe'

$existing = Get-CimInstance Win32_Process -Filter "Name = 'cloudflared.exe'" |
  Where-Object { $_.ExecutablePath -eq $cloudflaredExe }

if (-not $existing) {
  Write-Output 'cloudflared is not running.'
  exit 0
}

foreach ($item in $existing) {
  Stop-Process -Id $item.ProcessId -Force
}

Write-Output 'cloudflared stopped.'
