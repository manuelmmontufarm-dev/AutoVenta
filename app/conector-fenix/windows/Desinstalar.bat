@echo off
rem Quita la tarea. No toca Fenix ni borra esta carpeta.
net session >nul 2>&1
if errorlevel 1 (
  echo Hay que abrir este archivo con clic derecho y "Ejecutar como administrador".
  pause
  exit /b 1
)
schtasks /Delete /TN "AutoVenta Conector Fenix" /F
echo.
echo Listo. El conector ya no corre. Puede borrar esta carpeta.
pause
