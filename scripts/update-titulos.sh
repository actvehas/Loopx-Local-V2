#!/bin/bash
# update-titulos.sh — atualiza Titulos.md do canal automaticamente
# Uso:
#   ./update-titulos.sh CANAL EP ESTADO [FASE]
#
# ESTADO: queue | start | phase | done | block
#   queue = [ ]   start = [⏳]   phase = [⏳] + [fase:: N]
#   done  = [x] + [publicado:: HOJE]   block = [⛔] + [bloqueado:: motivo]
#
# Exemplos:
#   ./update-titulos.sh E 18 start
#   ./update-titulos.sh E 18 phase 2-tts
#   ./update-titulos.sh E 18 done

set -e
CANAL="$1"; EP="$2"; ESTADO="$3"; ARG4="$4"
SCRIPTS_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPTS_DIR")"

if [ -z "$CANAL" ] || [ -z "$EP" ] || [ -z "$ESTADO" ]; then
    echo "Uso: $0 CANAL EP ESTADO [ARG]"
    echo "  ESTADO: queue | start | phase | done | block"
    exit 1
fi

CHANNELS_JSON="$PROJECT_DIR/config/channels.json"
NAME=$(python3 -c "import json; print(json.load(open('$CHANNELS_JSON')).get('$CANAL',{}).get('name',''))")
[ -z "$NAME" ] && { echo "❌ Canal $CANAL não está em channels.json"; exit 1; }

TIT="$HOME/Documents/Obsidian Vault/Projetos/Meus Canais/$NAME/Titulos.md"
[ ! -f "$TIT" ] && { echo "❌ Titulos.md não encontrado: $TIT"; exit 1; }

EP_PADDED=$(printf "%03d" "$EP")
TODAY=$(date +%Y-%m-%d)

# Backup
cp "$TIT" "$TIT.bak"

# Match a linha do EP
LINE=$(grep -n "EP$EP_PADDED" "$TIT" | head -1 | cut -d: -f1)
[ -z "$LINE" ] && { echo "❌ EP$EP_PADDED não encontrado em $TIT"; exit 1; }

case "$ESTADO" in
  queue)
    sed -i.tmp "${LINE}s/^- \[.\]/- [ ]/" "$TIT"
    ;;
  start)
    sed -i.tmp "${LINE}s/^- \[.\]/- [⏳]/" "$TIT"
    grep -q "iniciado::" <<< "$(sed -n "${LINE}p" "$TIT")" || \
      sed -i.tmp "${LINE}s/$/  [iniciado:: $TODAY]/" "$TIT"
    ;;
  phase)
    [ -z "$ARG4" ] && { echo "❌ phase precisa de FASE (ex: 2-tts)"; exit 1; }
    sed -i.tmp "${LINE}s/^- \[.\]/- [⏳]/" "$TIT"
    if grep -q "fase::" <<< "$(sed -n "${LINE}p" "$TIT")"; then
      sed -i.tmp "${LINE}s/\[fase:: [^]]*\]/[fase:: $ARG4]/" "$TIT"
    else
      sed -i.tmp "${LINE}s/$/  [fase:: $ARG4]/" "$TIT"
    fi
    ;;
  done)
    sed -i.tmp "${LINE}s/^- \[.\]/- [x]/" "$TIT"
    grep -q "publicado::" <<< "$(sed -n "${LINE}p" "$TIT")" || \
      sed -i.tmp "${LINE}s/$/  [publicado:: $TODAY]/" "$TIT"
    ;;
  block)
    sed -i.tmp "${LINE}s/^- \[.\]/- [⛔]/" "$TIT"
    MOTIVO="${ARG4:-sem motivo}"
    grep -q "bloqueado::" <<< "$(sed -n "${LINE}p" "$TIT")" || \
      sed -i.tmp "${LINE}s/$/  [bloqueado:: $MOTIVO]/" "$TIT"
    ;;
  *)
    echo "❌ ESTADO inválido: $ESTADO"; exit 1 ;;
esac

rm -f "$TIT.tmp"
echo "✅ EP$EP_PADDED → $ESTADO ${ARG4:+($ARG4)}"
