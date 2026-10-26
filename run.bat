@echo off
cd /d "%~dp0"
if not exist node_modules (
  echo Menginstall dependensi...
  call npm.cmd install
)
if not exist client\dist (
  echo Membangun dashboard...
  call npm.cmd run build
)
echo.
echo  ReOUTER  -  http://127.0.0.1:9301
echo  Gateway     -  http://127.0.0.1:9301/v1
echo.
start "" http://127.0.0.1:9301
node server/index.js
pause
