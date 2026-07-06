@echo off
setlocal
cd /d "%~dp0"

echo ==========================================
echo Building SmokeSimulatorGUI.exe
echo ==========================================

E:\annicoda\python.exe -m PyInstaller --noconfirm --clean --onefile --windowed --name SmokeSimulatorGUI --add-data "config.json;." --add-data "devices.json;." app.py

if errorlevel 1 (
    echo.
    echo Build failed. Please check the error output above.
    pause
    exit /b 1
)

echo.
echo Build completed:
echo %~dp0dist\SmokeSimulatorGUI.exe
echo.
pause
