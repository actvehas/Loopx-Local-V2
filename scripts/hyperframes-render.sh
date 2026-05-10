#!/bin/bash
# hyperframes-render.sh — Renderiza intro.mp4 + outro.mp4 (e overlays opcionais)
# pra um EP, usando o edit-style/ do canal.
#
# Uso:
#   ./hyperframes-render.sh CANAL EP
#
# Requer:
#   • Obsidian/.../{Canal}/edit-style/style.json
#   • Obsidian/.../{Canal}/edit-style/intro.html
#   • Obsidian/.../{Canal}/edit-style/outro.html
#
# Outputs em $EP_DIR/overlays/:
#   intro.mp4
#   outro.mp4
#   (futuro: chapter-NN.mp4 quando chapters_enabled=true)

set -e

CANAL="$1"; EP="$2"
[ -z "$CANAL" ] || [ -z "$EP" ] && { echo "Uso: $0 CANAL EP"; exit 1; }

SCRIPTS_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPTS_DIR")"
CHANNELS_JSON="$PROJECT_DIR/config/channels.json"
NAME=$(python3 -c "import json; print(json.load(open('$CHANNELS_JSON')).get('$CANAL',{}).get('name',''))")
[ -z "$NAME" ] && { echo "❌ Canal $CANAL não está em channels.json"; exit 1; }

CHANNEL_DIR="$HOME/Documents/Obsidian Vault/Projetos/Meus Canais/$NAME"
STYLE_DIR="$CHANNEL_DIR/edit-style"

if [ ! -d "$STYLE_DIR" ]; then
    echo "❌ $CANAL não tem edit-style/ configurado."
    echo "   Copia: cp -r $PROJECT_DIR/docs/templates/edit-style \"$CHANNEL_DIR/edit-style\""
    echo "   Depois edita style.json + templates HTML pra dar identidade visual ao canal."
    exit 1
fi

EPN=$(printf "%03d" "$EP")
EP_DIR=$(find "$CHANNEL_DIR" -maxdepth 1 -type d -name "EP${EPN} - *" 2>/dev/null | head -1)
[ -z "$EP_DIR" ] && { echo "❌ Pasta EP$EPN não encontrada em $CHANNEL_DIR"; exit 1; }

OUT_DIR="$EP_DIR/overlays"
mkdir -p "$OUT_DIR"
WORK_DIR=$(mktemp -d -t hyperframes-render-XXXXXX)
trap "rm -rf $WORK_DIR" EXIT

# ─── Lê style.json + frontmatter do EP ─────────────────────────
STYLE="$STYLE_DIR/style.json"
README="$EP_DIR/README.md"

