@echo off
setlocal
cd /d "%~dp0"
title ORCA Frontend v0.12

where node.exe >nul 2>nul
if errorlevel 1 goto NO_NODE

where npm.cmd >nul 2>nul
if errorlevel 1 goto NO_NPM

if exist node_modules goto RUN_APP

echo [1/2] Installing required packages...
call npm.cmd install
if errorlevel 1 goto INSTALL_FAIL

:RUN_APP
echo Checking port 3040...
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":3040" ^| findstr "LISTENING"') do (
  echo Stopping old process on port 3040 ^(PID %%P^)...
  taskkill /PID %%P /F >nul 2>nul
)

timeout /t 1 /nobreak >nul

echo [2/2] Starting ORCA Frontend v0.12 on port 3040...
echo Keep this window open while using the app.
echo.
start "ORCA v0.12 Server" cmd.exe /k npm.cmd run dev -- -p 3040
timeout /t 5 /nobreak >nul
start "" http://localhost:3040/
exit /b 0

:NO_NODE
echo ERROR: Node.js is not installed.
pause
exit /b 1

:NO_NPM
echo ERROR: npm was not found.
pause
exit /b 1

:INSTALL_FAIL
echo.
echo ERROR: Package installation failed.
pause
exit /b 1
