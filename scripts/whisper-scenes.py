"""
LoopX Local — Whisper + Scene Generator (cross-platform)
Generates SRT + cenas-minutagem.md from audio file.

Usage: python whisper-scenes.py <audio.wav> <output_dir> [language]
"""

import sys
import os
import whisper


def format_srt_time(seconds):
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = seconds % 60
    return f"{h:02d}:{m:02d}:{s:06.3f}".replace('.', ',')


def main():
    if len(sys.argv) < 3:
        print("Usage: python whisper-scenes.py <audio.wav> <output_dir> [language]")
        sys.exit(1)

    audio_path = sys.argv[1]
    output_dir = sys.argv[2]
    language = sys.argv[3] if len(sys.argv) > 3 else "es"

    os.makedirs(output_dir, exist_ok=True)

    # Load Whisper model (GPU-accelerated if available)
    print("Loading Whisper model...")
    model = whisper.load_model("base")
    print(f"Transcribing: {audio_path} (language: {language})")

    result = model.transcribe(audio_path, language=language)

    # Generate SRT
    srt_path = os.path.join(output_dir, "audio.srt")
    with open(srt_path, 'w', encoding='utf-8') as f:
        for i, seg in enumerate(result['segments'], 1):
            start = format_srt_time(seg['start'])
            end = format_srt_time(seg['end'])
            f.write(f"{i}\n")
            f.write(f"{start} --> {end}\n")
            f.write(f"{seg['text'].strip()}\n\n")

    print(f"SRT: {srt_path} ({len(result['segments'])} segments)")

    # Generate scenes grouped by ~8-10s
    scenes = []
    current_text = ''
    current_start = None
    scene_num = 1

    for seg in result['segments']:
        if current_start is None:
            current_start = seg['start']
        current_text += ' ' + seg['text'].strip()

        if seg['end'] - current_start >= 6:
            m1, s1 = int(current_start // 60), int(current_start % 60)
            m2, s2 = int(seg['end'] // 60), int(seg['end'] % 60)
            scenes.append(
                f'Cena {scene_num} ({m1}:{s1:02d}-{m2}:{s2:02d}): "{current_text.strip()}"'
            )
            scene_num += 1
            current_text = ''
            current_start = None

    if current_text.strip() and current_start is not None:
        m1, s1 = int(current_start // 60), int(current_start % 60)
        scenes.append(
            f'Cena {scene_num} ({m1}:{s1:02d}-fim): "{current_text.strip()}"'
        )

    scenes_path = os.path.join(output_dir, "cenas-minutagem.md")
    with open(scenes_path, 'w', encoding='utf-8') as f:
        f.write("# Cenas com Minutagem\n\n")
        f.write(f"Total: {len(scenes)} cenas\n\n")
        for s in scenes:
            f.write(s + '\n')

    print(f"Cenas: {scenes_path} ({len(scenes)} scenes)")


if __name__ == "__main__":
    main()
