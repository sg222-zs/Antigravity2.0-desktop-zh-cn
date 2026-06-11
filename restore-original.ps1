param(
  [string]$AppRoot = "$env:LOCALAPPDATA\Programs\antigravity",
  [switch]$NoRestart
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()

$BackupRoot = Join-Path $AppRoot "resources\.zh-cn-backups"
$AsarPath = Join-Path $AppRoot "resources\app.asar"
$ExePath = Join-Path $AppRoot "Antigravity.exe"

function Write-Step([string]$Message) {
  Write-Host "[Antigravity zh-CN] $Message"
}

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
