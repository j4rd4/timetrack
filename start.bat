@echo off
title TimeTrack Server
cd /d "%~dp0"
echo ==============================================
echo    Spoustim TimeTracker (Node.js)
echo ==============================================
echo.

where node >nul 2>nul
if %ERRORLEVEL% equ 0 (
    echo Pouzivam Node.js server...
    @REM  start http://localhost:3000
    node server.js
    pause
    exit /b
)

echo CHYBA: Nebyl nalezen Node.js pro spusteni backendu.
pause
