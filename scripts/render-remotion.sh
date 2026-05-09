#!/bin/bash
# render-remotion.sh — Renderiza vídeo final com legendas Remotion
# Pré-requisitos: assemble-ffmpeg.sh já rodou (final-no-music.mp4 ou final.mp4 existe)
#
# Uso: bash render-remotion.sh CANAL NUM

set -e
CANAL="${1:-I}"
NUM="${2:-5}"
SCRIPTS_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPTS_DIR")"
CHANNELS_JSON="$PROJECT_ROOT/config/channels.json"

CHANNEL_NAME=$(python3 -c "import json; print(json.load(open('$CHANNELS_JSON')).get('$CANAL',{}).get('name',''))" 2>/dev/null)
OBSIDIAN_BASE="$HOME/Documents/Obsidian Vault/Projetos/Meus Canais"
CHANNEL_DIR="$OBSIDIAN_BASE/$CHANNEL_NAME"
NUM_PADDED=$(printf "%02d" "$NUM")
EPISODE_DIR=$(find "$CHANNEL_DIR" -maxdepth 1 -type d \( -name "${NUM} - *" -o -name "${NUM_PADDED} - *" \) 2>/dev/null | head -1)

if [ -z "$EPISODE_DIR" ]; then
    echo "❌ Pasta do EP$NUM não encontrada"; exit 1
fi

VIDEO_SILENT="$EPISODE_DIR/.tmp-assembly/video-only.mp4"
[ ! -f "$VIDEO_SILENT" ] && VIDEO_SILENT="$EPISODE_DIR/final-no-music.mp4"
[ ! -f "$VIDEO_SILENT" ] && VIDEO_SILENT="$EPISODE_DIR/final.mp4"
AUDIO="$EPISODE_DIR/audio.wav"
WORDS_JSON="$EPISODE_DIR/words.json"
CENAS_MD="$EPISODE_DIR/cenas-minutagem.md"
OUTPUT="$EPISODE_DIR/final-with-captions.mp4"

echo "🎬 Render Remotion — Canal $CANAL EP$NUM"
echo "   Video: $VIDEO_SILENT"
echo "   Audio: $AUDIO"

# 1. Gerar word-level JSON se não existir
if [ ! -f "$WORDS_JSON" ]; then
    echo "🎯 Gerando word timestamps via Whisper..."
    python3 "$SCRIPTS_DIR/whisper-words.py" "$AUDIO" "$WORDS_JSON"
fi

# 2. Parsear cenas-minutagem.md → JSON com textZone
SCENES_JSON=$(python3 << PYEOF
import re, json
scenes = []
with open("$CENAS_MD") as f:
    for line in f:
        m = re.match(r"Cena (\d+) \((\d+):(\d+)-(\d+):(\d+)\):", line)
        if m:
            scenes.append({"num": int(m.group(1)), "start": int(m.group(2))*60+int(m.group(3)), "end": int(m.group(4))*60+int(m.group(5)), "textZone": "bottom"})
        m2 = re.match(r"Cena (\d+) \((\d+):(\d+)-fim\):", line)
        if m2:
            # last; we'll set end to a high number; Remotion durationFrames clamps
            scenes.append({"num": int(m2.group(1)), "start": int(m2.group(2))*60+int(m2.group(3)), "end": 99999, "textZone": "bottom"})
print(json.dumps(scenes))
PYEOF
)

# 3. Calcular duração do áudio
AUDIO_DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$AUDIO" | cut -d. -f1)

# 4. Symlink assets para public/ (Remotion staticFile)
PUBLIC_DIR="$PROJECT_ROOT/remotion-fe/public"
mkdir -p "$PUBLIC_DIR"
rm -f "$PUBLIC_DIR/video.mp4" "$PUBLIC_DIR/audio.wav"
cp "$VIDEO_SILENT" "$PUBLIC_DIR/video.mp4"
cp "$AUDIO" "$PUBLIC_DIR/audio.wav"

# 5. Construir props JSON com paths relativos a public/
PROPS_FILE="$EPISODE_DIR/.remotion-props.json"
python3 << PYEOF
import json
with open("$WORDS_JSON") as f:
    words = json.load(f)
scenes = $SCENES_JSON
props = {
    "videoSrc": "video.mp4",
    "audioSrc": "audio.wav",
    "words": words,
    "scenes": scenes,
    "durationSeconds": $AUDIO_DUR + 1,
}
with open("$PROPS_FILE", "w") as f:
    json.dump(props, f, ensure_ascii=False)
PYEOF

# 6. Render via Remotion CLI
cd "$PROJECT_ROOT/remotion-fe"
echo "🎨 Rendering Remotion (pode demorar 3-5 min)..."
npx remotion render src/index.ts FeAlDescubierto "$OUTPUT" \
    --props="$PROPS_FILE" \
    --concurrency=1 \
    --log=info 2>&1 | tail -20

if [ -f "$OUTPUT" ]; then
    SIZE=$(du -h "$OUTPUT" | cut -f1)
    echo "🎉 PRONTO: $OUTPUT ($SIZE)"
else
    echo "❌ Render falhou"
    exit 1
fi
