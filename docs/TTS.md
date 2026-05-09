# TTS — Text-to-Speech

## Modelo

**Qwen3-TTS-12Hz-1.7B** (8-bit quantizado)
- Modelo open-source da Qwen para geração de voz
- Suporta espanhol nativo (código: `es`)
- Voice cloning via áudio de referência + transcrição

## Configuração

Ficheiro: `config/default.json`

```json
{
  "tts": {
    "model": "Qwen3-TTS-12Hz-1.7B-Base-8bit",
    "speed": 0.9,
    "chunk_words": 300,
    "language": "es"
  }
}
```

| Parâmetro | Valor | Explicação |
|-----------|-------|------------|
| `speed` | 0.9 | Mais natural, sem atropelar palavras |
| `chunk_words` | 300 | Palavras por chunk (mais = menos cortes, menos qualidade) |
| `language` | es | Espanhol |

## Plataformas

### Mac (Apple Silicon — M1/M2/M3/M4)

Usa **MLX** (framework otimizado pra Apple Silicon):
```bash
pip install mlx-audio
```
- Modelo: `mlx-community/Qwen3-TTS-12Hz-1.7B-Base-8bit`
- ~4GB RAM, roda sem GPU dedicada
- Script: `scripts/pipeline-tts.sh`

### Windows (NVIDIA GPU)

Usa **PyTorch + CUDA**:
```powershell
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121
pip install transformers accelerate soundfile numpy
```
- Modelo: `Qwen/Qwen3-TTS-12Hz-1.7B`
- ~4GB VRAM (RTX 2070 8GB = tranquilo)
- Script: `scripts/pipeline-tts.bat`

Verificar CUDA:
```powershell
python -c "import torch; print(f'CUDA: {torch.cuda.is_available()}, GPU: {torch.cuda.get_device_name(0)}')"
```

## Vozes

As vozes ficam em `config/voices/` (8 WAVs de referência) + `config/voice-refs.json` (mapeamento).

### Vozes disponíveis

| Voice ID | Estilo | Usado em |
|----------|--------|----------|
| `E-female-es-01` | Feminina madura, tom confessional | Roteiros 16, 24 |
| `E-female-es-02` | Feminina suave, tom emocional | Roteiros 17, 25 |
| `E-female-es-03` | Feminina firme, tom narrativo | Roteiro 18 |
| `E-female-es-04` | Feminina calorosa, tom íntimo | Roteiro 19 |
| `E-female-es-05` | Feminina clara, tom dramático | Roteiro 20 |
| `E-female-es-06` | Feminina grave, tom sério | Roteiro 21 |
| `E-female-es-07` | Feminina expressiva, tom picante | Roteiro 22 |
| `E-female-es-08` | Feminina terna, tom nostálgico | Roteiro 23 |

### Como funciona o voice cloning

Cada voz tem dois componentes:
1. **audio_path** — WAV de referência (~10s de áudio da voz desejada)
2. **ref_text** — Transcrição REAL do áudio de referência (via Whisper)

O modelo clona o timbre, ritmo e entonação do áudio de referência.

**IMPORTANTE:** O `ref_text` deve ser a transcrição REAL do áudio, não texto inventado. Transcrição errada causa gaguejar e artefatos.

### Adicionar uma voz nova

1. Gravar ou selecionar um áudio de ~10s com a voz desejada
2. Transcrever com Whisper:
   ```bash
   whisper referencia.wav --model base --language es
   ```
3. Salvar o WAV em `config/voices/NOME.wav`
4. Adicionar ao `config/voice-refs.json`:
   ```json
   "NOME": {
     "audio_path": "config/voices/NOME.wav",
     "ref_text": "transcrição real do áudio aqui"
   }
   ```

### Rotação de vozes

Cada episódio usa uma voz DIFERENTE (nunca 2 seguidos com a mesma).
Rotação circular: 01 → 02 → 03 → ... → 08 → 01.

O mapeamento por episódio:
```
Roteiro 16: E-female-es-01
Roteiro 17: E-female-es-02
Roteiro 18: E-female-es-03
Roteiro 19: E-female-es-04
Roteiro 20: E-female-es-05
Roteiro 21: E-female-es-06
Roteiro 22: E-female-es-07
Roteiro 23: E-female-es-08
Roteiro 24: E-female-es-01 (recomeça)
Roteiro 25: E-female-es-02
```

## Pipeline completo

```
roteiro.md
  ↓ Qwen3-TTS (chunks de 300 palavras)
chunk_000.wav, chunk_001.wav, ...
  ↓ FFmpeg concat
audio-completo.wav (~45-90 min)
  ↓ Whisper
audio.srt (legendas timestamped)
  ↓ Agrupamento 8-10s
cenas-minutagem.md (~600 cenas)
```

Tempo total: ~30-60 min no Mac M3, similar no Windows com RTX 2070.
