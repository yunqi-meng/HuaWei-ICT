@echo off
setlocal
chcp 65001 >nul
title 知修 - 一键启动
echo 正在启动知修：API、后台任务和前端页面...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\local-services.ps1" -Action Start %*
set "ZHIXIU_EXIT_CODE=%ERRORLEVEL%"
if not "%ZHIXIU_EXIT_CODE%"=="0" (
  echo.
  echo 启动未完成，请根据上方提示处理。日志位于 artifacts\local-services。
  if not defined ZHIXIU_NO_PAUSE pause
)
exit /b %ZHIXIU_EXIT_CODE%
