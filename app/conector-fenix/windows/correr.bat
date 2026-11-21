@echo off
rem Lo llama el Programador de tareas cada 5 minutos. Una pasada y termina.
cd /d "%~dp0"
"%~dp0node.exe" "%~dp0conector.cjs"
