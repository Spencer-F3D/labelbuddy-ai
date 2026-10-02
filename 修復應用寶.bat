@echo off
REM ============================================================
REM  LabelBuddy AI - fix Tencent Androws (YingYongBao) handle leak
REM
REM  This file is intentionally ASCII-only.
REM  All Chinese messages live in scripts/fix-androws-handles.ps1 (UTF-8),
REM  because .bat files garble non-ASCII text under chcp 65001.
REM
REM  Why administrator rights are required:
REM    The AndrowsSvr service runs as LocalSystem (ObjectName=LocalSystem),
REM    and AndrowsStore.exe is spawned from it. A normal-privilege process
REM    can neither stop it nor change the service.
REM
REM  How elevation works:
REM    %~f0 is passed through an ENVIRONMENT VARIABLE (not the command
REM    line), so the PowerShell command string stays pure ASCII even
REM    though this file has a Chinese name.
REM ============================================================

chcp 65001 >nul
cd /d "%~dp0"
title Fix Androws handle leak

set "SCRIPT=%~dp0scripts\fix-androws-handles.ps1"

if not exist "%SCRIPT%" (
  echo.
  echo  [ERROR] Script not found:
  echo          %SCRIPT%
  echo.
  pause
  exit /b 1
)

REM --- already elevated? --------------------------------------
net session >nul 2>&1
if not errorlevel 1 goto run

echo.
echo  ============================================================
echo   Administrator privileges are required.
echo.
echo   A Windows UAC prompt will appear now.
echo   Please click "Yes"  (or "Run as administrator").
echo  ============================================================
echo.

set "SELF=%~f0"
powershell -NoProfile -Command "Start-Process -FilePath $env:SELF -Verb RunAs"

if errorlevel 1 (
  echo.
  echo  [FAILED] Automatic elevation did not start.
  echo.
  echo  Please do this instead:
  echo    RIGHT-CLICK this file  ^>  "Run as administrator"
  echo.
  pause
  exit /b 1
)

exit /b 0

:run
echo.
echo  Running as administrator - starting repair...
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT%"
echo.
echo  Finished. A log was saved to your Desktop:
echo    YingYongBao repair log
echo.
pause
exit /b 0
