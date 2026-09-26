@echo off
setlocal
cd /d "%~dp0"
title ORCA Develop Launcher

echo [1/3] Starting OCR backend...
start "ORCA OCR" /D "%~dp0be" cmd.exe /k call START_OCR.bat

echo [2/3] Waiting for OCR server health...
set /a OCR_WAIT=0
:WAIT_OCR
curl.exe -s -f http://127.0.0.1:8001/health >nul 2>nul
if not errorlevel 1 goto OCR_READY

set /a OCR_WAIT+=2
if %OCR_WAIT% GEQ 90 goto OCR_TIMEOUT
echo   OCR server not ready yet... %OCR_WAIT%/90 sec
timeout /t 2 /nobreak >nul
goto WAIT_OCR

:OCR_READY
echo   OCR server is ready.
goto START_FRONTEND

:OCR_TIMEOUT
echo.
echo [WARNING] OCR server did not become ready within 90 seconds.
echo Check the "ORCA OCR" window for Tesseract, Python package, or port errors.
echo The frontend will still start, but OCR requests will fail until port 8001 is ready.
echo.

:START_FRONTEND
echo [3/3] Starting frontend...
start "ORCA Frontend" /D "%~dp0fe" cmd.exe /k call START_ORCA.bat

echo.
echo ORCA services launch sequence completed.
exit /b 0
