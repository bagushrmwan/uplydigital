@echo off
setlocal
cd /d "%~dp0"
title Uply Digital V31 - Vercel

echo ==========================================
echo UPLY DIGITAL V31 - DEPLOY KE VERCEL
echo ==========================================
echo.
where node >nul 2>nul || (
  echo Node.js belum terpasang. Install Node.js 20+ terlebih dahulu.
  pause
  exit /b 1
)

echo [1/3] Install dependency...
call npm install
if errorlevel 1 goto :error

echo [2/3] Login Vercel...
call npx vercel login
if errorlevel 1 goto :error

echo [3/3] Deploy production...
call npx vercel --prod
if errorlevel 1 goto :error

echo.
echo Deployment selesai. Jangan lupa isi Environment Variables di Dashboard Vercel.
pause
exit /b 0

:error
echo.
echo Deployment gagal. Baca pesan error di atas.
pause
exit /b 1
