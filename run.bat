@echo off
title ReOUTER - AI Rotator
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [X] Node.js belum terpasang. Download di https://nodejs.org
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo [*] Install dependency pertama kali...
  call npm install --no-audit --no-fund
)

start "" http://127.0.0.1:9301
node server/index.js
pause
