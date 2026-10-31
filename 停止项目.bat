@echo off
chcp 65001 >nul
title 智修·校园电脑义诊 - 停止服务

echo 正在停止所有服务...
taskkill /fi "WINDOWTITLE eq 后端API*" /f >nul 2>&1
taskkill /fi "WINDOWTITLE eq 前端网页*" /f >nul 2>&1

REM 也杀掉可能残留的 uvicorn 和 node 进程
for /f "tokens=2" %%i in ('tasklist /fi "imagename eq python.exe" /fo list ^| findstr "PID"') do taskkill /pid %%i /f >nul 2>&1

echo 服务已停止。
pause
