@echo off
REM ============================================================
REM  LabelBuddy AI - build Android APK
REM  This file is intentionally ASCII-only.
REM  All Chinese messages live in scripts/build-apk.mjs (UTF-8),
REM  because .bat files garble non-ASCII text under chcp 65001.
REM ============================================================

chcp 65001 >nul
cd /d "%~dp0"
title LabelBuddy AI - Build APK

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
echo  Building LabelBuddy AI APK...
echo  (This takes 2-5 minutes on the first run)
echo.
"%NODE_EXE%" "%~dp0scripts\build-apk.mjs"
set "RC=%ERRORLEVEL%"

echo.
if "%RC%"=="0" (
  echo  [OK] APK built successfully. Check your Desktop.
) else (
  echo  [FAILED] Exit code = %RC%
  echo           Read the messages above for the reason.
)
echo.
pause
exit /b %RC%
