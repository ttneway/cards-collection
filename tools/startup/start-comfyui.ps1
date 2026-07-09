$ErrorActionPreference = 'Stop'

$installationsPath = 'C:\Users\ttn\AppData\Roaming\Comfy Desktop\installations.json'
$sharedModelPaths = 'C:\Users\ttn\AppData\Roaming\Comfy Desktop\shared_model_paths.yaml'
$stdoutLog = 'D:\codexTEST\card\cards-collection\tools\startup\comfyui.out.log'
$stderrLog = 'D:\codexTEST\card\cards-collection\tools\startup\comfyui.err.log'

if (Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue) {
  Write-Output 'ComfyUI is already listening on port 8000.'
  exit 0
}

if (-not (Test-Path $installationsPath)) {
  throw "Missing Comfy Desktop installations.json: $installationsPath"
}

$installations = Get-Content $installationsPath | ConvertFrom-Json
$instance = $installations | Where-Object { $_.id -eq 'inst-1781925845281' } | Select-Object -First 1

if (-not $instance) {
  throw 'Unable to locate the adopted ComfyUI installation.'
}

$pythonExe = $instance.adoptedPythonPath
$installPath = $instance.installPath
$baseDir = $instance.adoptedBaseDir
$inputDir = $instance.inputDir
$outputDir = $instance.outputDir
$port = 8000
$userDir = Join-Path $baseDir 'user'
$dbUrl = "sqlite:///$userDir/comfyui.db"

if (-not (Test-Path $pythonExe)) {
  throw "Missing ComfyUI python: $pythonExe"
}

if (-not (Test-Path $installPath)) {
  throw "Missing ComfyUI install path: $installPath"
}

$running = Get-CimInstance Win32_Process -Filter "Name = 'python.exe'" |
  Where-Object { $_.CommandLine -like '*ComfyUI\\main.py*' -and $_.CommandLine -like '*--port 8000*' }

if ($running) {
  Write-Output 'ComfyUI process already exists.'
  exit 0
}

$argumentList = @(
  '-s',
  'ComfyUI\main.py',
  '--feature-flag',
  'show_signin_button=true',
  '--feature-flag',
  'enable_telemetry=true',
  '--base-directory',
  $baseDir,
  '--user-directory',
  $userDir,
  '--database-url',
  $dbUrl,
  '--port',
  "$port",
  '--enable-manager',
  '--extra-model-paths-config',
  $sharedModelPaths,
  '--input-directory',
  $inputDir,
  '--output-directory',
  $outputDir
)

Start-Process -FilePath $pythonExe `
  -ArgumentList $argumentList `
  -WorkingDirectory $installPath `
  -RedirectStandardOutput $stdoutLog `
  -RedirectStandardError $stderrLog `
  -WindowStyle Hidden

$deadline = (Get-Date).AddMinutes(2)
while ((Get-Date) -lt $deadline) {
  if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) {
    Write-Output 'ComfyUI started.'
    exit 0
  }
  Start-Sleep -Seconds 2
}

throw 'ComfyUI did not start listening on port 8000 in time.'
