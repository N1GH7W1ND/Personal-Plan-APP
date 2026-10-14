@echo off
rem ============================================================
rem  Workbench emergency stop (user edition).
rem  Use this when the launcher window was closed but the port is
rem  still held by a leftover process.
rem
rem  Kept ASCII-only on purpose (cmd reads it before chcp applies).
rem  Deliberately avoids Get-NetTCPConnection, which does not exist
rem  on Windows 7 / some trimmed-down systems; netstat is always there.
rem ============================================================
chcp 65001 >nul
title Workbench - stop
cd /d "%~dp0"

echo.
echo   Stopping a leftover Workbench service (ports 41730-41739)...
echo.

set "FOUND="
for /f "tokens=5" %%p in ('netstat -ano -p TCP ^| findstr /r /c:"LISTENING" ^| findstr /r /c:":4173[0-9] "') do (
  if not "%%p" = "0" (
    echo   stopping pid %%p
    taskkill /f /pid %%p >nul 2>nul
    if not errorlevel 1 set "FOUND=1"
  )
)

if defined FOUND (
  echo.
  echo   Done. You can start again with the launcher.
) else (
  echo   Nothing to stop.
)
echo.
pause
