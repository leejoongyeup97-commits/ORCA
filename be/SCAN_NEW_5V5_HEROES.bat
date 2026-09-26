@echo off
setlocal
cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
  echo [ORCA] Python venv not found: be\.venv
  pause
  exit /b 1
)

echo [ORCA] Scanning newly added 5v5 Team screenshots...
".venv\Scripts\python.exe" "ocr_benchmark\scan_new_5v5_hero_coverage.py"

if errorlevel 1 (
  echo.
  echo [ORCA] New 5v5 hero scan failed.
  pause
  exit /b 1
)

echo.
echo [ORCA] Done.
echo Check: be\ocr_benchmark\new_5v5_needs_review.jpg
pause
