#!/bin/bash
# Glitch Assembler v2 — Ken Burns suave + crossfade + karaokê uppercase
# Uso: ./assemble-glitch.sh NUM [--no-subs] [--no-xfade]

set -e

NUM="${1:-1}"
SUBS_MODE="ass"
USE_XFADE="1"
shift 2>/dev/null || true
while [[ $# -gt 0 ]]; do
    case "$1" in
        --no-subs) SUBS_MODE="none"; shift;;
        --captions) SUBS_MODE="$2"; shift 2;;
        --no-xfade) USE_XFADE="0"; shift;;
        *) shift;;
    esac
done

CANAL="K"
SCRIPTS_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPTS_DIR")"
CHANNELS_JSON="$PROJECT_DIR/config/channels.json"
CHANNEL_NAME=$(python3 -c "import json; print(json.load(open('$CHANNELS_JSON')).get('$CANAL',{}).get('name',''))")
OBSIDIAN_BASE="$HOME/Documents/Obsidian Vault/Projetos/Meus Canais"
CHANNEL_DIR="$OBSIDIAN_BASE/$CHANNEL_NAME"
NUM_PADDED=$(printf "%02d" "$NUM")
EPISODE_DIR=$(find "$CHANNEL_DIR" -maxdepth 1 -type d \( -name "${NUM} - *" -o -name "${NUM_PADDED} - *" \) 2>/dev/null | head -1)
[ -z "$EPISODE_DIR" ] && { echo "❌ EP$NUM não encontrado"; exit 1; }

CENAS_DIR="$EPISODE_DIR/Cenas"
AUDIO="$EPISODE_DIR/audio.wav"
WORDS_JSON="$EPISODE_DIR/audio-words.json"
CENAS_6S="$EPISODE_DIR/cenas-6s.md"
OUTPUT="$EPISODE_DIR/final.mp4"
TMPDIR="$EPISODE_DIR/.tmp-assembly"

echo "════════════════════════════════════════"
echo "🎬 GLITCH ASSEMBLER v2 — EP$NUM"
echo "   Subs: $SUBS_MODE · Crossfade: $USE_XFADE"
echo "════════════════════════════════════════"

for f in "$AUDIO" "$CENAS_6S"; do [ ! -f "$f" ] && { echo "❌ Falta: $f"; exit 1; }; done
[ ! -d "$CENAS_DIR" ] && { echo "❌ Falta: $CENAS_DIR"; exit 1; }
mkdir -p "$TMPDIR"

if [ "$SUBS_MODE" = "ass" ] && [ ! -f "$WORDS_JSON" ]; then
    echo "🎯 Word-level whisper..."
    python3 "$SCRIPTS_DIR/whisper-words.py" "$AUDIO" "$WORDS_JSON" 2>&1 | tail -2
fi

XFADE_DUR="0.4"
EXTRA_TAIL=$([ "$USE_XFADE" = "1" ] && echo "$XFADE_DUR" || echo "0")

echo ""
echo "📋 Render 69 segmentos com Ken Burns suave (pre-scale 4x + sine ease)..."

python3 << PYEOF
import re, os, glob, subprocess, random, json

ep_dir = "$EPISODE_DIR"
cenas_dir = "$CENAS_DIR"
tmpdir = "$TMPDIR"
audio_path = "$AUDIO"
extra_tail = float("$EXTRA_TAIL")

audio_dur = float(subprocess.run(
    ["ffprobe","-v","error","-show_entries","format=duration","-of","csv=p=0",audio_path],
    capture_output=True, text=True).stdout.strip())

scenes = []
with open("$CENAS_6S") as f:
    for line in f:
        m = re.match(r"##\s*Cena (\d+) \((\d+):(\d+)-(\d+):(\d+)\)", line)
        if m:
            scenes.append({"num": int(m.group(1)),
                           "start": int(m.group(2))*60+int(m.group(3)),
                           "end": int(m.group(4))*60+int(m.group(5))})
            continue
        m2 = re.match(r"##\s*Cena (\d+) \((\d+):(\d+)-fim\)", line)
        if m2:
            scenes.append({"num": int(m2.group(1)),
                           "start": int(m2.group(2))*60+int(m2.group(3)),
                           "end": int(audio_dur)+1})

for i, s in enumerate(scenes):
    if i + 1 < len(scenes):
        s["end"] = scenes[i+1]["start"]
    else:
        s["end"] = round(audio_dur, 2) + 0.5

