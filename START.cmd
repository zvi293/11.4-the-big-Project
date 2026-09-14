@echo off
setlocal
title One Ribbon - Zstore AI
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 goto nonode
if "%PORT%"=="" set PORT=5190
echo.
echo   Zstore AI - One Ribbon
echo   Starting http://localhost:%PORT%/  (close this window to stop the server)
echo.
node serve.cjs --open
if errorlevel 1 pause
exit /b

:nonode
echo.
echo   Node.js was not found. Install Node.js 18 or newer from https://nodejs.org/
echo   and then double-click START.cmd again.
echo.
pause
exit /b 1
