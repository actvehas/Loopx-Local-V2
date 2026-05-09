#!/bin/bash
# LoopX Local — Baixa video final da Hetzner
# Uso: ./download.sh CANAL NUM [VAULT_PATH]

CANAL="$1"
NUM="$2"
VAULT="${3:-$HOME/Documents/Obsidian Vault}"
HETZNER="root@65.109.85.250"
REMOTE_DIR="/root/loopx-local/jobs/$CANAL/$NUM"

if [ -z "$CANAL" ] || [ -z "$NUM" ]; then
    echo "Uso: ./download.sh CANAL NUM [VAULT_PATH]"
    exit 1
fi

EPISODE_DIR=$(find "$VAULT/Projetos" -maxdepth 3 -type d -name "$NUM - *" 2>/dev/null | head -1)

if [ -z "$EPISODE_DIR" ]; then
    echo "Pasta do episodio $NUM nao encontrada"
    exit 1
fi

echo "Baixando final.mp4 de $HETZNER:$REMOTE_DIR/..."
rsync -avz --progress "$HETZNER:$REMOTE_DIR/final.mp4" "$EPISODE_DIR/final.mp4"

if [ -f "$EPISODE_DIR/final.mp4" ]; then
    SIZE=$(du -h "$EPISODE_DIR/final.mp4" | cut -f1)
    echo "Download completo: $EPISODE_DIR/final.mp4 ($SIZE)"
else
    echo "[ERRO] final.mp4 nao encontrado no servidor"
fi
