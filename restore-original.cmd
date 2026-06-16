@echo off
setlocal EnableExtensions

set "SCRIPT_DIR=%~dp0"
set "PS_SCRIPT=%SCRIPT_DIR%restore-original.ps1"

if not exist "%PS_SCRIPT%" (
  echo ERROR: restore-original.ps1 not found:
  echo %PS_SCRIPT%
  echo.
  pause
  exit /b 1
)

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%PS_SCRIPT%" -WaitOnExit %*
exit /b %ERRORLEVEL%
