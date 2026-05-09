#!/bin/bash
# LoopX Local — Deploy assembly pra Hetzner
# Uso: ./hetzner/deploy.sh
# Envia o script de montagem e configura na Hetzner

HETZNER="root@65.109.85.250"
REMOTE_DIR="/root/loopx-local"

echo "Deploying LoopX Local assembly para Hetzner..."

# Criar estrutura remota
ssh $HETZNER "mkdir -p $REMOTE_DIR/{assembly,jobs,output}"

# Enviar assembly script
rsync -avz hetzner/assembly/ $HETZNER:$REMOTE_DIR/assembly/

echo ""
echo "Deploy completo."
echo "Testar: ssh $HETZNER 'node $REMOTE_DIR/assembly/assemble.js E 16'"
