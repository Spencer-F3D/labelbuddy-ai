@echo off
REM ============================================================
REM  LabelBuddy AI - fix Tencent Androws (YingYongBao) handle leak
REM
REM  This file is intentionally ASCII-only.
REM  All Chinese messages live in scripts/fix-androws-handles.ps1 (UTF-8),
REM  because .bat files garble non-ASCII text under chcp 65001.
REM
REM  Why administrator rights are required:
REM    The AndrowsSvr service runs as LocalSystem, and AndrowsStore.exe
REM    is spawned from it, so a normal-privilege process can neither
REM    stop it nor change the service startup type.
REM ============================================================

chcp 65001 >nul
cd /d "%~dp0"
title Fix Androws handle leak

REM --- already elevated? --------------------------------------
net session >nul 2>&1
if not errorlevel 1 goto run

echo.
echo  ============================================================
echo   Administrator privileges are required.
echo   A Windows UAC prompt will appear - please click "Yes".
echo  ============================================================
echo.

powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
if errorlevel 1 (
  echo.
  echo  [FAILED] Could not elevate automatically.
  echo           Please right-click this file, then choose
  echo           "Run as administrator".
  echo.
  pause
)
exit /b

:run
echo.
echo  Fixing Tencent Androws handle leak...
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\fix-androws-handles.ps1"
echo.
echo  Finished. A log was saved to your Desktop.
echo.
pause
exit /b 0
