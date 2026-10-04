@echo off
REM ============================================================
REM  LabelBuddy AI - one-shot sync: GitHub -> live site -> APK
REM  This file is intentionally ASCII-only.
REM  All Chinese messages live in scripts/ship.mjs (UTF-8),
REM  because .bat files garble non-ASCII text under chcp 65001.
REM
REM  It runs scripts/ship-all.mjs, which does (in this fixed order):
REM    0. check the working tree is clean (stop if not)
REM    1. static checks + test suite (tsc, check:*)
REM    2. vite build                      -> dist/
REM    3. git push origin main            -> GitHub
REM    4. wrangler deploy                 -> live site
REM    5. build the Android APK           -> Desktop
REM    6. verify all three are the SAME build (scripts/check-consistency.ts)
REM
REM  Step 6 is the point: steps 0-5 can all "succeed" and still produce
REM  mismatched artifacts. If verification fails, this fails.
REM ============================================================

chcp 65001 >nul
cd /d "%~dp0"
title LabelBuddy AI - Sync GitHub / Live / APK

REM --- locate node.exe -----------------------------------------
set "NODE_EXE="

if exist "%~dp0node.exe" set "NODE_EXE=%~dp0node.exe"
if defined NODE_EXE goto run

where node >nul 2>nul
if not errorlevel 1 set "NODE_EXE=node"
if defined NODE_EXE goto run

set "WB=%USERPROFILE%\.workbuddy-ai\binaries\node\versions"
if exist "%WB%\current" (
  set /p WBVER=<"%WB%\current"
)
if defined WBVER if exist "%WB%\%WBVER%\node.exe" set "NODE_EXE=%WB%\%WBVER%\node.exe"
if defined NODE_EXE goto run

if exist "%WB%\22.22.2-3\node.exe" set "NODE_EXE=%WB%\22.22.2-3\node.exe"
if defined NODE_EXE goto run

echo.
echo  [ERROR] Node.js not found.
echo          Install Node.js 22+ from https://nodejs.org
echo.
pause
exit /b 1

:run
echo.
echo  Syncing LabelBuddy AI: GitHub / live site / APK...
echo  (APK build alone takes 2-5 minutes)
echo.
"%NODE_EXE%" "%~dp0scripts\ship-all.mjs"
set "RC=%ERRORLEVEL%"

echo.
if "%RC%"=="0" (
  echo  [OK] All three artifacts are consistent.
) else (
  echo  [FAILED] Exit code = %RC%
  echo           Read the messages above for the reason.
)
echo.
pause
exit /b %RC%
