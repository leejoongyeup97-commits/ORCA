@echo off
setlocal
cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
  echo [ORCA] Python venv not found: be\.venv
  pause
  exit /b 1
)

echo [ORCA] Checking hero reference coverage...
".venv\Scripts\python.exe" "ocr_benchmark\report_hero_coverage.py"

echo.
pause
