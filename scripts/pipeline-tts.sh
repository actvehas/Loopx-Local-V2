#!/bin/bash
# Pipeline TTS completo: Qwen3-TTS (8-bit) + Whisper → cenas sincronizadas
# Uso: ./pipeline-tts.sh <numero> <roteiro.md> <voz> <output_dir>
# Exemplo: ./pipeline-tts.sh 16 roteiro.md E-female-es-01 ./output/

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
VOICE_REFS="$SCRIPT_DIR/voice-refs.json"
MODEL="mlx-community/Qwen3-TTS-12Hz-1.7B-Base-8bit"
SPEED=0.9

NUM="$1"
INPUT="$2"
VOICE="$3"
OUTPUT_DIR="$4"

if [ -z "$NUM" ] || [ -z "$INPUT" ] || [ -z "$VOICE" ] || [ -z "$OUTPUT_DIR" ]; then
    echo "Uso: ./pipeline-tts.sh <numero> <roteiro.md> <voz> <output_dir>"
    echo "Exemplo: ./pipeline-tts.sh 16 roteiro.md E-female-es-01 ./16-output/"
    exit 1
fi

mkdir -p "$OUTPUT_DIR"

echo "================================================"
echo "PIPELINE TTS — Roteiro $NUM"
echo "Voz: $VOICE | Modelo: 8-bit | Speed: $SPEED"
echo "================================================"

# Passo 1: Gerar áudio TTS
echo ""
echo "PASSO 1: QWEN3-TTS → ÁUDIO"
echo "------------------------------------------------"

python3 -c "
import json, sys, os
from mlx_audio.tts.generate import generate_audio

# Carregar voice refs
with open('$VOICE_REFS') as f:
    refs = json.load(f)

voice = refs.get('$VOICE')
if not voice:
    print(f'Voz $VOICE não encontrada')
    sys.exit(1)

# Carregar roteiro (limpar headers)
with open('$INPUT', 'r') as f:
    text = f.read()
lines = text.split('\n')
clean = [l for l in lines if not l.strip().startswith('Bloque ') and not l.strip().startswith('# ')]
text = '\n'.join(clean).strip()
words = len(text.split())
print(f'Texto: {words} palavras')

# Dividir em chunks de ~300 palavras (melhor qualidade)
word_list = text.split()
chunk_size = 300
chunks = []
for i in range(0, len(word_list), chunk_size):
    chunks.append(' '.join(word_list[i:i+chunk_size]))
print(f'Dividido em {len(chunks)} chunks')

# Gerar cada chunk
for i, chunk in enumerate(chunks):
    print(f'Chunk {i+1}/{len(chunks)}...')
    output = f'$OUTPUT_DIR/chunk_{i:03d}.wav'
    generate_audio(
        text=chunk,
        model='$MODEL',
        ref_audio=voice['audio_path'],
        ref_text=voice['ref_text'],
        lang_code='es',
        speed=$SPEED,
        output_path=output,
        verbose=False
    )

print('TTS completo')
"

if [ $? -ne 0 ]; then
    echo "❌ TTS falhou"
    exit 1
fi

# Passo 2: Concatenar chunks com FFmpeg
echo ""
echo "PASSO 2: CONCATENAR CHUNKS"
echo "------------------------------------------------"

# Criar lista de arquivos pra ffmpeg
> "$OUTPUT_DIR/filelist.txt"
for f in "$OUTPUT_DIR"/chunk_*/audio_000.wav; do
    echo "file '$f'" >> "$OUTPUT_DIR/filelist.txt"
done

ffmpeg -y -f concat -safe 0 -i "$OUTPUT_DIR/filelist.txt" -c copy "$OUTPUT_DIR/audio-completo.wav" 2>/dev/null

if [ -f "$OUTPUT_DIR/audio-completo.wav" ]; then
    DURATION=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$OUTPUT_DIR/audio-completo.wav" 2>/dev/null)
    echo "✅ Áudio completo: $OUTPUT_DIR/audio-completo.wav (${DURATION}s)"
else
    echo "❌ Falha ao concatenar"
    exit 1
fi

# Passo 3: Whisper → timestamps
echo ""
echo "PASSO 3: WHISPER → TIMESTAMPS"
echo "------------------------------------------------"

python3 -c "
import whisper
model = whisper.load_model('base')
result = model.transcribe('$OUTPUT_DIR/audio-completo.wav', language='es')

# Gerar SRT
with open('$OUTPUT_DIR/audio.srt', 'w') as f:
    for i, seg in enumerate(result['segments'], 1):
        start = seg['start']
        end = seg['end']
        sh, sm, ss = int(start//3600), int((start%3600)//60), start%60
        eh, em, es_ = int(end//3600), int((end%3600)//60), end%60
        f.write(f'{i}\n')
        f.write(f'{sh:02d}:{sm:02d}:{ss:06.3f}'.replace('.',','))
        f.write(f' --> ')
        f.write(f'{eh:02d}:{em:02d}:{es_:06.3f}'.replace('.',','))
        f.write(f'\n{seg[\"text\"].strip()}\n\n')

# Gerar cenas agrupadas (~6-8s cada, ideal 8s)
scenes = []
current_text = ''
current_start = None
scene_num = 1
for seg in result['segments']:
    if current_start is None:
        current_start = seg['start']
    current_text += ' ' + seg['text'].strip()
    if seg['end'] - current_start >= 6:
        m1, s1 = int(current_start//60), int(current_start%60)
        m2, s2 = int(seg['end']//60), int(seg['end']%60)
        scenes.append(f'Cena {scene_num} ({m1}:{s1:02d}-{m2}:{s2:02d}): \"{current_text.strip()}\"')
        scene_num += 1
        current_text = ''
        current_start = None
if current_text.strip():
    m1, s1 = int(current_start//60), int(current_start%60)
    scenes.append(f'Cena {scene_num} ({m1}:{s1:02d}-fim): \"{current_text.strip()}\"')

with open('$OUTPUT_DIR/cenas-minutagem.md', 'w') as f:
    f.write('# Cenas com Minutagem\n\n')
    f.write(f'Total: {len(scenes)} cenas\n\n')
    for s in scenes:
        f.write(s + '\n')

print(f'✅ SRT: $OUTPUT_DIR/audio.srt')
print(f'✅ Cenas: $OUTPUT_DIR/cenas-minutagem.md ({len(scenes)} cenas)')
"

echo ""
echo "================================================"
echo "✅ PIPELINE COMPLETO — Roteiro $NUM"
echo "  Áudio: $OUTPUT_DIR/audio-completo.wav"
echo "  SRT: $OUTPUT_DIR/audio.srt"
echo "  Cenas: $OUTPUT_DIR/cenas-minutagem.md"
echo "  Próximo: /sincronizador com roteiro + cenas"
echo "================================================"
