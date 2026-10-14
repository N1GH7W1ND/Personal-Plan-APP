@echo off
rem ============================================================
rem  Self check for the user copy.
rem  Starts the app on a spare port with a temporary data folder,
rem  pokes it a few times, then cleans up. Normal users never need
rem  this - it exists so a problem can be reported with evidence.
rem
rem  ASCII-only on purpose (see the launcher for the reason).
rem ============================================================
chcp 65001 >nul
title Workbench - self check
cd /d "%~dp0"

set "NODE_EXE="
if exist "%~dp0runtime\node\node.exe" set "NODE_EXE=%~dp0runtime\node\node.exe"
if not defined NODE_EXE (
  where node >nul 2>nul
  if not errorlevel 1 set "NODE_EXE=node"
)

if not defined NODE_EXE (
  echo.
  echo   Node.js is not available yet. Please run the launcher once first.
  echo.
  pause
  exit /b 1
)

set "DSH_NO_BROWSER=1"
"%NODE_EXE%" "selfcheck.cjs"
set CODE=%ERRORLEVEL%

echo.
if "%CODE%"=="0" (
  echo   Self check passed.
) else (
  echo   Self check reported a problem ^(exit code %CODE%^).
  echo   Keep this window open and send a photo of it.
)
echo.
pause
exit /b %CODE%
