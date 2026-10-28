@echo off
chcp 65001 >nul
title TaskFlow Pro+ Bagimsiz Masaustu
echo ===================================================
echo     TaskFlow Pro+ Bagimsiz Masaustu Baslatiliyor...
echo     (Google Chrome bagimsiz - Ozgun Native App)
echo ===================================================

cd /d "%~dp0"

:: 1. Eger dist klasorunde .exe derlenmisse dogrudan onu calistir
if exist "dist\TaskFlow Pro+ 26.0.0.exe" (
    start "" "dist\TaskFlow Pro+ 26.0.0.exe"
    exit
)
if exist "dist\win-unpacked\TaskFlow Pro+.exe" (
    start "" "dist\win-unpacked\TaskFlow Pro+.exe"
    exit
)
if exist "dist\TaskFlow Pro+.exe" (
    start "" "dist\TaskFlow Pro+.exe"
    exit
)

:: 2. Node/Electron ile bagimsiz masaustu penceresini baslat
call npx electron .
exit