file_map = {}
for f in sorted(glob.glob(os.path.join(cenas_dir, "*"))):
    name = os.path.basename(f)
    m = re.search(r'Cena[_\s]*(\d+)', name)
    if m and "(1)" not in name and not name.endswith(".part"):
        n = int(m.group(1))
        if n not in file_map or f.lower().endswith(".png"):
            file_map[n] = f

ENC = ["-c:v", "libx264", "-preset", "medium", "-crf", "16",
       "-pix_fmt", "yuv420p", "-profile:v", "high", "-level", "4.2",
       "-r", "30", "-g", "30", "-an", "-movflags", "+faststart"]

durations = []
done = 0
for s in scenes:
    num, slot_dur = s["num"], s["end"] - s["start"]
    if slot_dur <= 0: continue
    src = file_map.get(num)
    if not src:
        durations.append({"num": num, "dur": slot_dur, "slot": slot_dur, "path": None})
        continue
    render_dur = slot_dur + extra_tail
    out = os.path.join(tmpdir, f"seg_{num:04d}.mp4")
    durations.append({"num": num, "dur": render_dur, "slot": slot_dur, "path": out})

    if os.path.exists(out) and os.path.getsize(out) > 5000:
        existing = float(subprocess.run(
            ["ffprobe","-v","error","-show_entries","format=duration","-of","csv=p=0",out],
            capture_output=True, text=True).stdout.strip() or "0")
        if abs(existing - render_dur) < 0.15:
            done += 1
            continue

    fps = 30
    total_frames = int(render_dur * fps)
    zoom_end = round(random.uniform(1.04, 1.08), 4)
    pan_x = round(random.uniform(-0.012, 0.012), 4)
    pan_y = round(random.uniform(-0.012, 0.012), 4)
    zoom_expr = f"1+{zoom_end-1:.5f}*(1-cos(PI*on/{total_frames}))/2"
    x_expr    = f"iw/2-(iw/zoom/2)+{pan_x}*iw*(1-cos(PI*on/{total_frames}))/2"
    y_expr    = f"ih/2-(ih/zoom/2)+{pan_y}*ih*(1-cos(PI*on/{total_frames}))/2"

    cmd = ["ffmpeg","-y","-loop","1","-i",src,"-t",str(render_dur),
           "-vf", (f"scale=7680:4320:force_original_aspect_ratio=increase:flags=lanczos,"
                   f"crop=7680:4320,"
                   f"zoompan=z='{zoom_expr}':x='{x_expr}':y='{y_expr}':"
                   f"d={total_frames}:s=1920x1080:fps={fps}")
          ] + ENC + [out]
    try:
        r = subprocess.run(cmd, capture_output=True, timeout=240)
        if r.returncode != 0:
            print(f"  ❌ Cena {num}: {r.stderr[-180:].decode('utf-8',errors='ignore')}")
            continue
        done += 1
        if done % 10 == 0:
            print(f"  ✅ {done}/69")
    except Exception as e:
        print(f"  ❌ Cena {num}: {e}")

with open(os.path.join(tmpdir, "segments.json"), "w") as f:
    json.dump(durations, f, indent=2)
print(f"  ✅ Render {done}/69 · audio_dur={round(audio_dur,1)}s")
PYEOF

echo ""
if [ "$USE_XFADE" = "1" ]; then
    echo "🎞️  Concat com crossfade ${XFADE_DUR}s (xfade chain)..."
    python3 << PYEOF
import json, subprocess, os
tmpdir = "$TMPDIR"
xfade = float("$XFADE_DUR")
with open(os.path.join(tmpdir, "segments.json")) as f:
    segs = [s for s in json.load(f) if s.get("path") and os.path.exists(s["path"])]
n = len(segs)
inputs = []
for s in segs: inputs += ["-i", s["path"]]
filt = []
for i in range(n):
    filt.append(f"[{i}:v]format=yuv420p,setpts=PTS-STARTPTS[v{i}]")
running = segs[0]["slot"]
prev_label = "v0"
for i in range(1, n):
    new_label = f"x{i:03d}" if i < n-1 else "vout"
    offset = round(running - xfade, 4)
    filt.append(f"[{prev_label}][v{i}]xfade=transition=fade:duration={xfade}:offset={offset}[{new_label}]")
    running = round(running + segs[i]["slot"], 4)
    prev_label = new_label
