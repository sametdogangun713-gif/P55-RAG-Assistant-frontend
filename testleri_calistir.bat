@echo off
rem P55 arayuz testleri (yalnizca Python standart kutuphanesi). Cift tikla.
chcp 65001 >nul
cd /d "%~dp0"
set "PY="
where py >nul 2>nul && set "PY=py -3"
if not defined PY ( where python >nul 2>nul && set "PY=python" )
if not defined PY (
    echo Python bulunamadi.
    pause
    exit /b 1
)
%PY% -m unittest discover -s tests -v
pause
