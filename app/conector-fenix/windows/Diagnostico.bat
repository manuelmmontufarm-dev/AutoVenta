@echo off
rem Diagnostico para el conector de AutoVenta. SOLO LEE: no instala ni cambia nada.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0diagnostico.ps1"
echo.
pause