# Parse style.json + EP README.md (frontmatter YAML) num único bloco Python
read FG FG_DIM ACCENT BG LETTERBOX_H GRAIN_ALPHA \
     FONT_TITLE FONT_SUB FONT_PRE FONT_QUOTE FONT_CREDIT \
     INTRO_DURATION INTRO_PRE INTRO_TITLE INTRO_SUB INTRO_POST INTRO_RULE_W \
     OUTRO_DURATION OUTRO_QUOTE OUTRO_ATTR OUTRO_C1 OUTRO_C2 \
     VERB_GLOW VERB_SIZE VERB_PRONOUN_SIZE \
     EP_TITLE DURATION_HUMAN \
     INTRO_ENABLED OUTRO_ENABLED < <(python3 - "$STYLE" "$README" "$EP" <<'PYEOF'
import json, sys, re

style_path, readme_path, ep_num = sys.argv[1], sys.argv[2], sys.argv[3]
s = json.load(open(style_path))

# Lê frontmatter do README do EP (YAML simplificado)
fm = {}
try:
    with open(readme_path) as f:
        txt = f.read()
    if txt.startswith('---'):
        end = txt.find('---', 3)
        if end > 0:
            for line in txt[3:end].splitlines():
                m = re.match(r'^\s*(\w+)\s*:\s*"?([^"]*)"?\s*$', line)
                if m: fm[m.group(1)] = m.group(2).strip()
except Exception:
    pass

ep_title = fm.get('titulo', '')
duracao_min = fm.get('duracao_real_min') or fm.get('duracao_bucket', '00')
duration_human = f"{duracao_min}:00" if duracao_min and duracao_min.isdigit() else "00:00"

def get(d, *keys, default=''):
    cur = d
    for k in keys:
        if not isinstance(cur, dict): return default
        cur = cur.get(k, default)
    return cur if cur is not None else default

# Substitui placeholders nas strings
def sub(tpl):
    return (str(tpl)
        .replace('{ep}', str(ep_num).zfill(3))
        .replace('{CHANNEL_TITLE}', s.get('nome', '').upper())
        .replace('{tagline}', ep_title)
        .replace('{duration}', duration_human)
        .replace('{handle}', s.get('canal', ''))
        .replace('{year}', '2026')
        .replace('{quote}', '')
        .replace('{quote_author}', ''))

vals = [
    get(s,'palette','fg','#f3e9d4'),
    get(s,'palette','fg_dim','rgba(243,233,212,0.55)'),
    get(s,'palette','accent','#c4a557'),
    get(s,'palette','bg','#000000'),
    str(get(s,'decorations','letterbox_h',145)),
    str(get(s,'decorations','grain_alpha',0.12)),
    f'"{get(s,"fonts","title","Playfair Display")}"',
    f'"{get(s,"fonts","context","Cormorant Garamond")}"',
    f'"{get(s,"fonts","stamp","JetBrains Mono")}"',
    f'"{get(s,"fonts","context","Cormorant Garamond")}"',  # quote
    f'"{get(s,"fonts","stamp","JetBrains Mono")}"',          # credit
    str(get(s,'intro','duration',4)),
    sub(get(s,'intro','pre','FILE Nº {ep}')),
    sub(get(s,'intro','title','{CHANNEL_TITLE}')),
    sub(get(s,'intro','subtitle','')),
    sub(get(s,'intro','post','RUNTIME {duration}')),
    str(get(s,'intro','rule_width',320)),
    str(get(s,'outro','duration',3)),
    sub(get(s,'outro','quote','')),
    sub(get(s,'outro','attribution','')),
    sub((get(s,'outro','credits',['',''])+['',''])[0]),
    sub((get(s,'outro','credits',['',''])+['',''])[1]),
    get(s,'verb_style','glow','0 0 80px rgba(243,233,212,0.18)'),
    str(get(s,'verb_style','size_main',220)),
    str(get(s,'verb_style','size_pronoun',140)),
    ep_title,
    duration_human,
    'true' if get(s,'overlays_enabled','intro',True) else 'false',
    'true' if get(s,'overlays_enabled','outro',True) else 'false',
]
print(' '.join(f'"{v}"' for v in vals))
PYEOF
)

# Strip outer quotes (added pra preservar espaços; bash já fez split por espaço fora das quotes)
strip_q() { local s="$1"; s="${s#\"}"; s="${s%\"}"; echo "$s"; }
INTRO_TITLE=$(strip_q "$INTRO_TITLE")
INTRO_SUB=$(strip_q "$INTRO_SUB")
INTRO_PRE=$(strip_q "$INTRO_PRE")
INTRO_POST=$(strip_q "$INTRO_POST")
OUTRO_QUOTE=$(strip_q "$OUTRO_QUOTE")
OUTRO_ATTR=$(strip_q "$OUTRO_ATTR")
OUTRO_C1=$(strip_q "$OUTRO_C1")
OUTRO_C2=$(strip_q "$OUTRO_C2")
EP_TITLE=$(strip_q "$EP_TITLE")
DURATION_HUMAN=$(strip_q "$DURATION_HUMAN")

FONTS_LINK='<link rel="preconnect" href="https://fonts.googleapis.com" /><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin /><link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;0,900;1,400&family=Cormorant+Garamond:ital,wght@0,300;0,400;1,400&family=JetBrains+Mono:wght@300;400&display=swap" rel="stylesheet" />'

