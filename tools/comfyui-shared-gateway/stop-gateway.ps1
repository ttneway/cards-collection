$ErrorActionPreference = 'Stop'

$running = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
  Where-Object { $_.CommandLine -like '*tools\\comfyui-shared-gateway\\server.mjs*' }

if (-not $running) {
  Write-Output 'Gateway is not running.'
  exit 0
}

$running | ForEach-Object {
  Stop-Process -Id $_.ProcessId -Force
}

Write-Output 'Gateway stopped.'
