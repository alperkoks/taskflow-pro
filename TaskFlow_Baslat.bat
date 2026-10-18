@echo off
chcp 65001 >nul
title TaskFlow Pro Masaustu Baslatici
echo TaskFlow Pro baslatiliyor...

:: Chrome veya Edge ile dogrudan Uygulama (App) modunda (adres cubugu olmadan) acar
if exist "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" (
    start "" "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --app="file:///%~dp0index.html" --window-size=1180,820
    exit
)

if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
    start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --app="file:///%~dp0index.html" --window-size=1180,820
    exit
)

start "" "%~dp0index.html"
