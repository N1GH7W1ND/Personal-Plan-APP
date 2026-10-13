@echo off
rem ============================================================
rem  Workbench local app launcher.
rem  Double-click this file to start. Keep the window open while using.
rem  (Comments are ASCII on purpose: cmd reads this file before
rem   switching code pages, so non-ASCII here would break parsing.)
rem ============================================================
chcp 65001 >nul
title Workbench - keep this window open
cd /d "%~dp0"

set "SKIP_PAUSE="
for %%a in (%*) do (
  if "%%a"=="--test" set "SKIP_PAUSE=1"
)

echo.
echo   Starting Workbench...
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo   [ERROR] Node.js not found.
  echo.
  echo   This app needs Node.js to run locally.
  echo   Please install the LTS version from https://nodejs.org/ and try again.
  echo.
  if not defined SKIP_PAUSE pause
  exit /b 1
)

node "server\index.js" %*
set CODE=%ERRORLEVEL%

echo.
if not "%CODE%"=="0" (
  echo   Failed to start, exit code %CODE%. Check the messages above.
) else (
  echo   Server stopped.
)
echo.
if not defined SKIP_PAUSE pause
exit /b %CODE%