filter_complex = ";".join(filt)
out = os.path.join(tmpdir, "video-only.mp4")
cmd = ["ffmpeg","-y"] + inputs + [
    "-filter_complex", filter_complex,
    "-map", "[vout]",
    "-c:v","libx264","-preset","medium","-crf","16",
    "-pix_fmt","yuv420p","-profile:v","high","-level","4.2",
    "-r","30","-g","30","-movflags","+faststart", out]
print(f"  📊 {n} inputs · {len(filt)} filtros · target_dur={round(running,1)}s")
r = subprocess.run(cmd, capture_output=True, timeout=1200)
if r.returncode != 0:
    print(r.stderr[-1500:].decode('utf-8', errors='ignore'))
    raise SystemExit(1)
print(f"  ✅ Crossfade montado")
PYEOF
else
    echo "🔗 Concat simples..."
    python3 -c "
import json, os
with open('$TMPDIR/segments.json') as f: segs = json.load(f)
with open('$TMPDIR/concat.txt', 'w') as f:
    for s in segs:
        if s.get('path') and os.path.exists(s['path']):
            f.write(f\"file '{s['path']}'\n\")
"
    ffmpeg -y -f concat -safe 0 -i "$TMPDIR/concat.txt" \
        -c:v libx264 -preset medium -crf 16 -pix_fmt yuv420p -profile:v high -level 4.2 \
        -r 30 -g 30 -an -movflags +faststart "$TMPDIR/video-only.mp4" 2>/dev/null
fi

VIDEO_SRC="$TMPDIR/video-only.mp4"

if [ "$SUBS_MODE" = "ass" ] && [ -f "$WORDS_JSON" ]; then
    echo ""
    echo "💬 ASS karaokê uppercase word-level..."
    ASS="$TMPDIR/captions.ass"
    python3 << PYEOF
import json, os
words = json.load(open("$WORDS_JSON"))
LINES, cur = [], []
for w in words:
    cur.append(w)
    if len(cur) >= 4 or (cur[-1]["end"] - cur[0]["start"]) >= 2.0:
        LINES.append(cur); cur = []
if cur: LINES.append(cur)

def fmt(t):
    h = int(t//3600); m = int((t%3600)//60); s = t%60
    return f"{h}:{m:02d}:{s:05.2f}"

HEADER = """[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 0
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.709

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Anton,72,&H00FFFFFF,&H0000FFFF,&H00000000,&HC0000000,1,0,0,0,100,100,1,0,1,4,2,2,140,140,100,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
events = []
for line in LINES:
    parts = []
    for w in line:
        dur_cs = max(int((w["end"] - w["start"]) * 100), 5)
        clean = w["word"].strip().upper().replace("{","").replace("}","")
        parts.append(f"{{\\kf{dur_cs}}}{clean}")
    events.append(f"Dialogue: 0,{fmt(line[0]['start'])},{fmt(line[-1]['end'])},Default,,0,0,0,,{' '.join(parts)}")

with open("$ASS","w") as f:
    f.write(HEADER + "\n".join(events) + "\n")
print(f"  ✅ {len(LINES)} linhas · {sum(len(l) for l in LINES)} palavras")
PYEOF
    echo "  🔥 Burn-in karaokê..."
    ffmpeg -y -i "$VIDEO_SRC" -vf "ass=$ASS" \
        -c:v libx264 -preset medium -crf 16 -pix_fmt yuv420p -profile:v high -level 4.2 \
        -r 30 -g 30 -an -movflags +faststart \
        "$TMPDIR/video-subbed.mp4" 2>/dev/null
    VIDEO_SRC="$TMPDIR/video-subbed.mp4"
    echo "  ✅ Karaokê aplicado"
fi

echo ""
echo "🔊 Mixando áudio AAC 192k..."
ffmpeg -y -i "$VIDEO_SRC" -i "$AUDIO" \
    -c:v copy -c:a aac -b:a 192k -map 0:v:0 -map 1:a:0 \
    -shortest -movflags +faststart "$OUTPUT" 2>/dev/null

SIZE=$(du -h "$OUTPUT" | cut -f1)
DURATION=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUTPUT" 2>/dev/null)
MIN=$((${DURATION%.*} / 60)); SEC=$((${DURATION%.*} % 60))
echo ""
echo "════════════════════════════════════════"
echo "🎉 PRONTO: $OUTPUT"
echo "   $SIZE · ${MIN}:${SEC} · 1920x1080"
echo "════════════════════════════════════════"
