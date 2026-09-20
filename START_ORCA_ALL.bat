@echo off
setlocal
cd /d "%~dp0"
title ORCA Develop Launcher

echo [1/2] Starting OCR backend...
start "ORCA OCR" /D "%~dp0be" cmd.exe /k call START_OCR.bat

timeout /t 2 /nobreak >nul

echo [2/2] Starting frontend...
start "ORCA Frontend" /D "%~dp0fe" cmd.exe /k call START_ORCA.bat

echo.
echo ORCA develop services started.
exit /b 0
