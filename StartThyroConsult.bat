@echo off
title ThyroConsult Launcher
color 0A

echo.
echo  =============================================
echo    ThyroConsult - Starting All Services
echo  =============================================
echo.

echo  [1/2] Starting Backend...
start "ThyroConsult - Backend" cmd /k "cd /d "D:\Thyroid Consultation Software\ThyroConsult Backend\thyroconsult-backend" && echo. && echo  Backend starting... && echo. && npm run dev"

timeout /t 3 /nobreak >nul

echo  [2/2] Starting Frontend...
start "ThyroConsult - Frontend" cmd /k "cd /d "D:\Thyroid Consultation Software\ThyroConsult Frontend\thyroconsult-frontend" && echo. && echo  Frontend starting... && echo. && npm start"

echo.
echo  =============================================
echo    Both services are starting in their own windows.
echo.
echo    Check EACH window for its actual URL - the port
echo    depends on what's in your .env files and whether
echo    anything else is already using the default port.
echo    (If the Frontend window asks "Would you like to
echo    run the app on another port instead?", press Y.)
echo.
echo    Backend  window prints something like:
echo      "ThyroConsult API running on port XXXX"
echo    Frontend window prints something like:
echo      "Local:  http://localhost:XXXX"
echo.
echo    Use the port the Frontend window actually prints -
echo    not a fixed number - to open the app in your browser.
echo  =============================================
echo.

exit
