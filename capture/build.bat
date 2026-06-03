@echo off
setlocal
cd /d "%~dp0"

echo ================================================
echo  RL Capture -- Build Single .exe
echo ================================================
echo.
echo This bundles Python, all dependencies, and Tesseract
echo into one self-contained executable (~80-120 MB).
echo.
echo Run this once whenever you update capture.py.
echo Distribute: dist\rl-capture.exe + config.json
echo.

:: ── Check Tesseract ──────────────────────────────────────────────────────────
set TESS_DIR=C:\Program Files\Tesseract-OCR
if not exist "%TESS_DIR%\tesseract.exe" (
    echo ERROR: Tesseract not found at:
    echo   %TESS_DIR%
    echo.
    echo Install it first from:
    echo   https://github.com/UB-Mannheim/tesseract/wiki
    echo Use the default install path.
    pause
    exit /b 1
)
echo [OK] Tesseract found.

:: ── Check Python ─────────────────────────────────────────────────────────────
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Python not found in PATH.
    echo Install from https://www.python.org/downloads/
    pause
    exit /b 1
)
echo [OK] Python found.

:: ── Install/update PyInstaller ───────────────────────────────────────────────
echo.
echo [1/3] Installing PyInstaller...
pip install --quiet --upgrade pyinstaller
if %errorlevel% neq 0 (
    echo ERROR: Could not install PyInstaller.
    pause
    exit /b 1
)
echo [OK] PyInstaller ready.

:: ── Install capture dependencies ─────────────────────────────────────────────
echo.
echo [2/3] Installing capture dependencies...
pip install --quiet -r requirements.txt
if %errorlevel% neq 0 (
    echo ERROR: pip install failed.
    pause
    exit /b 1
)
echo [OK] Dependencies ready.

:: ── Build ────────────────────────────────────────────────────────────────────
echo.
echo [3/3] Building rl-capture.exe (this takes 30-90 seconds)...
echo.
pyinstaller rl-capture.spec --noconfirm
if %errorlevel% neq 0 (
    echo.
    echo ERROR: PyInstaller build failed. See output above for details.
    pause
    exit /b 1
)

:: ── Done ─────────────────────────────────────────────────────────────────────
echo.
echo ================================================
echo  Build complete!
echo.
echo  Executable: dist\rl-capture.exe
echo.
echo  To distribute to another machine:
echo    1. Copy dist\rl-capture.exe
echo    2. Copy config.json to the same folder
echo    3. Edit config.json: set "username" to your Epic username
echo    4. Double-click rl-capture.exe to start the daemon
echo.
echo  No Python, no Tesseract, no installs needed on the target machine.
echo ================================================
pause
