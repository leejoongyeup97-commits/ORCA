@echo off
setlocal
cd /d "%~dp0"
echo [ORCA] Building production hero references...
if not exist ".venv\Scripts\python.exe" (
  echo [ORCA] Python venv not found: be\.venv
  pause
  exit /b 1
)
".venv\Scripts\python.exe" "ocr_benchmark\build_scoreboard_hero_references.py" "ocr_benchmark\images"
if errorlevel 1 (
  echo.
  echo [ORCA] Build failed.
  pause
  exit /b 1
)
echo.
echo [ORCA] Done.
echo Output: be\orca_ocr\hero_references
pause
