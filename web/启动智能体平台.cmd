@echo off
setlocal
cd /d "%~dp0"
if not exist ".next\server\app" (
  echo ?????????????node node_modules/next/dist/bin/next build
  pause
  exit /b 1
)
start "" /b wscript.exe "%~dp0scripts\start-hidden.vbs"
timeout /t 2 /nobreak >nul
start "" http://127.0.0.1:3000/
