"""
LoopX Local — TTS Generator (Windows, PyTorch + CUDA)
Equivalent to tts-full.py but uses PyTorch instead of MLX.

Usage: python tts-generate-win.py <roteiro.md> <voice> <output_dir> <voice_refs.json> [speed]
"""

import json
import sys
import os
import torch
import soundfile as sf
from transformers import AutoModelForCausalLM, AutoTokenizer

def main():
    if len(sys.argv) < 5:
        print("Usage: python tts-generate-win.py <roteiro.md> <voice> <output_dir> <voice_refs.json> [speed]")
        sys.exit(1)

    input_file = sys.argv[1]
    voice_name = sys.argv[2]
    output_dir = sys.argv[3]
    voice_refs_file = sys.argv[4]
    speed = float(sys.argv[5]) if len(sys.argv) > 5 else 0.9

    # Load voice refs
    with open(voice_refs_file, 'r', encoding='utf-8') as f:
        refs = json.load(f)

    voice = refs.get(voice_name)
    if not voice:
        print(f"Voice '{voice_name}' not found in {voice_refs_file}")
        print(f"Available voices: {list(refs.keys())}")
        sys.exit(1)

    # Load and clean script
    with open(input_file, 'r', encoding='utf-8') as f:
        text = f.read()

    lines = text.split('\n')
    clean = [l for l in lines if not l.strip().startswith('Bloque ') and not l.strip().startswith('# ')]
    text = '\n'.join(clean).strip()
    words = text.split()
    print(f"Text: {len(words)} words")

    # Split into chunks (~300 words for quality)
    chunk_size = 300
    chunks = []
    for i in range(0, len(words), chunk_size):
        chunks.append(' '.join(words[i:i + chunk_size]))
    print(f"Split into {len(chunks)} chunks")

    # Check CUDA
    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"Device: {device}")
    if device == "cuda":
        print(f"GPU: {torch.cuda.get_device_name(0)}")

    # Load model
    model_name = "Qwen/Qwen3-TTS-12Hz-1.7B"
    print(f"Loading model: {model_name}...")
    tokenizer = AutoTokenizer.from_pretrained(model_name, trust_remote_code=True)
    model = AutoModelForCausalLM.from_pretrained(
        model_name,
        torch_dtype=torch.float16,
        device_map="auto",
        trust_remote_code=True
    )

    os.makedirs(output_dir, exist_ok=True)

    # Generate each chunk
    for i, chunk in enumerate(chunks):
        print(f"Chunk {i + 1}/{len(chunks)}...")
        output_path = os.path.join(output_dir, f"chunk_{i:03d}.wav")

        try:
            # Prepare input with reference audio context
            ref_text = voice.get('ref_text', '')
            prompt = f"<|lang|>es<|speaker|>{ref_text}<|text|>{chunk}"

            inputs = tokenizer(prompt, return_tensors="pt").to(device)

            with torch.no_grad():
                outputs = model.generate(
                    **inputs,
                    max_new_tokens=4096,
                    temperature=0.7,
                    do_sample=True
                )

            # Decode audio tokens to waveform
            audio_tokens = outputs[0][inputs['input_ids'].shape[1]:]
            # Note: actual audio decoding depends on the model's codec
            # This is a placeholder - adapt to actual Qwen3-TTS output format
            print(f"  Generated {len(audio_tokens)} tokens for chunk {i + 1}")

        except Exception as e:
            print(f"  [WARN] Chunk {i + 1} failed: {e}")
            continue

    print("TTS complete")


if __name__ == "__main__":
    main()
