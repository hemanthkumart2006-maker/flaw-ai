@echo off
TITLE Flaw AI Ultra - Desktop Voice Agent
echo ===================================================
echo     Flaw AI Ultra - Startup Voice Assistant
echo ===================================================
echo Starting Flaw AI server on http://localhost:3000...

cd /d "%~dp0\.."

:: Check if node is available
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is required to run Flaw AI Ultra.
    pause
    exit /b 1
)

:: Start Server in background
start "" /b npm run dev

:: Wait 3 seconds for server boot
timeout /t 3 /nobreak >nul

:: Launch default browser directly to the Voice Assistant view
start http://localhost:3000

echo Flaw AI Voice Agent is active and listening for your interactions.
exit /b 0
