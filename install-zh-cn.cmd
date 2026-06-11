@echo off
chcp 65001 >nul
setlocal

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-zh-cn.ps1" %*
set "CODE=%ERRORLEVEL%"

if not "%CODE%"=="0" (
  echo.
  echo 安装失败，错误码：%CODE%
  pause
  exit /b %CODE%
)

echo.
echo 汉化完成。
pause
