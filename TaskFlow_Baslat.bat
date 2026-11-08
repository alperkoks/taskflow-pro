@echo off
chcp 65001 >nul
title TaskFlow Pro+ Bagimsiz Masaustu
cd /d "%~dp0"

:: 1. Her zaman en guncel yerel dosyalari (index.html / app.js) aninda ac (Sifir bekleme, her zaman guncel!)
if exist "node_modules\electron\dist\electron.exe" (
    start "" "node_modules\electron\dist\electron.exe" .
    exit
)

:: 2. Yedek: Paketlenmis .exe varsa calistir
if exist "TaskFlow+.exe" (
    start "" "TaskFlow+.exe"
    exit
)
if exist "dist\win-unpacked\TaskFlow Pro+.exe" (
    start "" "dist\win-unpacked\TaskFlow Pro+.exe"
    exit
)

call npx electron .
exit
