@echo off
REM LoopX Local — Baixa video final da Hetzner (Windows)
REM Uso: download.bat CANAL NUM [VAULT_PATH]
REM Exemplo: download.bat E 16

set CANAL=%1
set NUM=%2
set VAULT=%3
set HETZNER=root@65.109.85.250
set REMOTE_DIR=/root/loopx-local/jobs/%CANAL%/%NUM%

if "%VAULT%"=="" set VAULT=%USERPROFILE%\Documents\Obsidian Vault

if "%CANAL%"=="" (
    echo Uso: download.bat CANAL NUM [VAULT_PATH]
    exit /b 1
)

REM Find episode folder
for /d %%d in ("%VAULT%\Projetos\*\%NUM% - *") do set EPISODE_DIR=%%d

if not defined EPISODE_DIR (
    echo Pasta do episodio %NUM% nao encontrada no vault
    exit /b 1
)

echo Baixando final.mp4 de %HETZNER%:%REMOTE_DIR%/...
scp %HETZNER%:%REMOTE_DIR%/final.mp4 "%EPISODE_DIR%\final.mp4"

if exist "%EPISODE_DIR%\final.mp4" (
    echo Download completo: %EPISODE_DIR%\final.mp4
) else (
    echo [ERRO] final.mp4 nao encontrado no servidor
)
