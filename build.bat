@echo off
title ShellPoint — Build Portable v1.0.8
color 0A
echo.
echo  =============================================
echo   ShellPoint v1.0.8 — Build Portable Package
echo   Author: Alexandro Michel Davide
echo   https://franksec.com
echo  =============================================
echo.

REM --- Find npm ---
where npm >nul 2>&1
if %ERRORLEVEL% == 0 (
  set NPM_CMD=npm
  goto BUILD
)

for %%P in (
  "C:\Program Files\nodejs\npm.cmd"
  "C:\Program Files (x86)\nodejs\npm.cmd"
  "%APPDATA%\npm\npm.cmd"
  "%LOCALAPPDATA%\Programs\nodejs\npm.cmd"
  "%LOCALAPPDATA%\nvm\nodejs\npm.cmd"
) do (
  if exist %%P (
    set NPM_CMD=%%P
    goto BUILD
  )
)

echo [ERROR] Node.js not found. Install it from https://nodejs.org
pause
exit /b 1

:BUILD
echo [1/2] Installing dependencies...
%NPM_CMD% install --prefer-offline
echo.
echo [2/2] Building with electron-builder...
echo.
%NPM_CMD% run dist

if %ERRORLEVEL% NEQ 0 (
  echo.
  echo [ERROR] Build failed! Check the messages above.
  pause
  exit /b 1
)

echo.
echo  Build complete!
echo  Output file:
dir /b dist\*.zip 2>nul
echo.
echo  Ready to share on Check Mates!
echo.
pause
