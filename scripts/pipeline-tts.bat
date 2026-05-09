@echo off
REM LoopX Local — Pipeline TTS (Windows, PyTorch + CUDA)
REM Uso: pipeline-tts.bat NUM ROTEIRO VOZ OUTPUT_DIR
REM Exemplo: pipeline-tts.bat 16 roteiro.md E-female-es-01 .\output\

set NUM=%1
set INPUT=%2
set VOICE=%3
set OUTPUT_DIR=%4
set SCRIPT_DIR=%~dp0
set VOICE_REFS=%SCRIPT_DIR%..\config\voice-refs.json
set SPEED=0.9

if "%NUM%"=="" (
    echo Uso: pipeline-tts.bat NUM ROTEIRO VOZ OUTPUT_DIR
    echo Exemplo: pipeline-tts.bat 16 roteiro.md E-female-es-01 .\output\
    exit /b 1
)

if not exist "%OUTPUT_DIR%" mkdir "%OUTPUT_DIR%"

echo ================================================
echo PIPELINE TTS — Roteiro %NUM%
echo Voz: %VOICE% ^| Speed: %SPEED% ^| CUDA
echo ================================================

REM Passo 1: Gerar audio TTS via PyTorch
echo.
echo PASSO 1: QWEN3-TTS (PyTorch + CUDA)
echo ------------------------------------------------
python "%SCRIPT_DIR%tts-generate-win.py" "%INPUT%" "%VOICE%" "%OUTPUT_DIR%" "%VOICE_REFS%" %SPEED%
if errorlevel 1 (
    echo [ERRO] TTS falhou
    exit /b 1
)

REM Passo 2: Concatenar chunks
echo.
echo PASSO 2: CONCATENAR CHUNKS
echo ------------------------------------------------
(for /f "tokens=*" %%f in ('dir /b /o:n "%OUTPUT_DIR%\chunk_*.wav"') do echo file '%OUTPUT_DIR%\%%f') > "%OUTPUT_DIR%\filelist.txt"
ffmpeg -y -f concat -safe 0 -i "%OUTPUT_DIR%\filelist.txt" -c copy "%OUTPUT_DIR%\audio-completo.wav" 2>nul
if not exist "%OUTPUT_DIR%\audio-completo.wav" (
    echo [ERRO] Falha ao concatenar
    exit /b 1
)
echo [OK] Audio completo: %OUTPUT_DIR%\audio-completo.wav

REM Passo 3: Whisper
echo.
echo PASSO 3: WHISPER (GPU)
echo ------------------------------------------------
python "%SCRIPT_DIR%whisper-scenes.py" "%OUTPUT_DIR%\audio-completo.wav" "%OUTPUT_DIR%" es
if errorlevel 1 (
    echo [ERRO] Whisper falhou
    exit /b 1
)

echo.
echo ================================================
echo [OK] PIPELINE COMPLETO — Roteiro %NUM%
echo   Audio: %OUTPUT_DIR%\audio-completo.wav
echo   SRT: %OUTPUT_DIR%\audio.srt
echo   Cenas: %OUTPUT_DIR%\cenas-minutagem.md
echo   Proximo: /sincronizador com roteiro + cenas
echo ================================================
