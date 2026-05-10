#!/usr/bin/env python3
"""Verse overlay — destaque visual quando o narrador cita um versículo.
Gera card grande no topo (LIVRO CAP:VERS) com fundo translúcido durante a citação.
Detecta padrões em roteiro.md, mapeia tempo via words.json, burn-in via ASS+libass.

Uso: python3 verse-overlay.py CANAL NUM [INPUT_FILENAME]
  CANAL=I, NUM=20  → input default: final-typewriter.mp4 (se existir) ou final.mp4
  Se INPUT_FILENAME passado, usa esse arquivo no EP_DIR.

Output: final-verses.mp4 no EP_DIR (também serve como base pra próximas pós).
"""
import sys, os, re, json, glob, subprocess, unicodedata

if len(sys.argv) < 3:
    print("Uso: python3 verse-overlay.py CANAL NUM [INPUT_FILENAME]")
    sys.exit(1)

CANAL = sys.argv[1]
NUM = int(sys.argv[2])
INPUT_NAME = sys.argv[3] if len(sys.argv) > 3 else None

VAULT = os.path.expanduser("~/Documents/Obsidian Vault")
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CHS = json.load(open(os.path.join(SCRIPT_DIR, "..", "config", "channels.json")))
CH_NAME = CHS.get(CANAL, {}).get("name", "")

ep_glob = os.path.join(VAULT, "Projetos", "Meus Canais", CH_NAME, f"{NUM:02d} - *")
matches = glob.glob(ep_glob) + glob.glob(os.path.join(VAULT, "Projetos", "Meus Canais", CH_NAME, f"{NUM} - *"))
if not matches:
    print(f"❌ EP{NUM} não encontrado em {os.path.dirname(ep_glob)}")
    sys.exit(1)
EP_DIR = matches[0]

ROTEIRO = os.path.join(EP_DIR, "roteiro.md")
WORDS_JSON = os.path.join(EP_DIR, "words.json")
if INPUT_NAME:
    INPUT = os.path.join(EP_DIR, INPUT_NAME)
elif os.path.exists(os.path.join(EP_DIR, "final-typewriter.mp4")):
    INPUT = os.path.join(EP_DIR, "final-typewriter.mp4")
else:
    INPUT = os.path.join(EP_DIR, "final.mp4")
ASS = os.path.join(EP_DIR, "verses.ass")
OUTPUT = os.path.join(EP_DIR, "final-verses.mp4")

if not os.path.exists(INPUT):
    print(f"❌ Vídeo de entrada não existe: {INPUT}")
    sys.exit(1)
if not os.path.exists(WORDS_JSON):
    print(f"❌ words.json não existe — rodar TTS primeiro")
    sys.exit(1)
if not os.path.exists(ROTEIRO):
    print(f"❌ roteiro.md não existe")
    sys.exit(1)

# Books in PT/ES (canal I é ES, mas accept both)
BOOKS = [
    "Génesis","Genesis","Éxodo","Exodo","Levítico","Levitico","Números","Numeros",
    "Deuteronomio","Deuteronómio","Josué","Josue","Jueces","Rut","Samuel","Reyes",
    "Crónicas","Cronicas","Esdras","Nehemías","Nehemias","Ester","Job","Salmos",
    "Proverbios","Eclesiastés","Eclesiastes","Cantares","Isaías","Isaias","Jeremías","Jeremias",
    "Lamentaciones","Ezequiel","Daniel","Oseas","Joel","Amós","Amos","Abdías","Abdias",
    "Jonás","Jonas","Miqueas","Nahúm","Nahum","Habacuc","Sofonías","Sofonias","Hageo",
    "Zacarías","Zacarias","Malaquías","Malaquias",
    "Mateo","Marcos","Lucas","Juan","Hechos","Romanos","Corintios","Gálatas","Galatas",
    "Efesios","Filipenses","Colosenses","Tesalonicenses","Timoteo","Tito","Filemón","Filemon",
    "Hebreos","Santiago","Pedro","Judas","Apocalipsis"
]

