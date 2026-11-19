@echo off
setlocal
cd /d "%~dp0"
if not exist "logs" mkdir logs
start "" /b "C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel --url http://127.0.0.1:3000 --no-autoupdate 1>logs\cloudflared.out.log 2>logs\cloudflared.err.log
