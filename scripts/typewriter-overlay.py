#!/usr/bin/env python3
"""Typewriter overlay paralelo: 12 workers renderizam frames PNG, ffmpeg overlay no fim."""
import json, subprocess, os, re, time
from multiprocessing import Pool
from PIL import Image, ImageDraw, ImageFont

import sys, glob
if len(sys.argv) < 3:
    print("Uso: python3 typewriter-overlay.py CANAL NUM [VAULT_PATH]")
    sys.exit(1)
CANAL = sys.argv[1]; NUM = int(sys.argv[2])
VAULT = sys.argv[3] if len(sys.argv) > 3 else os.path.expanduser("~/Documents/Obsidian Vault")
import json as _json
_chs = _json.load(open(os.path.join(os.path.dirname(__file__), "..", "config", "channels.json")))
CH_NAME = _chs.get(CANAL, {}).get("name", "")
_search = os.path.join(VAULT, "Projetos", "Meus Canais", CH_NAME, f"{NUM:02d} - *")
_matches = glob.glob(_search) + glob.glob(os.path.join(VAULT, "Projetos", "Meus Canais", CH_NAME, f"{NUM} - *"))
if not _matches:
    print(f"❌ EP{NUM} pasta não encontrada em {os.path.join(VAULT, 'Projetos', 'Meus Canais', CH_NAME)}")
    sys.exit(1)
EP_DIR = _matches[0]
WORDS = os.path.join(EP_DIR, "words.json")
INPUT = os.path.join(EP_DIR, "final.mp4")
OUTPUT = os.path.join(EP_DIR, "final-typewriter.mp4")
TMP = f"/tmp/typewriter_frames_{CANAL}{NUM}"

W, H, FPS = 1280, 720, 24
FONT_PATH = "/System/Library/Fonts/Menlo.ttc"
FONT_SIZE = 38
LINE_H = 50
PAD = 60
MAX_CHARS = 38
CURSOR = "▋"

# Build records at module level so workers inherit via fork
with open(WORDS) as _f: _words = json.load(_f)
_groups, _cur = [], []
for _w in _words:
    _cur.append(_w)
    _t = _w["word"].rstrip()
    if _t and _t[-1] in ".?!" and len(_cur) >= 3:
        _groups.append(_cur); _cur = []
if _cur: _groups.append(_cur)

RECORDS = []
for s in _groups:
    text = re.sub(r"\s+", " ", " ".join(w["word"] for w in s).upper()).strip()
    if not text: continue
    s_start, s_end = s[0]["start"], s[-1]["end"]
    n = len(text)
    char_times = [s_start + (s_end - s_start) * (i + 1) / n for i in range(n)]
    RECORDS.append({"text": text, "start": s_start, "end": s_end + 0.6, "char_times": char_times})

def find_record(t):
    for r in RECORDS:
        if r["start"] <= t <= r["end"]:
            return r
    return None

def wrap_text(text):
    if len(text) <= MAX_CHARS: return [text]
    words_l = text.split(" ")
    lines, cur = [], ""
    for w in words_l:
        if not cur: cur = w
        elif len(cur) + 1 + len(w) <= MAX_CHARS:
            cur += " " + w
        else:
            lines.append(cur); cur = w
    if cur: lines.append(cur)
    return lines

def render_slice(args):
    start_f, end_f = args
    font = ImageFont.truetype(FONT_PATH, FONT_SIZE)
    blank = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    for f in range(start_f, end_f):
        t = f / FPS
        rec = find_record(t)
        out_path = os.path.join(TMP, f"f{f:06d}.png")
        if not rec:
            blank.save(out_path); continue
        n_show = sum(1 for ct in rec["char_times"] if t >= ct)
        if n_show == 0:
            blank.save(out_path); continue
        text = rec["text"][:n_show]
        show_cursor = (int(t * 2.5) % 2 == 0)
        lines = wrap_text(text)
        if show_cursor and lines:
            lines[-1] += CURSOR
        img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)
        block_h = len(lines) * LINE_H
        y0 = H - PAD - block_h
        for i, line in enumerate(lines):
            bbox = draw.textbbox((0, 0), line, font=font)
            x = (W - (bbox[2]-bbox[0])) // 2
            y = y0 + i * LINE_H
            for dx, dy in [(-2,0),(2,0),(0,-2),(0,2),(-2,-2),(2,2),(-2,2),(2,-2)]:
                draw.text((x+dx, y+dy), line, font=font, fill=(0,0,0))
            draw.text((x, y), line, font=font, fill=(255,255,255))
        img.save(out_path)
    return f"{start_f}-{end_f}"

def main():
    os.makedirs(TMP, exist_ok=True)
    for f in os.listdir(TMP):
        try: os.unlink(os.path.join(TMP, f))
        except: pass
    print(f"📝 {len(RECORDS)} frases / {len(_words)} palavras")
    dur = float(subprocess.run(["ffprobe","-v","error","-show_entries","format=duration","-of","csv=p=0",INPUT], capture_output=True, text=True).stdout.strip())
    total_frames = int(dur * FPS)
    print(f"🎬 {total_frames} frames")
    N = 12
    chunk = (total_frames + N - 1) // N
    chunks = [(i*chunk, min((i+1)*chunk, total_frames)) for i in range(N)]
    print(f"⚙️  {N} workers × {chunk} frames cada")
    t0 = time.time()
    with Pool(N) as pool:
        for r in pool.imap_unordered(render_slice, chunks):
            print(f"   ✅ {r}  ({time.time()-t0:.0f}s)", flush=True)
    print(f"\n🎞️  Encoding overlay...")
    ff = ["ffmpeg", "-y", "-loglevel", "error",
          "-i", INPUT,
          "-framerate", str(FPS), "-i", os.path.join(TMP, "f%06d.png"),
          "-filter_complex", "[0:v][1:v]overlay=0:0:format=auto[outv]",
          "-map", "[outv]", "-map", "0:a?",
          "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "fast", "-crf", "20",
          "-c:a", "copy", "-movflags", "+faststart", OUTPUT]
    subprocess.run(ff, check=True)
    sz = os.path.getsize(OUTPUT) / 1024 / 1024
    print(f"✅ {OUTPUT} ({sz:.0f}MB)  total {time.time()-t0:.0f}s")
    for f in os.listdir(TMP):
        try: os.unlink(os.path.join(TMP, f))
        except: pass

if __name__ == "__main__":
    main()
