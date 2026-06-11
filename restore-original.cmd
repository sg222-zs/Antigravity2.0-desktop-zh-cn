@echo off
chcp 65001 >nul
setlocal

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0restore-original.ps1" %*
set "CODE=%ERRORLEVEL%"

if not "%CODE%"=="0" (
  echo.
  echo 恢复失败，错误码：%CODE%
  pause
  exit /b %CODE%
)

echo.
echo 已恢复最近一次备份。
pause
