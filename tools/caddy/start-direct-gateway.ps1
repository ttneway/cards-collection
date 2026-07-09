$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$caddyExe = Join-Path $root 'caddy.exe'
$caddyFile = Join-Path $root 'Caddyfile'
$stdoutLog = Join-Path $root 'caddy.out.log'
$stderrLog = Join-Path $root 'caddy.err.log'

if (-not (Test-Path $caddyExe)) {
  throw "Missing caddy.exe: $caddyExe"
}

if (-not (Test-Path $caddyFile)) {
  throw "Missing Caddyfile: $caddyFile"
}

$running = Get-CimInstance Win32_Process -Filter "Name = 'caddy.exe'" |
  Where-Object { $_.ExecutablePath -eq $caddyExe }

if ($running) {
  Write-Output 'Caddy is already running.'
  exit 0
}

Start-Process -FilePath $caddyExe `
  -ArgumentList 'run','--config',$caddyFile,'--adapter','caddyfile' `
  -WorkingDirectory $root `
  -RedirectStandardOutput $stdoutLog `
  -RedirectStandardError $stderrLog `
  -WindowStyle Hidden

Write-Output 'Caddy started.'
