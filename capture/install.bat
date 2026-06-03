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

:: ── Monitor detection ───────────────────────────────────────────────────────
echo.
echo [3/3] Detecting monitors...
for /f %%i in ('powershell -nologo -noprofile -command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Screen]::AllScreens.Count"') do set MONITOR_COUNT=%%i

if "%MONITOR_COUNT%"=="" set MONITOR_COUNT=1

if %MONITOR_COUNT% GTR 1 (
    echo Found %MONITOR_COUNT% monitors.
    set /p "MON_NUM=Which monitor does Rocket League run on? [1-%MONITOR_COUNT%]: "
    powershell -nologo -noprofile -command "(Get-Content config.json -Raw) -replace '\"monitor\"\s*:\s*\d+', '\"monitor\": %MON_NUM%' | Set-Content config.json -NoNewline"
    echo config.json updated: monitor = %MON_NUM%
) else (
    echo Single monitor detected — no change needed.
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
