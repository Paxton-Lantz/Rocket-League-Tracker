@echo off
cd /d "%~dp0"
echo Starting RL Capture daemon...
echo Leave this window open while you play.
echo.
python capture.py
pause
