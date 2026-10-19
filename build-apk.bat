@echo off
set "JAVA_HOME=C:\Program Files\Android\Android Studio\jbr"
set "ANDROID_HOME=C:\Users\Lenovo\AppData\Local\Android\Sdk"
set "GRADLE_BIN=C:\Users\Lenovo\.gradle\wrapper\dists\gradle-9.2.0-bin\11i5gvueggl8a5cioxuftxrik\gradle-9.2.0\bin\gradle.bat"
set "PATH=%JAVA_HOME%\bin;%ANDROID_HOME%\platform-tools;%PATH%"

cd /d "%~dp0android"
echo ============================================================
echo   Building PediaDrill APK (:app:assembleDebug)
echo   JAVA_HOME: %JAVA_HOME%
echo   ANDROID_HOME: %ANDROID_HOME%
echo   GRADLE: %GRADLE_BIN%
echo ============================================================

call "%GRADLE_BIN%" :app:assembleDebug

if exist "%~dp0android\app\build\outputs\apk\debug\app-debug.apk" (
    copy /y "%~dp0android\app\build\outputs\apk\debug\app-debug.apk" "%~dp0PediaDrill.apk" >nul
    echo.
    echo ============================================================
    echo   [SUCCESS] APK genere avec succes !
    echo   Fichier: %~dp0PediaDrill.apk
    echo ============================================================
)
