@echo off
rem Lee Fenix y le pregunta al bot que pasaria. NO guarda nada.
cd /d "%~dp0"
if not exist "%~dp0node.exe" (
  echo Falta node.exe en esta carpeta.
  pause
  exit /b 1
)
"%~dp0node.exe" "%~dp0conector.cjs" --probar
echo.
pause
