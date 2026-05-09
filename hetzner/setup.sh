#!/bin/bash
# LoopX Local — Setup na Hetzner
# Uso: ssh root@65.109.85.250 "bash -s" < hetzner/setup.sh
# Ou: copiar pro servidor e rodar lá

echo "================================================"
echo "  LoopX Local — Setup Hetzner"
echo "================================================"

# Criar estrutura
mkdir -p /root/loopx-local/{assembly,jobs,output}
echo "[OK] Estrutura criada em /root/loopx-local/"

# Copiar assembly script (se estiver rodando localmente, usar rsync depois)
if [ -f "$(dirname "$0")/assembly/assemble.js" ]; then
    cp "$(dirname "$0")/assembly/assemble.js" /root/loopx-local/assembly/
    echo "[OK] assemble.js copiado"
fi

# Verificar dependências
echo ""
echo "=== Verificação ==="

# FFmpeg
if command -v ffmpeg &> /dev/null; then
    echo "[OK] FFmpeg: $(ffmpeg -version 2>/dev/null | head -1 | cut -d' ' -f3)"
else
    echo "[FALTA] FFmpeg — apt install ffmpeg"
fi

# Node.js
if command -v node &> /dev/null; then
    echo "[OK] Node.js: $(node --version)"
else
    echo "[FALTA] Node.js — curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt install -y nodejs"
fi

# Disk space
DISK_FREE=$(df -h / | tail -1 | awk '{print $4}')
echo "[INFO] Disco livre: $DISK_FREE"

# RAM
RAM_FREE=$(free -h | grep Mem | awk '{print $7}')
echo "[INFO] RAM disponível: $RAM_FREE"

echo ""
echo "================================================"
echo "  Setup completo."
echo ""
echo "  Testar: node /root/loopx-local/assembly/assemble.js E 16"
echo "================================================"
