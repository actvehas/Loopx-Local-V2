#!/usr/bin/env python3
"""Regenera cenas-minutagem.md a partir de audio.srt existente, aplicando o
algoritmo novo (zero gap entre cenas + duração 6-8s).

Uso: regen-cenas-minutagem.py <EPISODE_DIR>
"""
import sys, os, re

MIN_DUR, MAX_DUR = 6.0, 8.0

def parse_srt_time(t):
    h, m, rest = t.split(":")
    s, ms = rest.split(",")
    return int(h) * 3600 + int(m) * 60 + int(s) + int(ms) / 1000

def parse_srt(path):
    """Retorna lista de segments [{start, end, text}]."""
    blocks = open(path).read().strip().split("\n\n")
    segs = []
    for b in blocks:
        lines = b.split("\n")
        if len(lines) < 3:
            continue
        m = re.match(r"(\d{2}:\d{2}:\d{2},\d{3}) --> (\d{2}:\d{2}:\d{2},\d{3})", lines[1])
        if not m:
            continue
        segs.append({
            "start": parse_srt_time(m.group(1)),
            "end": parse_srt_time(m.group(2)),
            "text": " ".join(lines[2:]).strip(),
        })
    return segs

def regen(episode_dir):
    srt_path = os.path.join(episode_dir, "audio.srt")
    out_path = os.path.join(episode_dir, "cenas-minutagem.md")
    if not os.path.isfile(srt_path):
        print(f"❌ {srt_path} não existe")
        sys.exit(1)

    segments = parse_srt(srt_path)
    if not segments:
        print(f"❌ SRT vazio: {srt_path}")
        sys.exit(1)

    # Detecta número do EP do path
    num_match = re.match(r"^(\d+) - ", os.path.basename(episode_dir))
    num = num_match.group(1) if num_match else "?"

    scenes = []
    cur_text, cur_start, cur_end, sn, prev_end = "", None, None, 1, 0.0
    for i, seg in enumerate(segments):
        if cur_start is None:
            cur_start = prev_end if prev_end > 0 else seg["start"]
        cur_text += " " + seg["text"]
        cur_end = seg["end"]
        dur = cur_end - cur_start
        is_last = i == len(segments) - 1
        sentence_end = seg["text"].endswith((".", "?", "!", ";"))
        if dur >= MAX_DUR or (dur >= MIN_DUR and sentence_end) or is_last:
            end_time = min(cur_end, cur_start + MAX_DUR)
            if end_time - cur_start < MIN_DUR:
                end_time = cur_start + MIN_DUR
            m1, s1 = int(cur_start // 60), int(cur_start % 60)
            m2, s2 = int(end_time // 60), int(end_time % 60)
            scenes.append(f'Cena {sn} ({m1}:{s1:02d}-{m2}:{s2:02d}): "{cur_text.strip()}"')
            sn += 1
            prev_end = end_time
            cur_text, cur_start, cur_end = "", None, None

    # Backup do antigo (se existir)
    if os.path.isfile(out_path):
        bak = out_path + ".bak"
        os.rename(out_path, bak)
        print(f"📦 Backup: {bak}")

    with open(out_path, "w") as f:
        f.write(f"# Cenas com Minutagem — Roteiro {num}\n\n")
        f.write(f"Total: {len(scenes)} cenas (regeneradas com algoritmo zero-gap 6-8s)\n\n")
        for s in scenes:
            f.write(s + "\n")

    print(f"✅ {out_path} — {len(scenes)} cenas")
    # Sanity check: durações
    durs = []
    for s in scenes:
        m = re.match(r"Cena \d+ \((\d+):(\d+)-(\d+):(\d+)\)", s)
        if m:
            a = int(m.group(1)) * 60 + int(m.group(2))
            b = int(m.group(3)) * 60 + int(m.group(4))
            durs.append(b - a)
    if durs:
        print(f"   Durações: min={min(durs)}s max={max(durs)}s avg={sum(durs)/len(durs):.1f}s")
        print(f"   Fora do range 6-8s: {sum(1 for d in durs if d < 6 or d > 8)} cenas")

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Uso: regen-cenas-minutagem.py <EPISODE_DIR>")
        sys.exit(1)
    regen(sys.argv[1])
