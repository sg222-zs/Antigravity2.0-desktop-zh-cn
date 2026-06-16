param(
  [string]$AppRoot = "$env:LOCALAPPDATA\Programs\antigravity",
  [switch]$NoRestart,
  [switch]$WaitOnExit
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()

$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$LogDir = Join-Path $ScriptRoot "logs"
$LogPath = Join-Path $LogDir ("restore-original-{0}.log" -f (Get-Date -Format "yyyyMMdd-HHmmss"))
$BackupRoot = Join-Path $AppRoot "resources\.zh-cn-backups"
$AsarPath = Join-Path $AppRoot "resources\app.asar"
$ExePath = Join-Path $AppRoot "Antigravity.exe"
$TranscriptStarted = $false
$ExitCode = 0

function Write-Step([string]$Message) {
  Write-Host "[Antigravity zh-CN] $Message"
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

  if (-not (Test-Path -LiteralPath $BackupRoot)) {
    throw "Backup directory not found: $BackupRoot"
  }

  $Latest = Get-ChildItem -LiteralPath $BackupRoot -Directory |
    Sort-Object Name -Descending |
    Select-Object -First 1

  if (-not $Latest) {
    throw "No backup directory found in: $BackupRoot"
  }

  $BackupAsar = Join-Path $Latest.FullName "app.asar"
  if (-not (Test-Path -LiteralPath $BackupAsar)) {
    throw "Backup app.asar not found: $BackupAsar"
  }

  $Processes = Get-Process -ErrorAction SilentlyContinue |
    Where-Object { $_.ProcessName -eq "Antigravity" -or $_.ProcessName -eq "language_server" }
  if ($Processes) {
    Write-Step "Stopping running Antigravity processes..."
    $Processes | Stop-Process -Force
    Start-Sleep -Seconds 2
  }

  Write-Step "Restoring backup: $BackupAsar"
  Copy-Item -LiteralPath $BackupAsar -Destination $AsarPath -Force

  if (-not $NoRestart) {
    if (Test-Path -LiteralPath $ExePath) {
      Write-Step "Starting Antigravity..."
      Start-Process -FilePath $ExePath | Out-Null
    }
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
