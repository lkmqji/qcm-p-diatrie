@echo off
title PediaDrill - Serveur Local
cd /d "%~dp0"

echo ============================================================
echo   PediaDrill - Lancement Local
echo ============================================================
echo.

echo [1/2] Assemblage et synchronisation des bundles de production...
call node build-bundle.cjs
if %ERRORLEVEL% NEQ 0 (
    echo [ATTENTION] La compilation a signale un avertissement, poursuite avec les fichiers existants...
)

echo.
echo [2/2] Demarrage du serveur local et ouverture de l'application...
call node server.cjs
pause
