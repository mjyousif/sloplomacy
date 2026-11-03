@echo off
REM Quick start batch file for Diplomacy 1901 Tactical Engine
cd /d "%~dp0"
python quickstart.py %*
if errorlevel 1 (
    echo.
    echo Script ended or encountered an error.
    pause
)
