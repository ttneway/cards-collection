$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$caddyExe = Join-Path $root 'caddy.exe'

$running = Get-CimInstance Win32_Process -Filter "Name = 'caddy.exe'" |
  Where-Object { $_.ExecutablePath -eq $caddyExe }

if (-not $running) {
  Write-Output 'Caddy is not running.'
  exit 0
}

$running | ForEach-Object {
  Stop-Process -Id $_.ProcessId -Force
}

Write-Output 'Caddy stopped.'
