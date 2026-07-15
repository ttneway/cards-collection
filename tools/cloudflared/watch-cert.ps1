$downloads = Join-Path $env:USERPROFILE 'Downloads'
$targetDir = Join-Path $env:USERPROFILE '.cloudflared'
if (-not (Test-Path $targetDir)) { New-Item -ItemType Directory -Path $targetDir | Out-Null }
$deadline = (Get-Date).AddMinutes(20)
while ((Get-Date) -lt $deadline) {
  $candidate = Get-ChildItem -Path $downloads -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Extension -eq '.pem' -or $_.Name -match 'cert' } |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
  if ($candidate) {
    Copy-Item -LiteralPath $candidate.FullName -Destination (Join-Path $targetDir 'cert.pem') -Force
    Write-Output "COPIED:$($candidate.FullName)"
    exit 0
  }
  Start-Sleep -Seconds 2
}
Write-Output 'TIMEOUT'
exit 1
