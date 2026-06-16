param(
  [string]$AppRoot = "$env:LOCALAPPDATA\Programs\antigravity",
  [switch]$NoRestart,
  [switch]$WaitOnExit
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()

$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$LogDir = Join-Path $ScriptRoot "logs"
$LogPath = Join-Path $LogDir ("install-zh-cn-{0}.log" -f (Get-Date -Format "yyyyMMdd-HHmmss"))
$Patcher = Join-Path $ScriptRoot "scripts\patch-antigravity-zh-cn.js"
$Validator = Join-Path $ScriptRoot "scripts\validate-antigravity-asar.js"
$AsarPath = Join-Path $AppRoot "resources\app.asar"
$ExePath = Join-Path $AppRoot "Antigravity.exe"
$TranscriptStarted = $false
$ExitCode = 0

function Write-Step([string]$Message) {
  Write-Host "[Antigravity zh-CN] $Message"
}

function Assert-File([string]$Path, [string]$Name) {
  if (-not (Test-Path -LiteralPath $Path)) {
    throw "$Name not found: $Path"
  }
}

try {
  New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
  try {
    Start-Transcript -Path $LogPath -Force | Out-Null
    $TranscriptStarted = $true
  } catch {
    Write-Warning "Could not start transcript log: $($_.Exception.Message)"
  }

  Write-Step "Log file: $LogPath"
  Write-Step "App root: $AppRoot"
  Assert-File $Patcher "Patcher"
  Assert-File $Validator "Validator"
  Assert-File $AsarPath "app.asar"

  $Node = Get-Command node -ErrorAction SilentlyContinue
  if (-not $Node) {
    throw "Node.js was not found in PATH. Install Node.js first, then run this script again."
  }
  Write-Step "Node.js: $($Node.Source)"

  $Processes = Get-Process -ErrorAction SilentlyContinue |
    Where-Object { $_.ProcessName -eq "Antigravity" -or $_.ProcessName -eq "language_server" }
  if ($Processes) {
    Write-Step "Stopping running Antigravity processes..."
    $Processes | Stop-Process -Force
    Start-Sleep -Seconds 2
  }

  Write-Step "Patching app.asar..."
  & node $Patcher $AppRoot
  if ($LASTEXITCODE -ne 0) {
    throw "Patch failed with exit code $LASTEXITCODE."
  }

  Write-Step "Validating patched app.asar..."
  & node $Validator $AppRoot
  if ($LASTEXITCODE -ne 0) {
    throw "Validation failed with exit code $LASTEXITCODE."
  }

  if (-not $NoRestart) {
    Assert-File $ExePath "Antigravity.exe"
    Write-Step "Starting Antigravity..."
    Start-Process -FilePath $ExePath | Out-Null
  }

  Write-Step "Done."
} catch {
  $ExitCode = 1
  Write-Host ""
  Write-Host "[Antigravity zh-CN] FAILED" -ForegroundColor Red
  Write-Host $_.Exception.Message -ForegroundColor Red
  if ($_.ScriptStackTrace) {
    Write-Host ""
    Write-Host $_.ScriptStackTrace
  }
} finally {
  if ($TranscriptStarted) {
    try { Stop-Transcript | Out-Null } catch {}
  }
  if ($WaitOnExit) {
    Write-Host ""
    Write-Host "Log file: $LogPath"
    Read-Host "Press Enter to close this window" | Out-Null
  }
  exit $ExitCode
}
