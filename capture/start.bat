@echo off
cd /d "%~dp0"
echo Starting RL Capture daemon...
echo Leave this window open while you play.
echo.
C:\Users\paxto\AppData\Local\Programs\Python\Python312\python.exe capture.py
pause
