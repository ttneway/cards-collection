$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $root
$cloudflaredExe = Join-Path $repoRoot 'cloudflared.exe'
$stderrLog = Join-Path $repoRoot 'cloudflared-stderr.log'
$stdoutLog = Join-Path $repoRoot 'cloudflared-stdout.log'
$urlFile = Join-Path $root 'current-url.txt'
$sqlFile = Join-Path $root 'update-remote-ai-base-url.sql'
$supabaseCmd = 'C:\Users\ttn\AppData\Roaming\npm\supabase.cmd'
$projectRoot = Split-Path -Parent $repoRoot

if (-not (Test-Path $cloudflaredExe)) {
  throw "Missing cloudflared.exe: $cloudflaredExe"
}

if (-not (Test-Path $supabaseCmd)) {
  throw "Missing supabase CLI: $supabaseCmd"
}

$existing = Get-CimInstance Win32_Process -Filter "Name = 'cloudflared.exe'" |
  Where-Object { $_.ExecutablePath -eq $cloudflaredExe }

foreach ($item in $existing) {
  Stop-Process -Id $item.ProcessId -Force
}

Remove-Item $stderrLog, $stdoutLog, $urlFile -ErrorAction SilentlyContinue

Start-Process -FilePath $cloudflaredExe `
  -ArgumentList 'tunnel','--url','http://127.0.0.1:8787','--protocol','http2','--no-autoupdate' `
  -WorkingDirectory $projectRoot `
  -RedirectStandardOutput $stdoutLog `
  -RedirectStandardError $stderrLog `
  -WindowStyle Hidden

$deadline = (Get-Date).AddMinutes(2)
$url = $null

while ((Get-Date) -lt $deadline) {
  if (Test-Path $stderrLog) {
    $match = Select-String -Path $stderrLog -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' -AllMatches -ErrorAction SilentlyContinue |
      Select-Object -Last 1

    if ($match) {
      $url = $match.Matches[-1].Value
      break
    }
  }

  Start-Sleep -Seconds 2
}

if (-not $url) {
  throw 'Failed to capture trycloudflare URL from cloudflared log.'
}

Set-Content -LiteralPath $urlFile -Value $url -Encoding ASCII

$sql = @"
update public.remote_ai_settings
set base_url = '$url',
    is_enabled = true,
    updated_at = now()
where provider = 'comfyui_gateway';

select provider, base_url, is_enabled
from public.remote_ai_settings
where provider = 'comfyui_gateway';
"@

Set-Content -LiteralPath $sqlFile -Value $sql -Encoding ASCII
& $supabaseCmd db query --linked -f $sqlFile | Out-Null

Write-Output "Tunnel URL: $url"
