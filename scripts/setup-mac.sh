#!/bin/bash
# LoopX Local — Setup Mac (Apple Silicon)
# Apenas verifica dependencias, nao instala (Mac ja tem tudo via sessoes anteriores)

echo "================================================"
echo "  LoopX Local — Verificacao Mac"
echo "================================================"
echo ""

ERRORS=0

# Node.js
if command -v node &> /dev/null; then
    echo "[OK] Node.js $(node --version)"
else
    echo "[FALTA] Node.js"
    ERRORS=$((ERRORS+1))
fi

# Python
if command -v python3 &> /dev/null; then
    echo "[OK] Python $(python3 --version 2>&1 | cut -d' ' -f2)"
else
    echo "[FALTA] Python 3"
    ERRORS=$((ERRORS+1))
fi

# FFmpeg
if command -v ffmpeg &> /dev/null; then
    echo "[OK] FFmpeg instalado"
else
    echo "[FALTA] FFmpeg"
    ERRORS=$((ERRORS+1))
fi

# Whisper
if python3 -c "import whisper" 2>/dev/null; then
    echo "[OK] Whisper instalado"
else
    echo "[FALTA] Whisper — pip install openai-whisper"
    ERRORS=$((ERRORS+1))
fi

# MLX Audio (TTS)
if python3 -c "import mlx_audio" 2>/dev/null; then
    echo "[OK] MLX Audio (Qwen3-TTS)"
else
    echo "[FALTA] MLX Audio — pip install mlx-audio"
    ERRORS=$((ERRORS+1))
fi

# SSH Hetzner
if ssh -o ConnectTimeout=3 -o BatchMode=yes root@65.109.85.250 "echo ok" 2>/dev/null; then
    echo "[OK] SSH Hetzner"
else
    echo "[FALTA] SSH Hetzner (65.109.85.250)"
    ERRORS=$((ERRORS+1))
fi

# Claude Code
if command -v claude &> /dev/null; then
    echo "[OK] Claude Code CLI"
else
    echo "[FALTA] Claude Code — npm install -g @anthropic-ai/claude-code"
    ERRORS=$((ERRORS+1))
fi

# Voice refs
VOICE_REFS="$(dirname "$0")/../config/voice-refs.json"
if [ -f "$VOICE_REFS" ]; then
    VOICES=$(python3 -c "import json; print(len(json.load(open('$VOICE_REFS'))))" 2>/dev/null)
    echo "[OK] Voice refs ($VOICES vozes)"
else
    echo "[FALTA] config/voice-refs.json"
    ERRORS=$((ERRORS+1))
fi

echo ""
if [ $ERRORS -eq 0 ]; then
    echo "Tudo OK. Pipeline pronta."
else
    echo "$ERRORS dependencias faltando."
fi
