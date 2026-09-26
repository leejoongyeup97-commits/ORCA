@echo off
setlocal
cd /d "%~dp0"

REM DEV-ONLY TOOL.
REM Delete this file after Personal OCR development/verification is complete.

set "IMAGE=%~1"

if "%IMAGE%"=="" (
  echo.
  echo [ORCA] Personal OCR single-image test
  echo Drag a Personal screenshot onto this BAT file,
  echo or paste the full image path below.
  echo.
  set /p "IMAGE=Image path: "
)

if "%IMAGE%"=="" (
  echo [ORCA] No image selected.
  pause
  exit /b 1
)

if not exist "%IMAGE%" (
  echo [ORCA] File not found:
  echo %IMAGE%
  pause
  exit /b 1
)

if not exist ".venv\Scripts\python.exe" (
  echo [ORCA] Python venv not found: be\.venv
  echo Run START_OCR.bat once first.
  pause
  exit /b 1
)

where curl.exe >nul 2>nul
if errorlevel 1 (
  echo [ORCA] curl.exe was not found.
  pause
  exit /b 1
)

set "OUT=%TEMP%\orca_personal_ocr_%RANDOM%%RANDOM%.json"

echo.
echo [ORCA] Testing Personal OCR:
echo %IMAGE%
echo.

curl.exe -sS -X POST ^
  -F "screen_type=personal" ^
  -F "file=@%IMAGE%" ^
  "http://127.0.0.1:8001/extract" ^
  -o "%OUT%"

if errorlevel 1 (
  echo.
  echo [ORCA] Request failed. Check that START_OCR.bat is running.
  if exist "%OUT%" del "%OUT%" >nul 2>nul
  pause
  exit /b 1
)

echo [ORCA] OCR response:
echo ------------------------------------------------------------
".venv\Scripts\python.exe" -m json.tool "%OUT%"
set "RC=%ERRORLEVEL%"
echo ------------------------------------------------------------

if not "%RC%"=="0" (
  echo.
  echo [ORCA] The server response was not valid JSON.
  type "%OUT%"
)

if exist "%OUT%" del "%OUT%" >nul 2>nul

echo.
echo Check these fields:
echo   hero_key
echo   metrics[].metric_key
echo   metrics[].value
echo   metrics[].needs_review
echo.
pause
