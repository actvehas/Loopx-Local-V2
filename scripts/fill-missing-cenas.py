#!/usr/bin/env python3
"""Fill-missing-cenas — pra cada cena sem MP4 em Cenas/, gera um MP4 typewriter
fullscreen caixa-alta com o texto narrado naquele momento (do cenas-minutagem.md).
Roda ANTES do assembly. Resultado: Cenas/ fica completa.

Uso: python3 fill-missing-cenas.py CANAL NUM
"""
import sys, os, re, json, glob, subprocess, tempfile, shutil
from PIL import Image, ImageDraw, ImageFont

if len(sys.argv) < 3:
    print("Uso: python3 fill-missing-cenas.py CANAL NUM")
    sys.exit(1)

CANAL = sys.argv[1]
NUM = int(sys.argv[2])
VAULT = os.path.expanduser("~/Documents/Obsidian Vault")
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CHS = json.load(open(os.path.join(SCRIPT_DIR, "..", "config", "channels.json")))
CH_NAME = CHS.get(CANAL, {}).get("name", "")

ep_glob = os.path.join(VAULT, "Projetos", "Meus Canais", CH_NAME, f"{NUM:02d} - *")
matches = glob.glob(ep_glob) + glob.glob(os.path.join(VAULT, "Projetos", "Meus Canais", CH_NAME, f"{NUM} - *"))
if not matches:
    print(f"❌ EP{NUM} não encontrado")
    sys.exit(1)
EP_DIR = matches[0]
CENAS_DIR = os.path.join(EP_DIR, "Cenas")
MINUTAGEM = os.path.join(EP_DIR, "cenas-minutagem.md")
os.makedirs(CENAS_DIR, exist_ok=True)

W, H, FPS = 1280, 720, 24
FONT_PATH = "/System/Library/Fonts/Menlo.ttc"
FONT_SIZE = 56
LINE_H = 72
MAX_CHARS = 28
BG = (0, 0, 0)
FG = (240, 240, 230)
CURSOR = "▋"

# Parse cenas-minutagem.md
cenas = []  # list of (num, start, end, text)
with open(MINUTAGEM) as f:
    for line in f:
        m = re.match(r"Cena (\d+) \((\d+):(\d+)-(\d+):(\d+)\):\s*\"(.+?)\"", line)
        if m:
            cenas.append({
                "num": int(m.group(1)),
                "start": int(m.group(2))*60 + int(m.group(3)),
                "end": int(m.group(4))*60 + int(m.group(5)),
                "text": m.group(6).strip(),
            })
            continue
        m2 = re.match(r"Cena (\d+) \((\d+):(\d+)-fim\):\s*\"(.+?)\"", line)
        if m2:
            cenas.append({
                "num": int(m2.group(1)),
                "start": int(m2.group(2))*60 + int(m2.group(3)),
                "end": int(m2.group(2))*60 + int(m2.group(3)) + 8,
                "text": m2.group(4).strip(),
            })

# Find missing
existing = set()
for f in os.listdir(CENAS_DIR):
    m = re.search(r"Cena[_ ]*(\d+)", f)
    if m and f.lower().endswith(".mp4"):
        existing.add(int(m.group(1)))

missing = [c for c in cenas if c["num"] not in existing]
print(f"📊 {len(cenas)} cenas total | {len(existing)} existem | {len(missing)} faltam")
if not missing:
    print("✅ Nenhuma cena faltante")
    sys.exit(0)

font = ImageFont.truetype(FONT_PATH, FONT_SIZE)

def condense(text):
    """Condensa o texto pra ~3-6 palavras-chave em caixa alta. Heurística simples:
    pega primeira frase, remove stopwords curtas, mantém substantivos/verbos visíveis."""
    text = text.upper().strip().rstrip(".,;:")
    # split on first punctuation; pegamos a primeira clausula
    first = re.split(r"[,.;]", text)[0].strip()
    words = first.split()
    # se >12 palavras, pega primeiras 8 + reticências
    if len(words) > 10:
        first = " ".join(words[:8]) + "..."
    return first

def wrap_text(text, max_chars=MAX_CHARS):
    if len(text) <= max_chars:
        return [text]
    words = text.split(" ")
    lines, cur = [], ""
    for w in words:
        if not cur: cur = w
        elif len(cur) + 1 + len(w) <= max_chars:
            cur += " " + w
        else:
            lines.append(cur); cur = w
    if cur: lines.append(cur)
    return lines

def render_cena(cena):
    num = cena["num"]
    text = condense(cena["text"])
    dur = max(8, cena["end"] - cena["start"])  # minimum 8s
    n_chars = len(text)
    typing_end_frame = int(dur * FPS * 0.78)
    total_frames = int(dur * FPS)
    print(f"   🎬 Cena {num} ({dur}s): '{text[:40]}{'...' if len(text)>40 else ''}'")
    tmp = tempfile.mkdtemp(prefix=f"fill_{num}_")
    for f in range(total_frames):
        img = Image.new("RGB", (W, H), BG)
        draw = ImageDraw.Draw(img)
        if f < typing_end_frame:
            n_show = max(1, int((f / typing_end_frame) * n_chars))
            display = text[:n_show]
            show_cursor = (f // 6) % 2 == 0
        else:
            display = text
            show_cursor = ((f - typing_end_frame) // 12) % 2 == 0
        lines = wrap_text(display)
        if show_cursor and lines:
            lines[-1] = lines[-1] + CURSOR
        block_h = len(lines) * LINE_H
        y0 = (H - block_h) // 2
        for i, line in enumerate(lines):
            bbox = draw.textbbox((0, 0), line, font=font)
            x = (W - (bbox[2]-bbox[0])) // 2
            y = y0 + i * LINE_H
            draw.text((x, y), line, font=font, fill=FG)
        img.save(os.path.join(tmp, f"f{f:04d}.png"))
    out = os.path.join(CENAS_DIR, f"(Cena_{num:03d}).mp4")
    cmd = ["ffmpeg", "-y", "-loglevel", "error",
           "-framerate", str(FPS), "-i", os.path.join(tmp, "f%04d.png"),
           "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "medium", "-crf", "20",
           "-movflags", "+faststart", out]
    subprocess.run(cmd, check=True)
    shutil.rmtree(tmp)
    sz = os.path.getsize(out) / 1024 / 1024
    print(f"      ✅ {out} ({sz:.1f}MB)")

for c in missing:
    render_cena(c)

print(f"\n✅ {len(missing)} cenas geradas — Cenas/ agora completa ({len(cenas)}/{len(cenas)})")
