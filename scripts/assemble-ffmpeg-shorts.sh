#!/bin/bash
# Montagem final via FFmpeg — sem Remotion
# Lê cenas-minutagem.md, sincroniza vídeos com áudio, bounce, sem legendas
# Uso: ./assemble-ffmpeg.sh CANAL NUM

set -e

CANAL="${1:-E}"
NUM="${2:-19}"
SCRIPTS_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPTS_DIR")"
CHANNELS_JSON="$PROJECT_DIR/config/channels.json"

CHANNEL_NAME=$(python3 -c "import json; print(json.load(open('$CHANNELS_JSON')).get('$CANAL',{}).get('name',''))" 2>/dev/null)
OBSIDIAN_BASE="$HOME/Documents/Obsidian Vault/Projetos/Meus Canais"
CHANNEL_DIR="$OBSIDIAN_BASE/$CHANNEL_NAME"
NUM_PADDED=$(printf "%02d" "$NUM")
EPISODE_DIR=$(find -L "$CHANNEL_DIR" -maxdepth 1 -type d \( -name "${NUM} - *" -o -name "${NUM_PADDED} - *" \) 2>/dev/null | head -1)

if [ -z "$EPISODE_DIR" ]; then
    echo "❌ Pasta do EP$NUM não encontrada"
    exit 1
fi

CENAS_DIR="$EPISODE_DIR/Cenas"
AUDIO="$EPISODE_DIR/audio.wav"
MINUTAGEM="$EPISODE_DIR/cenas-minutagem.md"
OUTPUT="$EPISODE_DIR/final.mp4"
TMPDIR="$EPISODE_DIR/.tmp-assembly"

echo ""
echo "════════════════════════════════════════"
echo "🎬 MONTAGEM FFmpeg — Canal $CANAL EP$NUM"
echo "📁 $(basename "$EPISODE_DIR")"
echo "════════════════════════════════════════"

for f in "$AUDIO" "$MINUTAGEM"; do
    if [ ! -f "$f" ]; then echo "❌ Falta: $f"; exit 1; fi
done
if [ ! -d "$CENAS_DIR" ]; then echo "❌ Falta: $CENAS_DIR"; exit 1; fi

mkdir -p "$TMPDIR"

# ══════════════════════════════════════
# PASSO 1: Parsear cenas e gerar segmentos
# ══════════════════════════════════════
echo ""
echo "📋 Parseando cenas + gerando segmentos..."

python3 << PYEOF
import re, os, glob, subprocess

ep_dir = "$EPISODE_DIR"
cenas_dir = "$CENAS_DIR"
tmpdir = "$TMPDIR"
audio_path = "$AUDIO"

# Get audio duration
r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", audio_path],
                   capture_output=True, text=True)
audio_dur = float(r.stdout.strip())

# Parse cenas-minutagem — usar timestamps REAIS
scenes = []
with open("$MINUTAGEM") as f:
    for line in f:
        m = re.match(r"Cena (\d+) \((\d+):(\d+)-(\d+):(\d+)\)", line)
        if m:
            num = int(m.group(1))
            start = int(m.group(2)) * 60 + int(m.group(3))
            end = int(m.group(4)) * 60 + int(m.group(5))
            scenes.append({"num": num, "start": start, "end": end})
            continue
        m2 = re.match(r"Cena (\d+) \((\d+):(\d+)-fim\)", line)
        if m2:
            num = int(m2.group(1))
            start = int(m2.group(2)) * 60 + int(m2.group(3))
            scenes.append({"num": num, "start": start, "end": int(audio_dur)})

# Estender cada cena ate o inicio da proxima (preencher gaps de silencio)
# Ultima cena vai ate audio_dur
for i, s in enumerate(scenes):
    if i + 1 < len(scenes):
        s["end"] = scenes[i + 1]["start"]
    else:
        s["end"] = int(audio_dur) + 1  # garante cobertura ate o fim

# Map files
file_map = {}
for f in glob.glob(os.path.join(cenas_dir, "*")):
    name = os.path.basename(f)
    m = re.search(r'Cena[_ ]*(\d+)', name)
    if m and "(1)" not in name:
        file_map[int(m.group(1))] = f

total = len(scenes)
mapped = 0
skipped = 0

# Encoding params — IDENTICOS em todos os segmentos pra evitar stutter no concat
# 30fps, yuv420p, libx264, mesmo profile/level
ENC = ["-c:v", "libx264", "-preset", "fast", "-crf", "18",
       "-pix_fmt", "yuv420p", "-profile:v", "high", "-level", "4.1",
       "-r", "30", "-g", "30",  # keyframe a cada 1s
       "-an", "-movflags", "+faststart"]

concat_entries = []

