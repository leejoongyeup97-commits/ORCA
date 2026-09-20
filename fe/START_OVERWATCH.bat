@echo off
setlocal
cd /d "%~dp0"
title ORCA v0.8

where node.exe >nul 2>nul
if errorlevel 1 goto NO_NODE

where npm.cmd >nul 2>nul
if errorlevel 1 goto NO_NPM

if exist node_modules goto RUN_APP

echo [1/2] Installing required packages...
call npm.cmd install
if errorlevel 1 goto INSTALL_FAIL

:RUN_APP
echo [2/2] Starting ORCA v0.8 on port 3040...
echo Keep this window open while using the app.
echo.
start "ORCA v0.8 Server" cmd.exe /k npm.cmd run dev -- -p 3040
timeout /t 6 /nobreak >nul
start "" http://localhost:3040/
exit /b 0

:NO_NODE
echo ERROR: Node.js is not installed.
echo Install the LTS version from https://nodejs.org/
pause
exit /b 1

:NO_NPM
echo ERROR: npm was not found.
echo Reinstall Node.js LTS and try again.
pause
exit /b 1

:INSTALL_FAIL
echo.
echo ERROR: Package installation failed.
echo Take a screenshot of this window and send it to ChatGPT.
pause
exit /b 1