# ─── Renderizador genérico ─────────────────────────────────────
render_template() {
    local TEMPLATE="$1"; local OUTPUT="$2"; shift 2
    local PROJ="$WORK_DIR/$(basename "$OUTPUT" .mp4)"
    mkdir -p "$PROJ"
    cp "$TEMPLATE" "$PROJ/index.html"

    # Cria meta + hyperframes.json mínimos pra render funcionar
    cat > "$PROJ/hyperframes.json" <<'JSON'
{
  "$schema": "https://hyperframes.heygen.com/schema/hyperframes.json",
  "paths": { "blocks": "compositions", "components": "compositions/components", "assets": "assets" }
}
JSON
    cat > "$PROJ/meta.json" <<JSON
{ "id": "$(basename "$OUTPUT" .mp4)", "name": "$(basename "$OUTPUT" .mp4)" }
JSON

    # Substitui placeholders
    while [ $# -gt 0 ]; do
        local KEY="$1"; local VAL="$2"; shift 2
        # escape pra sed: trocar | em $VAL não acontece se mantermos delimiter |
        python3 -c "
import sys
p = sys.argv[1]
with open(p) as f: t = f.read()
t = t.replace('{{${KEY}}}', sys.argv[2])
with open(p, 'w') as f: f.write(t)
" "$PROJ/index.html" "$VAL"
    done

    echo "🎬 Render $(basename "$OUTPUT") …"
    (cd "$PROJ" && npx --yes hyperframes@0.5.7 render --quiet > /dev/null 2>&1) || {
        echo "❌ Render falhou em $TEMPLATE"; return 1;
    }
    local RENDERED=$(ls -t "$PROJ/renders"/*.mp4 2>/dev/null | head -1)
    [ -z "$RENDERED" ] && { echo "❌ Sem MP4 em $PROJ/renders"; return 1; }
    cp "$RENDERED" "$OUTPUT"
    echo "✅ $OUTPUT"
}

DUR_MINUS_05=$(python3 -c "print($INTRO_DURATION - 0.5)")

# ─── INTRO ────────────────────────────────────────────────────
if [ "$INTRO_ENABLED" = "true" ]; then
    render_template "$STYLE_DIR/intro.html" "$OUT_DIR/intro.mp4" \
        FONTS_LINK "$FONTS_LINK" \
        FG "$FG" FG_DIM "$FG_DIM" ACCENT "$ACCENT" BG "$BG" \
        LETTERBOX_H "$LETTERBOX_H" GRAIN_ALPHA "$GRAIN_ALPHA" \
        FONT_TITLE "$FONT_TITLE" FONT_SUB "$FONT_SUB" FONT_PRE "$FONT_PRE" \
        DURATION "$INTRO_DURATION" \
        PRE "$INTRO_PRE" TITLE "$INTRO_TITLE" SUBTITLE "$INTRO_SUB" POST "$INTRO_POST" \
        RULE_WIDTH "$INTRO_RULE_W"
fi

# ─── OUTRO ────────────────────────────────────────────────────
if [ "$OUTRO_ENABLED" = "true" ]; then
    render_template "$STYLE_DIR/outro.html" "$OUT_DIR/outro.mp4" \
        FONTS_LINK "$FONTS_LINK" \
        FG "$FG" FG_DIM "$FG_DIM" BG "$BG" LETTERBOX_H "$LETTERBOX_H" \
        FONT_QUOTE "$FONT_QUOTE" FONT_CREDIT "$FONT_CREDIT" \
        DURATION "$OUTRO_DURATION" \
        QUOTE "$OUTRO_QUOTE" ATTRIBUTION "$OUTRO_ATTR" \
        CREDIT_1 "$OUTRO_C1" CREDIT_2 "$OUTRO_C2"
fi

echo ""
echo "════════════════════════════════════════"
echo "✅ Overlays renderizados em $OUT_DIR"
ls -lh "$OUT_DIR"
