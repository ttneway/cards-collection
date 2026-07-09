$ErrorActionPreference = 'Stop'

Write-Output '=== ComfyUI listeners ==='
Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
  Where-Object { $_.LocalPort -in 8000,8188 } |
  Select-Object LocalAddress,LocalPort,OwningProcess |
  Format-Table -AutoSize

Write-Output ''
Write-Output '=== ComfyUI system_stats ==='
try {
  curl.exe -s http://127.0.0.1:8000/system_stats
} catch {
  Write-Output $_.Exception.Message
}
