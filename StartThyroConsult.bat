@echo off
title ThyroConsult Launcher
color 0A

echo.
echo  =============================================
echo    ThyroConsult - Starting All Services
echo  =============================================
echo.

echo  [1/2] Starting Backend on port 7000...
start "ThyroConsult - Backend" cmd /k "cd /d "D:\Thyroid Consultation Software\ThyroConsult Backend\thyroconsult-backend" && echo. && echo  Backend starting... && echo. && npm run dev"

timeout /t 3 /nobreak >nul

echo  [2/2] Starting Frontend on port 7070...
start "ThyroConsult - Frontend" cmd /k "cd /d "D:\Thyroid Consultation Software\ThyroConsult Frontend\thyroconsult-frontend" && echo. && echo  Frontend starting... && echo. && npm start"

echo.
echo  =============================================
echo    Backend  - http://localhost:7000
echo    Frontend - http://localhost:7070
echo  =============================================
echo.
echo  Browser will open in 15 seconds...
timeout /t 15 /nobreak >nul
start "" "http://localhost:7070"

exit
