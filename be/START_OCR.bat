@echo off
setlocal
cd /d %~dp0

if not exist .venv (
  echo [ORCA] Creating Python virtual environment...
  py -m venv .venv
)

call .venv\Scripts\activate

REM Always synchronize requirements. Previously this only ran when .venv was first
REM created, so newly-added packages such as PaddleOCR were never installed.
echo [ORCA] Checking Python dependencies...
python -m pip install -r requirements.txt
if errorlevel 1 (
  echo.
  echo [ORCA] Dependency installation failed. Server was not started.
  pause
  exit /b 1
)

echo [ORCA] Starting OCR server...
uvicorn app:app --reload --port 8001
pause