for i, s in enumerate(scenes):
    num = s["num"]
    dur = s["end"] - s["start"]
    if dur <= 0:
        continue

    src = file_map.get(num, "")
    if not src:
        skipped += 1
        continue

    out = os.path.join(tmpdir, f"seg_{num:04d}.mp4")
    concat_entries.append(out)

    if os.path.exists(out) and os.path.getsize(out) > 5000:
        mapped += 1
        continue

    is_video = src.lower().endswith(".mp4")

    if is_video:
        # Video: VEO gera ~8s. Se precisa MAIS, slow-motion suave (setpts).
        # Se precisa MENOS, trim limpo. Sem freeze de último frame.
        veo_dur = float(subprocess.run(["ffprobe","-v","error","-show_entries","format=duration","-of","csv=p=0",src], capture_output=True, text=True).stdout.strip() or "8")
        if dur > veo_dur:
            ratio = dur / veo_dur  # >1 — slow down
            vf = f"scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,setpts={ratio}*PTS"
        else:
            vf = "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1"
        cmd = ["ffmpeg", "-y", "-i", src,
               "-vf", vf,
               "-t", str(dur),
               ] + ENC + [out]
    else:
        # Imagem: Ken Burns zoom suave
        import random
        fps = 30
        total_frames = dur * fps
        zoom_end = round(random.uniform(1.05, 1.10), 3)
        pan_x = round(random.uniform(-0.02, 0.02), 4)
        pan_y = round(random.uniform(-0.02, 0.02), 4)
        cmd = ["ffmpeg", "-y", "-loop", "1", "-i", src,
               "-t", str(dur),
               "-vf", f"scale=1620:2880:force_original_aspect_ratio=increase,crop=1620:2880,"
                      f"zoompan=z='1+{zoom_end-1}*on/{total_frames}':"
                      f"x='iw/2-(iw/zoom/2)+{pan_x}*iw*on/{total_frames}':"
                      f"y='ih/2-(ih/zoom/2)+{pan_y}*ih*on/{total_frames}':"
                      f"d={total_frames}:s=1080x1920:fps={fps}",
               ] + ENC + [out]

    try:
        subprocess.run(cmd, capture_output=True, timeout=120)
        if os.path.exists(out) and os.path.getsize(out) > 1000:
            mapped += 1
            if (mapped) % 50 == 0:
                print(f"  ✅ {mapped}/{total}")
        else:
            print(f"  ❌ Cena {num} falhou")
    except Exception as e:
        print(f"  ❌ Cena {num}: {e}")

# Write concat file
with open(os.path.join(tmpdir, "concat.txt"), "w") as f:
    for path in concat_entries:
        if os.path.exists(path):
            f.write(f"file '{path}'\n")

print(f"  ✅ {mapped} segmentos prontos, {skipped} pulados")
total_dur = sum(s["end"] - s["start"] for s in scenes)
print(f"  Duração alvo: {total_dur}s ({total_dur//60}:{total_dur%60:02d})")
PYEOF

# ══════════════════════════════════════
# PASSO 2: Concatenar (re-encode pra garantir sync)
# ══════════════════════════════════════
echo ""
echo "🔗 Concatenando segmentos..."
ffmpeg -y -f concat -safe 0 -i "$TMPDIR/concat.txt" \
    -c:v libx264 -preset fast -crf 18 \
    -pix_fmt yuv420p -profile:v high -level 4.1 \
    -r 30 -g 30 \
    -an -movflags +faststart \
    "$TMPDIR/video-only.mp4" 2>/dev/null
echo "  ✅ Video concatenado"

# Subtítulos via Remotion/ASS (passo separado — não burn-in aqui)
VIDEO_FOR_AUDIO="$TMPDIR/video-only.mp4"

# ══════════════════════════════════════
# PASSO 3: Mixar áudio
# ══════════════════════════════════════
echo ""
echo "🔊 Mixando áudio..."
ffmpeg -y -i "$VIDEO_FOR_AUDIO" -i "$AUDIO" \
    -c:v copy -c:a aac -b:a 192k \
    -map 0:v:0 -map 1:a:0 \
    -shortest -movflags +faststart \
    "$OUTPUT" 2>/dev/null
echo "  ✅ Áudio mixado"

# ══════════════════════════════════════
# RESULTADO
# ══════════════════════════════════════
SIZE=$(du -h "$OUTPUT" | cut -f1)
DURATION=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUTPUT" 2>/dev/null)
MIN=$((${DURATION%.*} / 60))
SEC=$((${DURATION%.*} % 60))
echo ""
echo "════════════════════════════════════════"
echo "🎉 PRONTO: $OUTPUT"
echo "   Tamanho: $SIZE"
echo "   Duração: ${MIN}:${SEC}"
echo "════════════════════════════════════════"
echo ""
echo "🧹 Limpar temp: rm -rf \"$TMPDIR\""
