@echo off
rem ============================================================
rem  Workbench emergency stop.
rem  Use this when the launcher window was closed but the port is
rem  still held by a leftover node process.
rem  (ASCII only on purpose: cmd reads this before switching code pages.)
rem ============================================================
chcp 65001 >nul
title Workbench - stop
cd /d "%~dp0"

echo.
echo   Stopping leftover Workbench service (ports 41730-41739)...
echo.

powershell -NoProfile -Command "$ports = 41730..41739; $found = $false; foreach ($p in $ports) { $conns = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue; foreach ($c in $conns) { $proc = Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue; if ($proc -and $proc.ProcessName -eq 'node') { Write-Host ('  stopping node pid ' + $proc.Id + ' on port ' + $p); Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue; $found = $true } } }; if (-not $found) { Write-Host '  nothing to stop.' }"

echo.
echo   Done. You can start again with the launcher.
echo.
pause
