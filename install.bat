@echo off
setlocal enabledelayedexpansion

echo.
echo   Synthetic Test Generator -- Setup
echo   ===================================
echo.

:: ── 1. Check for Node.js ───────────────────────
where node >nul 2>&1
if errorlevel 1 (
    echo  [ERROR] Node.js not found.
    echo.
    echo  Please install Node.js 18 or later and try again:
    echo  -^> https://nodejs.org/en/download
    pause
    exit /b 1
)

for /f "delims=" %%v in ('node -e "process.stdout.write(process.versions.node)"') do set NODE_VER=%%v
for /f "tokens=1 delims=." %%m in ("!NODE_VER!") do set MAJOR=%%m

if !MAJOR! LSS 18 (
    echo  [ERROR] Node.js !NODE_VER! detected -- version 18+ is required.
    echo  -^> https://nodejs.org/en/download
    pause
    exit /b 1
)

echo  [OK] Node.js !NODE_VER!

:: ── 2. Resolve app directory ───────────────────
set "APP_DIR=%~dp0app"

if not exist "%APP_DIR%" (
    echo  [ERROR] Cannot find app\ directory at: %APP_DIR%
    pause
    exit /b 1
)

:: ── 3. Install dependencies ────────────────────
echo.
echo  Installing dependencies...
cd /d "%APP_DIR%"
call npm install --prefer-offline --loglevel=error

if errorlevel 1 (
    echo  [ERROR] npm install failed.
    pause
    exit /b 1
)

echo  [OK] Dependencies installed

:: ── 4. Launch dev server ───────────────────────
echo.
echo  Starting app -- it will open in your browser automatically.
echo  Press Ctrl+C to stop.
echo.

call npm run dev -- --open
pause
