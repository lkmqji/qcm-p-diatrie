@echo off
set "JAVA_HOME=C:\Program Files\Android\Android Studio\jbr"
set "ANDROID_HOME=C:\Users\Lenovo\AppData\Local\Android\Sdk"
set "GRADLE_BIN=C:\Users\Lenovo\.gradle\wrapper\dists\gradle-9.2.0-bin\11i5gvueggl8a5cioxuftxrik\gradle-9.2.0\bin\gradle.bat"
set "PATH=%JAVA_HOME%\bin;%ANDROID_HOME%\platform-tools;%PATH%"

echo ============================================================
echo   [1/3] Assemblage du Bundle Web de Production
echo ============================================================
call node "%~dp0build-bundle.cjs"
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Echec de la generation du bundle web.
    exit /b %ERRORLEVEL%
)

echo.
echo ============================================================
echo   [2/3] Synchronisation Capacitor Android
echo ============================================================
cd /d "%~dp0"
call npx.cmd cap sync android
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Echec de la synchronisation Capacitor.
    exit /b %ERRORLEVEL%
)

echo.
echo ============================================================
echo   [3/3] Compilation Native Android APK (:app:assembleDebug)
echo   JAVA_HOME: %JAVA_HOME%
echo   ANDROID_HOME: %ANDROID_HOME%
echo   GRADLE: %GRADLE_BIN%
echo ============================================================
cd /d "%~dp0android"
call "%GRADLE_BIN%" :app:assembleDebug
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Echec de la compilation Gradle.
    exit /b %ERRORLEVEL%
)

if exist "%~dp0android\app\build\outputs\apk\debug\app-debug.apk" (
    copy /y "%~dp0android\app\build\outputs\apk\debug\app-debug.apk" "%~dp0PediaDrill.apk" >nul
    echo.
    echo ============================================================
    echo   [SUCCESS] APK genere et synchronise avec succes !
    echo   Fichier: %~dp0PediaDrill.apk
    echo ============================================================
)
