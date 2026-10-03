@echo off
rem P55 arayuzu (frontend) - yerelde calistirir. Cift tikla.
rem Backend ayrica calismali: P55-RAG-Assistant-backend\baslat.bat (http://127.0.0.1:8000)
chcp 65001 >nul
cd /d "%~dp0"

set "PY="
where py >nul 2>nul && set "PY=py -3"
if not defined PY ( where python >nul 2>nul && set "PY=python" )
if not defined PY (
    echo Python bulunamadi. Python 3.10 veya ustunu kurun: https://www.python.org/downloads/
    pause
    exit /b 1
)

if not defined P55_FRONT_PORT set "P55_FRONT_PORT=5500"
echo Arayuz: http://localhost:%P55_FRONT_PORT%   (kapatmak icin Ctrl+C)
echo Backend adresi public\config.js dosyasindadir.
start "" cmd /c "timeout /t 2 >nul & start http://localhost:%P55_FRONT_PORT%"
%PY% -m http.server %P55_FRONT_PORT% --bind 127.0.0.1 --directory public
