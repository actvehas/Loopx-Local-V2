#!/usr/bin/env python3
"""
TTS Pipeline Completo — Qwen3-TTS 8-bit + Whisper
Carrega o modelo UMA VEZ e processa todos os chunks em sequência.

Uso:
  python3 tts-full.py --num 16 --voice E-female-es-01
"""

import argparse
import json
import os
import random
import sys
import time
import numpy as np
import soundfile as sf
from pathlib import Path

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
VOICE_REFS = os.path.join(SCRIPT_DIR, "voice-refs.json")
MODEL_ID = "mlx-community/Qwen3-TTS-12Hz-1.7B-Base-8bit"
SPEED = 1.0
OBSIDIAN_BASE = os.path.expanduser("~/Documents/Obsidian Vault/Projetos/Meus Canais")
CHANNELS_JSON = os.path.join(PROJECT_ROOT, "config", "channels.json")

# Vozes por canal (rotação cíclica de 8 vozes)
VOICE_PREFIXES = {
    "I": "I-male-es",
    "J": "J-male-es",
    "K": "K-male-es",
}

# Idioma por canal (Qwen3-TTS aceita nomes completos: "spanish", "english", etc.)
LANG_CODES = {
    "I": "spanish",
    "J": "spanish",
    "K": "spanish",
}
# Idioma curto pra Whisper (ISO 639-1)
WHISPER_LANG = {
    "I": "es", "J": "es", "K": "es",
}


def find_episode_dir(canal, num):
    """Encontra a pasta do episódio no Obsidian pelo número."""
    with open(CHANNELS_JSON) as f:
        channels = json.load(f)
    channel_name = channels.get(canal, {}).get("name")
    if not channel_name:
        print(f"❌ Canal {canal} não encontrado em channels.json")
        sys.exit(1)
    channel_dir = os.path.join(OBSIDIAN_BASE, channel_name)
    if not os.path.isdir(channel_dir):
        print(f"❌ Pasta não encontrada: {channel_dir}")
        sys.exit(1)
    for d in os.listdir(channel_dir):
        # Support both "1 - Title" and "01 - Title" formats
        num_str = str(num)
        num_padded = f"{num:02d}"
        if (d.startswith(f"{num_str} - ") or d.startswith(f"{num_padded} - ")) and os.path.isdir(os.path.join(channel_dir, d)):
            return d, channel_dir
    print(f"❌ Episódio {num} não encontrado em {channel_dir}")
    sys.exit(1)


def get_voice(canal, num):
    """Retorna voz por rotação cíclica (8 vozes por canal).
    Canal G usa voz fixa (mesmo narrador em todos os episódios)."""
    prefix = VOICE_PREFIXES.get(canal, f"{canal}-female-es")
    if canal in ("I", "J", "K"):
        return f"{prefix}-01"  # Fixed narrator
    idx = ((num - 1) % 8) + 1
    return f"{prefix}-{idx:02d}"


def load_text(roteiro_path):
    with open(roteiro_path, 'r', encoding='utf-8') as f:
        text = f.read()
    lines = text.split('\n')
    clean = [l for l in lines if not l.strip().startswith('Bloque ')
             and not l.strip().startswith('# ')
             and not l.strip().startswith('## ')
             and not l.strip().startswith('---')]
    return '\n'.join(clean).strip()


def chunk_by_paragraph(text, target_words=280, max_words=340):
    """Agrupa parágrafos em chunks de ~target_words, sem quebrar parágrafo.
    Retorna lista de tuplas (chunk_text, ends_paragraph_break: bool)."""
    paragraphs = [p.strip() for p in text.split('\n\n') if p.strip()]
    chunks = []
    cur, cur_words = [], 0
    for p in paragraphs:
        pw = len(p.split())
        if cur and cur_words + pw > max_words:
            chunks.append('\n\n'.join(cur))
            cur, cur_words = [], 0
        cur.append(p)
        cur_words += pw
        if cur_words >= target_words:
            chunks.append('\n\n'.join(cur))
            cur, cur_words = [], 0
    if cur:
        chunks.append('\n\n'.join(cur))
    return chunks