# Build regex: optional "primer/segundo/primera/segunda/1/2" + book + chap (numbers or "diez"/"once") + "versiculo(s)" + range
# Para simplificar, vou parsear roteiro buscando padrões:
#   "Levítico diecinueve, versículo treinta y uno"
#   "Deuteronomio dieciocho, versículo diez al doce"
#   "Eclesiastés nueve, versículos cinco y seis"
#   "Job siete, versículo nueve y diez"
#   "Primer Crónicas diez, versículos trece y catorce"
#   "Segunda Corintios once, versículo catorce"

WORD_TO_NUM = {
    "uno":1,"una":1,"dos":2,"tres":3,"cuatro":4,"cinco":5,"seis":6,"siete":7,"ocho":8,"nueve":9,
    "diez":10,"once":11,"doce":12,"trece":13,"catorce":14,"quince":15,"dieciséis":16,"dieciseis":16,
    "diecisiete":17,"dieciocho":18,"diecinueve":19,"veinte":20,"veintiuno":21,"veintidós":22,"veintidos":22,
    "veintitrés":23,"veintitres":23,"veinticuatro":24,"veinticinco":25,"veintiséis":26,"veintiseis":26,
    "veintisiete":27,"veintiocho":28,"veintinueve":29,"treinta":30,"treinta y uno":31,"treinta y dos":32,
    "primer":1,"primero":1,"primera":1,"segundo":2,"segunda":2,
}

def to_num(s):
    s = s.strip().lower()
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    if s.isdigit(): return int(s)
    return WORD_TO_NUM.get(s)

# Extract verse references from roteiro
roteiro_text = open(ROTEIRO).read()

# Pattern: optional ordinal + Book + chap_word + ("," | empty) + "versiculo(s)" + verse_word [+ "al"|"y" + verse_word]
ord_pat = r"(?:(?:Primer|Segundo|Primera|Segunda)\s+)?"
book_pat = r"(" + r"|".join(BOOKS) + r")"
# chap: número ou palavra simples (sem "y" composto pra não confundir com range)
chap_pat = r"(\d+|treinta y uno|treinta y dos|veintiuno|veintidós|veintidos|veintitrés|veintitres|veinticuatro|veinticinco|veintiséis|veintiseis|veintisiete|veintiocho|veintinueve|[a-záéíóú]+)"
vers_kw = r"vers[ií]culos?"
vers_pat = r"(\d+|treinta y uno|treinta y dos|veintiuno|veintidós|veintidos|veintitrés|veintitres|veinticuatro|veinticinco|veintiséis|veintiseis|veintisiete|veintiocho|veintinueve|[a-záéíóú]+)"
range_pat = r"(?:\s+(?:al|y)\s+(\d+|treinta y uno|treinta y dos|veintiuno|veintidós|veintidos|veintitrés|veintitres|veinticuatro|veinticinco|veintiséis|veintiseis|veintisiete|veintiocho|veintinueve|[a-záéíóú]+))?"

regex = re.compile(
    ord_pat + book_pat + r"\s+" + chap_pat + r"[,]?\s+" + vers_kw + r"\s+" + vers_pat + range_pat,
    re.IGNORECASE
)

refs = []
for m in regex.finditer(roteiro_text):
    full = m.group(0)
    # Strip ordinal prefix from full to get book root
    book = m.group(1)
    chap_raw = m.group(2)
    v1_raw = m.group(3)
    v2_raw = m.group(4)
    chap = to_num(chap_raw)
    v1 = to_num(v1_raw)
    v2 = to_num(v2_raw) if v2_raw else None
    if not chap or not v1:
        continue
    # Detect ordinal prefix in original match
    pre = roteiro_text[max(0, m.start()-15):m.start()].lower()
    ord_prefix = ""
    for o in ["primera","segunda","primer","segundo"]:
        if o in pre:
            ord_prefix = "1 " if o.startswith("prim") else "2 "
            break
    label = f"{ord_prefix}{book.upper()} {chap}:{v1}"
    if v2: label += f"-{v2}"
    refs.append({"label": label, "match_text": full, "match_start": m.start()})

