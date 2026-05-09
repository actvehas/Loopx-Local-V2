#!/bin/bash
# LoopX Local — Envia assets pra Hetzner e dispara montagem
# Uso: ./assemble.sh CANAL NUM [VAULT_PATH]
# Exemplo: ./assemble.sh E 16

CANAL="$1"
NUM="$2"
VAULT="${3:-$HOME/Documents/Obsidian Vault}"
HETZNER="root@65.109.85.250"
REMOTE_DIR="/root/loopx-local/jobs/$CANAL/$NUM"

if [ -z "$CANAL" ] || [ -z "$NUM" ]; then
    echo "Uso: ./assemble.sh CANAL NUM [VAULT_PATH]"
    echo "Exemplo: ./assemble.sh E 16"
    exit 1
fi

# Find episode folder by number prefix
EPISODE_DIR=$(find "$VAULT/Projetos" -maxdepth 3 -type d -name "$NUM - *" 2>/dev/null | head -1)

if [ -z "$EPISODE_DIR" ]; then
    echo "Pasta do episodio $NUM nao encontrada no vault"
    exit 1
fi

echo "================================================"
echo "ASSEMBLY — Canal $CANAL, Episodio $NUM"
echo "Pasta: $EPISODE_DIR"
echo "Destino: $HETZNER:$REMOTE_DIR"
echo "================================================"

# Check required files
for f in "audio.wav" "audio.srt"; do
    if [ ! -f "$EPISODE_DIR/$f" ]; then
        echo "[ERRO] Falta: $EPISODE_DIR/$f"
        exit 1
    fi
done

if [ ! -d "$EPISODE_DIR/Cenas" ]; then
    echo "[ERRO] Pasta Cenas/ nao encontrada"
    exit 1
fi

CENAS_COUNT=$(ls "$EPISODE_DIR/Cenas/"*.mp4 2>/dev/null | wc -l)
echo "Cenas encontradas: $CENAS_COUNT"

# Create remote dir
echo ""
echo "PASSO 1: Criando pasta remota..."
ssh $HETZNER "mkdir -p $REMOTE_DIR/Cenas"

# Upload assets
echo ""
echo "PASSO 2: Enviando audio + SRT..."
rsync -avz --progress "$EPISODE_DIR/audio.wav" "$EPISODE_DIR/audio.srt" "$HETZNER:$REMOTE_DIR/"

echo ""
echo "PASSO 3: Enviando Cenas/ ($CENAS_COUNT videos)..."
rsync -avz --progress "$EPISODE_DIR/Cenas/" "$HETZNER:$REMOTE_DIR/Cenas/"

# Trigger assembly
echo ""
echo "PASSO 4: Disparando montagem na Hetzner..."
ssh $HETZNER "cd /root/loopx-local && node assembly/assemble.js $CANAL $NUM"

echo ""
echo "================================================"
echo "Assembly disparado. Monitorar:"
echo "  ssh $HETZNER 'tail -f /root/loopx-local/jobs/$CANAL/$NUM/assembly.log'"
echo "================================================"
