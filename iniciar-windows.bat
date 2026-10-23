@echo off
cd /d "%~dp0"
echo Iniciando Laboratorio Duck Everything...
py serve.py
if %ERRORLEVEL% NEQ 0 (
    python serve.py
)
pause
