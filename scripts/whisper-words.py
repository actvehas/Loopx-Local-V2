#!/usr/bin/env python3
"""whisper-words.py — gera JSON com word-level timestamps a partir de audio.wav

Uso:
  python3 whisper-words.py <audio.wav> <output.json>
"""
import sys, json, warnings
warnings.filterwarnings("ignore")

import whisper

if len(sys.argv) != 3:
    print(f"Uso: {sys.argv[0]} <audio.wav> <output.json>")
    sys.exit(1)

audio_path = sys.argv[1]
out_path = sys.argv[2]

print(f"🎯 Whisper word-level timestamps → {audio_path}")
model = whisper.load_model("base")
result = model.transcribe(audio_path, language="es", word_timestamps=True)

words = []
for seg in result.get("segments", []):
    for w in seg.get("words", []):
        words.append({
            "word": w["word"].strip(),
            "start": round(w["start"], 3),
            "end": round(w["end"], 3),
        })

with open(out_path, "w", encoding="utf-8") as f:
    json.dump(words, f, ensure_ascii=False, indent=2)

print(f"✅ {len(words)} palavras com timestamps → {out_path}")
