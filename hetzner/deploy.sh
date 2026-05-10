#!/bin/bash
# LoopX Local — Deploy assembly pra Hetzner
# Uso: ./hetzner/deploy.sh
# Envia o script de montagem e configura na Hetzner

HETZNER="root@65.109.85.250"
REMOTE_DIR="/root/loopx-local"

echo "Deploying LoopX Local assembly para Hetzner..."

# Criar estrutura remota (incluindo config + assets/music pra mixagem por canal)
ssh $HETZNER "mkdir -p $REMOTE_DIR/{assembly,jobs,output,config,assets/music}"

# Enviar assembly script
rsync -avz hetzner/assembly/ $HETZNER:$REMOTE_DIR/assembly/

# Enviar config (canais com flags subtitles/music/music_volume)
rsync -avz config/channels.json $HETZNER:$REMOTE_DIR/config/

# Enviar trilhas (mp3, exceto typewriter clicks que ficam só no Mac)
rsync -avz --include='*.mp3' --exclude='typewriter-*' assets/music/ $HETZNER:$REMOTE_DIR/assets/music/

echo ""
echo "Deploy completo (assembly + config + music)."
echo "Testar: ssh $HETZNER 'node $REMOTE_DIR/assembly/assemble.js E 16'"
