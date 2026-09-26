@echo off
setlocal
cd /d "%~dp0"
echo [ORCA] Running scoreboard-native hero benchmark...
if not exist ".venv\Scripts\python.exe" (
  echo [ORCA] Python venv not found: be\.venv
  pause
  exit /b 1
)
".venv\Scripts\python.exe" "ocr_benchmark\run_scoreboard_hero_benchmark.py" "ocr_benchmark\images"
if errorlevel 1 (
  echo.
  echo [ORCA] Benchmark failed.
  pause
  exit /b 1
)
echo.
echo [ORCA] Done.
pause
