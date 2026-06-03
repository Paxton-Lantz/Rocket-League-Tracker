@echo off
echo ================================================
echo  RL Capture -- One-Time Setup
echo ================================================
echo.

echo [1/2] Installing Python dependencies...
pip install -r requirements.txt
if %errorlevel% neq 0 (
    echo ERROR: pip install failed.
    echo Make sure Python is installed and in your PATH.
    echo Download Python from https://www.python.org/downloads/
    pause
    exit /b 1
)

echo.
echo [2/2] Checking for Tesseract...
set TESS_PATH=C:\Program Files\Tesseract-OCR\tesseract.exe
if exist "%TESS_PATH%" (
    echo Tesseract found at: %TESS_PATH%
) else (
    echo.
    echo ERROR: Tesseract not found.
    echo.
    echo Download and install it from:
    echo   https://github.com/UB-Mannheim/tesseract/wiki
    echo.
    echo Install to the DEFAULT location:
    echo   C:\Program Files\Tesseract-OCR\
    echo.
    echo After installing, run this script again.
    pause
    exit /b 1
)

echo.
echo ================================================
echo  Setup complete!
echo.
echo  Next steps:
echo    1. Edit config.json and set your username
echo    2. Run start.bat before each session
echo ================================================
pause
