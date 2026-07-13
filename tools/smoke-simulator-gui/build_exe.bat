@echo off
setlocal
cd /d "%~dp0"

echo ==========================================
echo Building SmokeSimulatorGUI.exe
echo ==========================================

E:\Python3\python.exe -m PyInstaller --noconfirm --clean --onefile --windowed --name SmokeSimulatorGUI --add-data "config.json;." --add-data "devices.json;." --hidden-import device_state --hidden-import event_logger --hidden-import rest_client --hidden-import ws_client --hidden-import paho.mqtt.client --hidden-import requests --hidden-import websocket app.py

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
