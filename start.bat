@echo off
chcp 65001 >nul
title Weekend Saeed
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Opening the download page...
  start "" https://nodejs.org
  pause
  exit /b
)
echo Starting Weekend Saeed... keep this window open.
start "" cmd /c "timeout /t 2 >nul & start http://localhost:3000/admin"
node server.js
pause