def trim_silence(audio, sr, threshold_db=-50.0, pad_ms=200):
    """Corta silêncio nas pontas, deixa um pequeno padding natural.
    threshold em dBFS abaixo do pico."""
    if len(audio) == 0:
        return audio
    peak = np.max(np.abs(audio)) or 1e-9
    threshold = peak * (10 ** (threshold_db / 20))
    # janela RMS de 20ms
    win = max(1, int(sr * 0.02))
    if len(audio) < win * 2:
        return audio
    # encontra primeiro/último frame acima do limiar
    abs_audio = np.abs(audio)
    above = abs_audio > threshold
    idx = np.where(above)[0]
    if len(idx) == 0:
        return audio
    pad = int(sr * pad_ms / 1000)
    start = max(0, idx[0] - pad)
    end = min(len(audio), idx[-1] + pad)
    return audio[start:end]


def natural_gap(sr, last_char, rng):
    """Gap variável entre chunks, baseado no último caractere do chunk anterior.
    Adiciona jitter humano de ±15%."""
    base = {
        '.': 0.95,
        '?': 1.05,
        '!': 1.10,
        ':': 0.55,
        ';': 0.55,
        ',': 0.35,
    }.get(last_char, 0.80)
    jitter = rng.uniform(0.85, 1.15)
    duration = base * jitter
    return np.zeros(int(sr * duration), dtype=np.float32)


