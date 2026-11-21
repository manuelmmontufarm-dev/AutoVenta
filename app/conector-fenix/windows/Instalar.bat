@echo off
rem Deja el conector corriendo solo, cada 5 minutos, aunque nadie inicie sesion.
setlocal
cd /d "%~dp0"

net session >nul 2>&1
if errorlevel 1 (
  echo Hay que abrir este archivo con clic derecho y "Ejecutar como administrador".
  pause
  exit /b 1
)
if not exist "%~dp0node.exe" (
  echo Falta node.exe en esta carpeta.
  pause
  exit /b 1
)
if not exist "%~dp0config.json" (
  echo Falta config.json. Copie config.ejemplo.json como config.json y llenelo.
  pause
  exit /b 1
)

echo Probando antes de instalar...
"%~dp0node.exe" "%~dp0conector.cjs" --probar
if errorlevel 1 (
  echo.
  echo La prueba no paso. No se instalo nada. Corrija lo de arriba y vuelva a intentar.
  pause
  exit /b 1
)

rem config.json tiene la clave de la base: solo Administradores y el sistema lo pueden leer.
rem (S-1-5-32-544 = Administradores, S-1-5-18 = SYSTEM; por numero, porque el nombre cambia con el idioma.)
icacls "%~dp0config.json" /inheritance:r /grant:r "*S-1-5-32-544:F" "*S-1-5-18:F" >nul

schtasks /Create /TN "AutoVenta Conector Fenix" /TR "\"%~dp0correr.bat\"" /SC MINUTE /MO 5 /RU SYSTEM /F
if errorlevel 1 (
  echo No se pudo crear la tarea.
  pause
  exit /b 1
)
schtasks /Run /TN "AutoVenta Conector Fenix" >nul

echo.
echo Listo. El conector corre solo cada 5 minutos.
echo Lo que va haciendo queda en conector.log, en esta carpeta.
pause
