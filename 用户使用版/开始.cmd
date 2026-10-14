@echo off
rem ============================================================
rem  Workbench launcher (user edition).
rem  Double-click this file to start the app.
rem
rem  =====  THIS FILE MUST BE PURE ASCII  =====
rem  cmd.exe parses the whole batch file BEFORE "chcp 65001"
rem  takes effect, using the system code page (GBK on Chinese
rem  Windows). A UTF-8 Chinese byte sequence gets misread there,
rem  the mojibake can contain characters like ")" or ".", and the
rem  whole block then fails to parse - the window closes instantly
rem  without even reaching "pause".
rem  This was a real bug: the window flashed and vanished.
rem  So: no Chinese in here. Chinese text for the user lives in
rem  the guide file in this folder (a markdown file).
rem ============================================================
chcp 65001 >nul
title Workbench - keep this window open
cd /d "%~dp0"

set "SKIP_PAUSE="
for %%a in (%*) do (
  if "%%a"=="--test" set "SKIP_PAUSE=1"
)

set "NODE_EXE="
set "LOCAL_NODE=%~dp0runtime\node\node.exe"

echo.
echo   ============================================
echo     Workbench
echo   ============================================
echo.

rem ---- 1) a portable Node the user placed here by hand ----
if exist "%LOCAL_NODE%" set "NODE_EXE=%LOCAL_NODE%"

rem ---- 2) Node already installed on this PC ----
if not defined NODE_EXE (
  where node >nul 2>nul
  if not errorlevel 1 set "NODE_EXE=node"
)

rem ---- 3) nothing found: stop and explain ----
rem  The guide file is README-FIRST.md. Its name is deliberately ASCII:
rem  a Chinese file name would have to be typed into this batch file as
rem  non-ASCII bytes, which is exactly what breaks cmd parsing.
if not defined NODE_EXE (
  echo   [ERROR] Node.js was not found on this computer.
  echo.
  echo   Workbench cannot run without Node.js. Installing it is
  echo   free and takes a few minutes - you only do it once.
  echo.
  echo   Step-by-step instructions ^(in Chinese^) are in the guide
  echo   README-FIRST.md in this folder. Opening it now...
  echo.
  start "" "%~dp0README-FIRST.md"
  echo.
  echo   If nothing opened: right-click README-FIRST.md, choose
  echo   "Open with", then Notepad.
  echo.
  echo   Short version:
  echo     1. Open https://nodejs.org/en/download
  echo     2. Download the LTS Windows Installer ^(.msi, 64-bit^)
  echo     3. Run it, click Next until it finishes
  echo     4. Come back and double-click this file again
  echo.
  if not defined SKIP_PAUSE pause
  exit /b 1
)

"%NODE_EXE%" -v >nul 2>nul
if errorlevel 1 (
  echo   [ERROR] The Node.js at "%NODE_EXE%" cannot run.
  echo   If that is the leftover copy inside the "runtime" folder,
  echo   delete that folder, then install Node.js as described in
  echo   the guide file in this folder.
  echo.
  if not defined SKIP_PAUSE pause
  exit /b 1
)

rem ---- 4) make node/npm visible to anything we spawn ----
for %%i in ("%NODE_EXE%") do set "NODE_BIN=%%~dpi"
if exist "%NODE_BIN%node.exe" set "PATH=%NODE_BIN%;%PATH%"

echo   Starting the app...
echo.
"%NODE_EXE%" "server\index.js" %*
set CODE=%ERRORLEVEL%

echo.
if not "%CODE%"=="0" (
  echo   The app stopped with exit code %CODE%.
  echo   Look at the messages above, and at the guide file in
  echo   this folder for common problems.
) else (
  echo   Stopped. You can close this window.
)
echo.
if not defined SKIP_PAUSE pause
exit /b %CODE%