def apply_fades(audio, sr, fade_ms=180):
    """Fade-in/out cosine equal-power — junção suave entre chunks, sem clique."""
    n = int(sr * fade_ms / 1000)
    if len(audio) < 2 * n:
        return audio
    # Equal-power cosine curve (sin^2 ramp) — psicoacusticamente suave
    t = np.linspace(0, np.pi / 2, n, dtype=np.float32)
    fade_in = np.sin(t) ** 2
    fade_out = np.cos(t) ** 2
    audio = audio.copy()
    audio[:n] *= fade_in
    audio[-n:] *= fade_out
    return audio


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--num", type=int, required=True, help="Número do episódio")
    parser.add_argument("--canal", type=str, required=True, help="Canal (I, J, K, L)")
    parser.add_argument("--voice", type=str, default=None, help="Voz (default: automática)")
    args = parser.parse_args()

    # Carregar voice refs
    with open(VOICE_REFS) as f:
        voice_refs = json.load(f)

    nums = [args.num]

    for num in nums:
        folder, channel_dir = find_episode_dir(args.canal, num)

        voice_name = args.voice or get_voice(args.canal, num)
        voice = voice_refs.get(voice_name)
        if voice and not os.path.isabs(voice["audio_path"]):
            voice["audio_path"] = os.path.join(PROJECT_ROOT, voice["audio_path"])
        if not voice:
            print(f"❌ Voz {voice_name} não encontrada")
            continue

        # Prefer roteiro-tts.md (pre-cleaned for TTS) over roteiro.md
        tts_path = os.path.join(channel_dir, folder, "roteiro-tts.md")
        roteiro_path = tts_path if os.path.exists(tts_path) else os.path.join(channel_dir, folder, "roteiro.md")
        output_dir = os.path.join(channel_dir, folder)

        if not os.path.exists(roteiro_path):
            print(f"❌ Roteiro não encontrado: {roteiro_path}")
            continue

        print(f"\n{'='*60}")
        print(f"ROTEIRO {num} — Voz: {voice_name}")
        print(f"{'='*60}")

        # Carregar texto
        text = load_text(roteiro_path)
        words = len(text.split())
        print(f"📝 {words} palavras")

        # Dividir em chunks por parágrafo (~280 palavras alvo, 340 max)
        chunks = chunk_by_paragraph(text, target_words=280, max_words=340)
        print(f"📦 {len(chunks)} chunks (paragraph-aware)")

        # Carregar modelo UMA VEZ
        print(f"🔊 Carregando Qwen3-TTS 8-bit...")
        from mlx_audio.tts.generate import load_model, generate_audio

        loaded_model = load_model(MODEL_ID)
        print(f"✅ Modelo carregado na memória")

        start_time = time.time()

        # Gerar cada chunk reutilizando o modelo
        all_wavs = []
        for i, chunk in enumerate(chunks):
            print(f"  🔄 Chunk {i+1}/{len(chunks)}...", end=" ", flush=True)
            chunk_path = os.path.join(output_dir, f"_chunk_{i:03d}.wav")

            try:
                generate_audio(
                    text=chunk,
                    model=loaded_model,
                    voice=os.path.basename(voice["audio_path"]).replace(".wav",""),  # rótulo no log = nome real da voz, não "af_heart"
                    ref_audio=voice["audio_path"],
                    ref_text=voice["ref_text"],
                    lang_code=LANG_CODES.get(args.canal, "spanish"),
                    speed=SPEED,
                    output_path=chunk_path,
                    max_tokens=4096,  # default 1200 corta chunks em ~96s — chunks têm até 340 palavras (~2-3 min)
                    verbose=False
                )
                # O mlx-audio salva em subpasta
                wav_file = os.path.join(chunk_path, "audio_000.wav")
                if os.path.exists(wav_file):
                    all_wavs.append(wav_file)
                    dur = sf.info(wav_file).duration
                    print(f"✅ {dur:.1f}s")
                else:
                    print(f"⚠️ arquivo não gerado")
            except Exception as e:
                print(f"❌ {e}")

        elapsed = time.time() - start_time
        print(f"\n⏱️ TTS: {elapsed/60:.1f} minutos ({len(all_wavs)}/{len(chunks)} chunks)")

        if not all_wavs:
            print("❌ Nenhum áudio gerado")
            continue

        # Concatenar com pausas naturais (trim + gap variável + fades)
        print(f"\n📎 Concatenando {len(all_wavs)} chunks com pausas naturais...")
        audio_parts = []
        sr = 24000
        rng = random.Random(42 + num)  # determinístico por episódio
        for i, wav in enumerate(all_wavs):
            data, sr = sf.read(wav)
            if data.ndim > 1:
                data = data.mean(axis=1)
            data = data.astype(np.float32)
            # trim silêncio das pontas, deixa respiração natural
            data = trim_silence(data, sr, threshold_db=-50.0, pad_ms=300)
            # fade cosine equal-power 180ms — junção suave sem clique nem corte abrupto
            data = apply_fades(data, sr, fade_ms=180)
            audio_parts.append(data)
            if i < len(all_wavs) - 1:
                # gap baseado no fim do chunk (parágrafo => ponto final)
                last_char = chunks[i].rstrip()[-1] if chunks[i].rstrip() else '.'
                audio_parts.append(natural_gap(sr, last_char, rng))

        final_audio = np.concatenate(audio_parts)
        final_path = os.path.join(output_dir, "audio.wav")
        sf.write(final_path, final_audio, sr)
        duration = len(final_audio) / sr / 60
        print(f"✅ Áudio final: {final_path} ({duration:.1f} min)")

        # Limpar chunks temporários
        for wav in all_wavs:
            chunk_dir = os.path.dirname(wav)
            os.remove(wav)
            try:
                os.rmdir(chunk_dir)
                parent = os.path.dirname(chunk_dir)
                if parent.endswith('.wav'):
                    os.rmdir(parent)
            except:
                pass

        # Whisper → timestamps (com word_timestamps pra gerar words.json)
        print(f"\n🎯 Whisper → timestamps...")
        try:
            import whisper
            wmodel = whisper.load_model("base")
            result = wmodel.transcribe(final_path, language=WHISPER_LANG.get(args.canal, "es"), word_timestamps=True)

            # words.json — word-level timestamps pra typewriter/verse overlay em pós
            words_path = os.path.join(output_dir, "words.json")
            words_list = []
            for seg in result["segments"]:
                for w in seg.get("words", []):
                    words_list.append({"word": w["word"].strip(), "start": w["start"], "end": w["end"]})
            with open(words_path, 'w', encoding='utf-8') as f:
                json.dump(words_list, f, ensure_ascii=False)
            print(f"✅ Words: {words_path} ({len(words_list)} palavras)")

            # SRT
            srt_path = os.path.join(output_dir, "audio.srt")
            with open(srt_path, 'w', encoding='utf-8') as f:
                for i, seg in enumerate(result["segments"], 1):
                    s, e = seg["start"], seg["end"]
                    f.write(f"{i}\n")
                    f.write(f"{int(s//3600):02d}:{int((s%3600)//60):02d}:{s%60:06.3f}".replace('.', ','))
                    f.write(f" --> ")
                    f.write(f"{int(e//3600):02d}:{int((e%3600)//60):02d}:{e%60:06.3f}".replace('.', ','))
                    f.write(f"\n{seg['text'].strip()}\n\n")

            # Cenas agrupadas — ZERO GAP entre cenas + duração clampada em 6-8s.
            # Cada cena começa onde a anterior terminou (prev_end), não no start do segment
            # do Whisper. Pausas do narrador ficam DENTRO da cena, não entre elas.
            scenes_path = os.path.join(output_dir, "cenas-minutagem.md")
            MIN_DUR, MAX_DUR = 6.0, 8.0
            scenes = []
            cur_text, cur_start, cur_end, sn, prev_end = "", None, None, 1, 0.0
            for i, seg in enumerate(result["segments"]):
                if cur_start is None:
                    # Próxima cena começa exatamente onde a anterior fechou (anti-gap)
                    cur_start = prev_end if prev_end > 0 else seg["start"]
                cur_text += " " + seg["text"].strip()
                cur_end = seg["end"]
                dur = cur_end - cur_start
                is_last = (i == len(result["segments"]) - 1)
                sentence_end = seg["text"].strip().endswith((".", "?", "!", ";"))
                # Fecha cena se: 6s+ com fim de frase, OU 8s+ force, OU último segment
                if dur >= MAX_DUR or (dur >= MIN_DUR and sentence_end) or is_last:
                    # Clamp em MAX_DUR (Veo3 só gera 8s)
                    end_time = min(cur_end, cur_start + MAX_DUR)
                    # Garante MIN_DUR (estende se ficou curto — só último segment normalmente)
                    if end_time - cur_start < MIN_DUR:
                        end_time = cur_start + MIN_DUR
                    m1, s1 = int(cur_start // 60), int(cur_start % 60)
                    m2, s2 = int(end_time // 60), int(end_time % 60)
                    scenes.append(f'Cena {sn} ({m1}:{s1:02d}-{m2}:{s2:02d}): "{cur_text.strip()}"')
                    sn += 1
                    prev_end = end_time
                    cur_text, cur_start, cur_end = "", None, None

            with open(scenes_path, 'w', encoding='utf-8') as f:
                f.write(f"# Cenas com Minutagem — Roteiro {num}\n\n")
                f.write(f"Total: {len(scenes)} cenas\n\n")
                for s in scenes:
                    f.write(s + "\n")

            print(f"✅ SRT: {srt_path}")
            print(f"✅ Cenas: {scenes_path} ({len(scenes)} cenas)")

        except Exception as e:
            print(f"⚠️ Whisper falhou: {e}")

        print(f"\n{'='*60}")
        print(f"✅ ROTEIRO {num} COMPLETO")
        print(f"   audio.wav | audio.srt | cenas-minutagem.md")
        print(f"   Próximo: /sincronizador")
        print(f"{'='*60}")


if __name__ == "__main__":
    main()
