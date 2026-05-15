@echo off
title ShellPoint Runner
echo Avvio di ShellPoint in corso...

REM --- Cerca npm nel PATH standard ---
where npm >nul 2>&1
if %ERRORLEVEL% == 0 goto RUN

REM --- Percorsi comuni di installazione Node.js ---
set NODE_PATHS=^
  "C:\Program Files\nodejs\npm.cmd" ^
  "C:\Program Files (x86)\nodejs\npm.cmd" ^
  "%APPDATA%\npm\npm.cmd" ^
  "%LOCALAPPDATA%\Programs\nodejs\npm.cmd" ^
  "%LOCALAPPDATA%\nvm\nodejs\npm.cmd"

for %%P in (%NODE_PATHS%) do (
  if exist %%P (
    set NPM_CMD=%%P
    goto RUN_FULL
  )
)

REM --- Non trovato ---
echo.
echo [ERRORE] Node.js / npm non trovato nel sistema.
echo Scarica e installa Node.js da: https://nodejs.org
echo.
pause
exit /b 1

:RUN
npm start
goto END

:RUN_FULL
echo Trovato npm in: %NPM_CMD%
%NPM_CMD% start
goto END

:END
pause
