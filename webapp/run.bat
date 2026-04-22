@echo off
cd /d "%~dp0"
where python >nul 2>&1 || (echo Python not found in PATH & pause & exit /b 1)
if not exist ".venv\Scripts\python.exe" (
    echo Creating virtual environment...
    python -m venv .venv
)
call .venv\Scripts\activate.bat
echo Installing dependencies...
pip install -q -r requirements.txt
echo.
echo Starting WW Video Toolkit at http://127.0.0.1:5000
echo Press Ctrl+C to stop.
echo.
python app.py
pause
