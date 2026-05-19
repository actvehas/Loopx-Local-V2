#!/bin/bash
# Sincroniza projeto Remotion entre repo local e Hetzner VPS.
#
# Uso:
#   sync-remotion.sh pull           — Hetzner → repo local (backup)
#   sync-remotion.sh push           — repo local → Hetzner (deploy)
#   sync-remotion.sh diff           — mostra o que está diferente entre os 2
#   sync-remotion.sh push --dry-run — mostra o que seria enviado sem fazer

set -e

HETZNER="root@65.109.85.250"
REMOTE_DIR="/root/loopx-local/remotion"
LOCAL_DIR="$(cd "$(dirname "$0")/.." && pwd)/hetzner/remotion"

# Arquivos sincronizados (whitelist — evita node_modules, .git, etc)
INCLUDES=(
    "src/Main.tsx"
    "src/Root.tsx"
    "src/components/"
    "src/lib/"
    "package.json"
    "tsconfig.json"
    "render.mjs"
)

case "${1:-}" in
  pull)
    echo "📥 Pull: Hetzner → $LOCAL_DIR"
    for item in "${INCLUDES[@]}"; do
        rsync -avz --delete \
            "$HETZNER:$REMOTE_DIR/$item" \
            "$LOCAL_DIR/$(dirname "$item")/" 2>&1 | grep -vE "^$|sending|sent|total|^building|^created" || true
    done
    echo "✅ Pull completo. Faça git status pra ver o que mudou."
    ;;

  push)
    DRY=""
    [ "${2:-}" = "--dry-run" ] && DRY="--dry-run" && echo "🧪 DRY RUN (nada será alterado no Hetzner)"
    echo "📤 Push: $LOCAL_DIR → Hetzner"
    echo "⚠️  ATENÇÃO: vai SOBRESCREVER arquivos no VPS."
    if [ -z "$DRY" ]; then
        read -p "Confirmar? [y/N] " yn
        [ "$yn" != "y" ] && { echo "cancelado"; exit 0; }
    fi
    for item in "${INCLUDES[@]}"; do
        rsync -avz $DRY --delete \
            "$LOCAL_DIR/$item" \
            "$HETZNER:$REMOTE_DIR/$(dirname "$item")/" 2>&1 | grep -vE "^$|sending|sent|total|^building|^created" || true
    done
    echo "✅ Push completo."
    [ -z "$DRY" ] && echo "💡 Pra render usar a versão nova, próximo job já pega automaticamente."
    ;;

  diff)
    echo "🔍 Diff Hetzner vs local (arquivos sincronizados):"
    for item in "${INCLUDES[@]}"; do
        # Só compara arquivos individuais
        if [ -f "$LOCAL_DIR/$item" ]; then
            DIFF=$(rsync -avzn --itemize-changes \
                "$HETZNER:$REMOTE_DIR/$item" "$LOCAL_DIR/$item" 2>&1 | grep -E "^>f|^<f" || true)
            [ -n "$DIFF" ] && echo "  $item: DIFERENTE"
        fi
    done
    echo "(rsync sem --delete; pasta diff requer pull/push real pra ver)"
    ;;

  *)
    cat <<EOF
Uso:
  sync-remotion.sh pull              # Hetzner → repo (backup do VPS)
  sync-remotion.sh push              # repo → Hetzner (deploy mudanças locais)
  sync-remotion.sh push --dry-run    # simula push sem alterar nada
  sync-remotion.sh diff              # lista arquivos diferentes

Convenção:
  - "Fonte de verdade" é o repo (\$LOCAL_DIR).
  - Faça mudanças local + commit + push pra Hetzner.
  - Use 'pull' só quando alguém alterou Hetzner direto sem passar pelo repo.
EOF
    exit 1
    ;;
esac