print(f"📖 {len(refs)} versículos detectados no roteiro")
for r in refs:
    print(f"   {r['label']}  ←  '{r['match_text'][:60]}'")

# Map each ref to a time window via words.json
words = json.load(open(WORDS_JSON))

def normalize(t):
    return unicodedata.normalize("NFKD", t.lower()).encode("ascii","ignore").decode()

# For each ref, find sequence of words in words.json that approximately matches first 5-7 tokens of match_text
def find_time_window(target_text, search_start_word_idx=0):
    target_tokens = normalize(target_text).split()[:6]  # first 6 tokens (e.g., "levitico diecinueve versiculo treinta y uno")
    if not target_tokens: return None, search_start_word_idx
    n = len(target_tokens)
    for i in range(search_start_word_idx, len(words) - n + 1):
        match = True
        for j in range(n):
            wt = normalize(words[i+j]["word"]).strip(".,;:")
            tt = target_tokens[j].strip(".,;:")
            # accept partial match (Whisper sometimes drops accents/joins)
            if not (wt == tt or wt.startswith(tt[:max(3,len(tt)-2)]) or tt.startswith(wt[:max(3,len(wt)-2)])):
                match = False
                break
        if match:
            return (words[i]["start"], words[i+n-1]["end"]), i + n
    return None, search_start_word_idx

# Sequential scan to preserve order
search_idx = 0
for r in refs:
    win, search_idx = find_time_window(r["match_text"], search_idx)
    if win:
        # Extend visibility 5s after recitation begins (typical citation duration)
        r["start"] = win[0]
        r["end"] = win[1] + 5.0
    else:
        # fallback: use proportional position in audio based on match_start in roteiro
        ratio = r["match_start"] / max(1, len(roteiro_text))
        total_dur = words[-1]["end"]
        r["start"] = ratio * total_dur
        r["end"] = r["start"] + 6.0

print("\n⏱️  Timestamps mapeados:")
for r in refs:
    if "start" in r:
        print(f"   {r['label']}  →  {r['start']:.1f}s - {r['end']:.1f}s")

# Build ASS
W, H = 1280, 720
def fmt(t):
    h = int(t // 3600); m = int((t % 3600) // 60); s = t % 60
    return f"{h}:{m:02d}:{s:05.2f}"

header = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {W}
PlayResY: {H}
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Verse,Anton,72,&H0000D7FF,&H0000D7FF,&H00000000,&HC8000000,-1,0,0,0,100,100,2,0,3,4,2,8,40,40,40,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
# Style: Anton 72pt, primary color &H0000D7FF = gold (BBGGRR), outline black 4px, BorderStyle=3 = opaque box, Alignment=8 = top-center
events = []
for r in refs:
    if "start" not in r: continue
    txt = r["label"].replace("{","\\{").replace("}","\\}")
    events.append(f"Dialogue: 0,{fmt(r['start'])},{fmt(r['end'])},Verse,,0,0,0,,{txt}")

with open(ASS, "w") as f:
    f.write(header + "\n".join(events) + "\n")
print(f"\n✅ ASS gerado: {ASS} ({len(events)} cards)")

# Burn-in
print(f"\n🎬 Burning into {OUTPUT}...")
ass_esc = ASS.replace("\\", "\\\\").replace(":", "\\:").replace("'", "\\'")
ff = [
    "ffmpeg", "-y", "-i", INPUT,
    "-vf", f"ass={ASS}",
    "-c:v", "libx264", "-preset", "fast", "-crf", "20", "-pix_fmt", "yuv420p",
    "-c:a", "copy", "-movflags", "+faststart",
    OUTPUT,
]
r = subprocess.run(ff, capture_output=True)
if r.returncode != 0:
    print("❌ ffmpeg falhou:")
    print(r.stderr.decode()[-1000:])
    sys.exit(1)
sz = os.path.getsize(OUTPUT) / 1024 / 1024
print(f"✅ {OUTPUT} ({sz:.0f}MB)")
