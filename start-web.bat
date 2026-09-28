@echo off
setlocal
cd /d "%~dp0"
set "PORT=3000"

if not exist "node_modules" (
  echo Project libraries are not installed yet.
  echo Run setup-first-time.bat before starting the project.
  pause
  exit /b 1
)

set "NODE_EXE=%~dp0runtime\node.exe"
if not exist "%NODE_EXE%" (
  where node >nul 2>&1
  if errorlevel 1 (
    echo Node.js was not found. Run setup-first-time.bat after installing Node.js.
    pause
    exit /b 1
  )
  set "NODE_EXE=node"
)

powershell -NoProfile -Command "try { $response = Invoke-WebRequest -UseBasicParsing 'http://localhost:3000/'; if ($response.StatusCode -eq 200) { exit 0 } } catch {} exit 1"
if not errorlevel 1 goto :openBrowser

echo Starting TasksMon web server...
start "TasksMon Web Server" /D "%~dp0" cmd /k ""%NODE_EXE%" "src\web\server.js""

set /a attempts=0
:waitForServer
set /a attempts+=1
timeout /t 1 /nobreak >nul
powershell -NoProfile -Command "try { $response = Invoke-WebRequest -UseBasicParsing 'http://localhost:3000/'; if ($response.StatusCode -eq 200) { exit 0 } } catch {} exit 1"
if not errorlevel 1 goto :openBrowser
if %attempts% LSS 20 goto :waitForServer

echo.
echo The web server did not start. Check the TasksMon Web Server window for details.
pause
exit /b 1

:openBrowser
start "" "http://localhost:3000"
echo TasksMon is open in your browser.
echo Keep the TasksMon Web Server window open while using the site.
timeout /t 3 /nobreak >nul
