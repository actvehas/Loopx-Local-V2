@echo off
REM LoopX Local — Envia assets pra Hetzner e dispara montagem (Windows)
REM Uso: assemble.bat CANAL NUM [VAULT_PATH]
REM Exemplo: assemble.bat E 16

set CANAL=%1
set NUM=%2
set VAULT=%3
set HETZNER=root@65.109.85.250
set REMOTE_DIR=/root/loopx-local/jobs/%CANAL%/%NUM%

if "%VAULT%"=="" set VAULT=%USERPROFILE%\Documents\Obsidian Vault

if "%CANAL%"=="" (
    echo Uso: assemble.bat CANAL NUM [VAULT_PATH]
    echo Exemplo: assemble.bat E 16
    exit /b 1
)

REM Find episode folder
for /d %%d in ("%VAULT%\Projetos\*\%NUM% - *") do set EPISODE_DIR=%%d

if not defined EPISODE_DIR (
    echo Pasta do episodio %NUM% nao encontrada no vault
    exit /b 1
)

echo ================================================
echo ASSEMBLY — Canal %CANAL%, Episodio %NUM%
echo Pasta: %EPISODE_DIR%
echo Destino: %HETZNER%:%REMOTE_DIR%
echo ================================================

REM Check required files
if not exist "%EPISODE_DIR%\audio.wav" (
    echo [ERRO] Falta: audio.wav
    exit /b 1
)
if not exist "%EPISODE_DIR%\audio.srt" (
    echo [ERRO] Falta: audio.srt
    exit /b 1
)
if not exist "%EPISODE_DIR%\Cenas" (
    echo [ERRO] Pasta Cenas\ nao encontrada
    exit /b 1
)

echo.
echo PASSO 1: Criando pasta remota...
ssh %HETZNER% "mkdir -p %REMOTE_DIR%/Cenas"

echo.
echo PASSO 2: Enviando audio + SRT...
scp "%EPISODE_DIR%\audio.wav" "%EPISODE_DIR%\audio.srt" %HETZNER%:%REMOTE_DIR%/

echo.
echo PASSO 3: Enviando Cenas...
scp -r "%EPISODE_DIR%\Cenas\*.mp4" %HETZNER%:%REMOTE_DIR%/Cenas/

echo.
echo PASSO 4: Disparando montagem na Hetzner...
ssh %HETZNER% "cd /root/loopx-local && node assembly/assemble.js %CANAL% %NUM%"

echo.
echo ================================================
echo Assembly disparado.
echo ================================================
