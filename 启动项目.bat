@echo off
chcp 65001 >nul
title 智修·校园电脑义诊 - 启动脚本

echo ==============================
echo   智修·校园电脑义诊 启动中...
echo ==============================
echo.

REM 启动后端 API（新窗口）
echo [1/2] 正在启动后端 API...
start "后端API - 不要关这个窗口" cmd /k "cd /d C:\Users\PRO\Documents\GitHub\HuaWei-ICT\apps\api && python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000"

REM 等一下让后端先启动
timeout /t 3 /nobreak >nul

REM 启动前端（新窗口）
echo [2/2] 正在启动前端网页...
start "前端网页 - 不要关这个窗口" cmd /k "cd /d C:\Users\PRO\Documents\GitHub\HuaWei-ICT\apps\web && npm run dev -- --host 127.0.0.1"

echo.
echo ==============================
echo   启动完成！
echo.
echo   网站地址:  http://127.0.0.1:5173
echo   后端文档:  http://127.0.0.1:8000/docs
echo.
echo   弹出了两个黑色窗口，不要关掉它们
echo   关掉窗口 = 停止服务
echo ==============================
echo.

REM 自动打开浏览器
start http://127.0.0.1:5173

pause
