@echo off
setlocal
chcp 65001 >nul
title 知修 - 一键停止
echo 正在停止知修的 API、后台任务和前端服务...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\local-services.ps1" -Action Stop %*
set "ZHIXIU_EXIT_CODE=%ERRORLEVEL%"
if not "%ZHIXIU_EXIT_CODE%"=="0" (
  echo.
  echo 停止未完成，请查看上方提示。
  if not defined ZHIXIU_NO_PAUSE pause
)
exit /b %ZHIXIU_EXIT_CODE%
