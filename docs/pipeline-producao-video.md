# Pipeline de Produção de Vídeos — Template Universal

Atualizado: 2026-03-20

> Template genérico para qualquer canal/nicho. Copiar para `Projetos/{Nome do Canal}/Pipeline.md` e preencher as variáveis `{CANAL}`, `{GERENTE}`, etc.

---

## Pipeline completo (7 fases)

```
MAC M3 (IA + automação):
  Fase 0: /titulo-pipeline → títulos otimizados (1x por canal novo)
  Fase 1: /{GERENTE} → roteiro + thumb + desc + README (8 ficheiros)
  Fase 2: tts-full.py → Qwen3-TTS (MLX) → audio.wav + Whisper → SRT + cenas
  Fase 3: /sincronizador → prompts VEO 3.1 sincronizados com narração
  Fase 4: veo3-generator.js (Puppeteer) → Google Labs Flow → Cenas/
  Fase 6: thumb.md → gerar thumbnail

HETZNER 65.109.85.250 (montagem):
  Fase 5: Remotion → composição → FFmpeg pós-processamento → final.mp4

YOUTUBE:
  Fase 7: Upload (manual ou API)
```

---

## Variáveis por canal

| Variável | Descrição | Exemplo |
|----------|-----------|---------|
| `{CANAL}` | Código do canal (letra) | E, F, G... |
| `{GERENTE}` | Skill do gerente (`/gerenteX`) | gerenteE, gerenteF |
| `{HANDLE}` | Handle YouTube | @ConfesionesdelasAbuelas |
| `{IDIOMA}` | Idioma do conteúdo | es (espanhol), pt (português) |
| `{VOZES}` | Prefixo das vozes TTS | E-female-es, F-male-pt |
| `{MIX_VISUAL}` | Proporção vídeo/imagem | 70% imagem + 30% vídeo |
| `{FLOW_PROJECT}` | ID do projeto no Google Labs Flow | uuid do projeto |

---

## Detalhe por fase

### Fase 0: Onboarding do Canal (1x por canal novo)

**Objetivo**: Pesquisar nicho, gerar títulos, criar skill do gerente.

1. Escolher canal de referência no YouTube
2. `/analista-titulos` — **ANALISTA** (diagnostica, não cria):
   - Analisa canal de referência (títulos, views, estruturas)
   - Extrai: gatilhos emocionais, topic clusters, saturação do nicho
   - Identifica gaps de mercado e oportunidades
   - Produz BRIEFING estruturado (não títulos)
   - Base: NLP do YouTube (BERT), dados de ~1.000 títulos virais
3. `/criador-titulos` — **CRIADOR** (gera, não analisa):
   - Recebe briefing do Analista
   - Gera 20 títulos com 3 métodos:
     - **Variação**: mesmo subnicho, trocar estrutura e palavras
     - **Subnichar**: adicionar qualificador único (geográfico, temporal, emocional)
     - **Título do zero**: mesmo conceito emocional, estrutura nova
   - Usa 5 frameworks: Curiosity Gap, Open Loop, Contraste, Especificidade, Social Proof
   - Ranking final por potencial
4. `/titulo-pipeline` — **ORQUESTRADOR** (coordena os dois):
   - Fase 1: Roda Analista → briefing
   - Fase 2: Debate interno (valida dados antes de passar)
   - Fase 3: Roda Criador → 20 títulos
   - Fase 4: Revisão cruzada (Analista revisa títulos do Criador)
   - Output: top 10 títulos aprovados + plano de ação
5. Criar skill `/{GERENTE}` com identidade completa do canal:
   - Nicho/subnicho, vocabulário, personagens típicos
   - Estrutura narrativa, regras de thumbnail
   - Template: baseado nos gerentes existentes (`gerenteE.md`, `gerenteF.md`)
6. Definir vozes TTS: gravar/escolher referências, transcrever ref_text via Whisper
   - Adicionar ao `voice-refs.json`
7. Definir mix visual (% vídeo vs imagem) em `config/channels.json`
8. Criar estrutura no Obsidian:
   ```
   Projetos/{Nome do Canal}/
   ├── Contexto Canal {CANAL}.md
   ├── Titulos.md
   ├── Framework Roteiros.md
   ├── Nomes e Locais Usados.md
   ├── Pipeline.md (cópia deste template)
   └── Thumbs/
   ```

### Fase 1: Roteiro

**Input**: `/{GERENTE}`
**Output**: 8 ficheiros em `NN - TITULO/`

| Ficheiro | Conteúdo |
|----------|----------|
| `roteiro.md` | História completa, ~17K palavras, 1ª pessoa |
| `avatar.md` | Descrição do avatar/narrador |
| `nano.md` | Versão curta pra shorts |
| `veo3.md` | Notas visuais pra prompts |
| `thumb.md` | Prompt da thumbnail |
| `desc.md` | Descrição YouTube + hashtags |
| `README.md` | Índice do episódio + checklist |

Atualiza: `Nomes e Locais Usados.md` + checkbox em `Titulos.md`

### Fase 2: TTS + Whisper

**Script**: `~/Documents/YOUTUBE/scripts/tts-full.py`

```bash
python3 tts-full.py --num {NN} --voice {VOZ}
```

**Config TTS**:
- Modelo: `Qwen3-TTS-12Hz-1.7B-Base-8bit` via MLX (Apple Silicon)
- Vozes: definidas em `voice-refs.json` (8 por idioma)
- ref_text: transcrição REAL dos áudios de referência (via Whisper) — evita gaguejo
- Speed: 0.9

**Processo automático**:
1. Divide roteiro em chunks de ~300 palavras
2. Qwen3-TTS gera áudio por chunk
3. FFmpeg concatena → `audio.wav`
4. Whisper transcreve → `audio.srt`
5. Agrupa segmentos em cenas de ~8-12s → `cenas-minutagem.md`

**Output**: `audio.wav`, `audio.srt`, `cenas-minutagem.md`
**Tempo**: ~30-60 min no M3

### Fase 3: Sincronizador

**Skill**: `/sincronizador`

```
/sincronizador
# Fornecer: canal ({CANAL}) + roteiro + cenas-minutagem.md
```

**Processo**:
1. Identifica personagens → fichas (Personagem001, 002...)
2. Converte cada cena em prompt VEO 3.1 cinematográfico
3. Descrição física COMPLETA em toda aparição (VEO sem memória)

**Regras dos prompts**:
- `No Blood`, `No Nudity`, `Silent` (sem trigger de áudio)
- Movimento obrigatório (VEO gera vídeo, não foto)
- Variar tipos de plano (nunca 5x medium shot seguidos)

**Output**: `prompts-veo3.md` (~600 prompts, 1 por cena)

### Fase 4: Geração Visual

**Script**: `~/Documents/LoopX-Local/scripts/veo3-generator.js`

```bash
# 1. Abrir Chrome com debug port
killall "Google Chrome"
TEMP_DIR="/tmp/chrome-veo3"
rm -rf "$TEMP_DIR" && mkdir -p "$TEMP_DIR/Profile 7"
cp -R "$HOME/Library/Application Support/Google/Chrome/Profile 7/"* "$TEMP_DIR/Profile 7/"
cp "$HOME/Library/Application Support/Google/Chrome/Local State" "$TEMP_DIR/"
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --user-data-dir="$TEMP_DIR" --profile-directory="Profile 7" \
  --remote-debugging-port=9222 "https://labs.google/fx/tools/flow" &

# 2. Configurar no Flow: modo Imagem ou Vídeo, modelo, aspect ratio

# 3. Submeter prompts (12s entre cada)
cd ~/Documents/LoopX-Local
node scripts/veo3-generator.js "caminho/prompts-veo3.md" \
  --start 1 --end 608 --batch 1 \
  --output "caminho/Cenas"

# 4. Baixar via API (após geração)
# O script usa tRPC API: flow.projectInitialData → getMediaUrlRedirect
```

**Config Google Labs Flow**:
- Imagem: Nano Banana 2, 16:9, x1
- Vídeo: Veo 3.1 - Fast [Lower Priority], 16:9, x1

**Regras**:
- Ficheiros com `(1)` no nome são duplicatas → ignorar
- Download via tRPC API (não DOM scraping — virtual scroll não carrega tudo)
- Chrome Profile 7 = conta com acesso ao Flow

**Output**: `Cenas/` com N ficheiros (.mp4 + .jpg)

### Fase 5: Montagem (Hetzner)

**Projeto**: `/root/loopx-local/remotion/`

#### Passo 1 — Upload assets
```bash
EPISODE="caminho/para/NN - TITULO/"
rsync -avz "$EPISODE/audio.wav" "$EPISODE/audio.srt" "$EPISODE/cenas-minutagem.md" \
  root@65.109.85.250:/root/loopx-local/jobs/{CANAL}/{NN}/
rsync -avz "$EPISODE/Cenas/" \
  root@65.109.85.250:/root/loopx-local/jobs/{CANAL}/{NN}/Cenas/
```

#### Passo 2 — Bounce videos (forward+reverse)
```bash
ssh root@65.109.85.250 "cd /root/loopx-local/jobs/{CANAL}/{NN}/Cenas && \
  mkdir -p ../Cenas-bounced && \
  for f in *.mp4; do ffmpeg -y -i \"\$f\" -filter_complex \
  '[0:v]split[fwd][rev];[rev]reverse[reversed];[fwd][reversed]concat=n=2:v=1:a=0' \
  -an -c:v libx264 -preset fast -crf 18 \"../Cenas-bounced/\$f\" 2>/dev/null; done"
```

#### Passo 3 — Render Remotion
```bash
# Teste (30 segundos)
ssh root@65.109.85.250 "cd /root/loopx-local/remotion && \
  node render.mjs --jobs /root/loopx-local/jobs/{CANAL}/{NN} \
  --frames 0-900 --output /root/loopx-local/jobs/{CANAL}/{NN}/test.mp4 --concurrency 2"

# Render completo (3-6h)
ssh root@65.109.85.250 "cd /root/loopx-local/remotion && \
  nohup node render.mjs --jobs /root/loopx-local/jobs/{CANAL}/{NN} --concurrency 2 \
  > /root/loopx-local/jobs/{CANAL}/{NN}/render.log 2>&1 &"

# Monitorar
ssh root@65.109.85.250 "tail -f /root/loopx-local/jobs/{CANAL}/{NN}/render.log"
```

#### Passo 4 — Pós-processamento (vintage + vinheta)
```bash
ssh root@65.109.85.250 "ffmpeg -y -i /root/loopx-local/jobs/{CANAL}/{NN}/raw.mp4 \
  -vf 'colorbalance=rs=0.05:gs=-0.02:bs=-0.08,vignette=PI/4' \
  -c:v libx264 -preset medium -crf 18 -c:a copy -movflags +faststart \
  /root/loopx-local/jobs/{CANAL}/{NN}/final.mp4"
```

#### Passo 5 — Download
```bash
rsync root@65.109.85.250:/root/loopx-local/jobs/{CANAL}/{NN}/final.mp4 ~/Downloads/
```

### Fase 6: Thumbnail
- Prompt em `thumb.md` (gerado na Fase 1 pelo `/{GERENTE}`)
- Gerar manualmente (Ideogram, Grok, ou outro)

### Fase 7: Upload YouTube
- Manual por agora
- Futuro: YouTube API v3 automatizado

---

## Componentes Remotion (Hetzner)

| Componente | Função |
|-----------|--------|
| `SceneImage.tsx` | Ken Burns (zoom 1.05-1.10x, pan 3-7%, transform-origin, linear) |
| `SceneVideo.tsx` | `OffthreadVideo` (FFmpeg decode) + Loop com bounce |
| `KaraokeSubtitle.tsx` | Highlight word branco→dourado, syllable-weighted, 150ms floor |
| `prepare-props.js` | Gera inputProps JSON (scenes + subtitles) |
| `render.mjs` | Render programático via API (props grandes demais pro CLI) |

---

## Regras técnicas obrigatórias

| Regra | Por quê |
|-------|---------|
| `--gl=swiftshader` no render | Hetzner sem GPU |
| `OffthreadVideo` em vez de `Video` | Browser decoder trava em headless |
| Frames absolutos (`Math.round(startSec * 30)`) | Previne drift de áudio em vídeos longos |
| Bounce (forward+reverse) nos mp4 | Evita congelar no último frame |
| Ignorar ficheiros com `(1)` | São duplicatas de re-download |
| ref_text via Whisper (não inventar) | Previne gaguejo no TTS |

---

## Specs das máquinas

| Máquina | Specs | Função |
|---------|-------|--------|
| Mac M3 | Apple Silicon, 18GB RAM | TTS, Whisper, prompts, geração visual |
| Hetzner | 65.109.85.250, Ryzen 5, 64GB RAM, sem GPU, 461GB disco | Montagem Remotion + FFmpeg |

---

## Ferramentas

| Ferramenta | Função | Localização |
|-----------|--------|-------------|
| Qwen3-TTS (MLX) | TTS local Apple Silicon | `~/Documents/YOUTUBE/scripts/tts-full.py` |
| voice-refs.json | Vozes clonadas + ref_text | `~/Documents/YOUTUBE/scripts/voice-refs.json` |
| Whisper | Transcrição + timestamps | `pip install openai-whisper` |
| `/sincronizador` | Prompts VEO sincronizados | `~/.claude/commands/sincronizador.md` |
| `/{GERENTE}` | Gerente do canal | `~/.claude/commands/{GERENTE}.md` |
| veo3-generator.js | Automação Flow (Puppeteer) | `~/Documents/LoopX-Local/scripts/` |
| Remotion | Composição de vídeo | `/root/loopx-local/remotion/` (Hetzner) |
| FFmpeg | Bounce + pós-processamento | Hetzner + Mac (sistema) |

---

## Estrutura de pastas (por episódio no vault)

```
Projetos/{Nome do Canal}/
├── Contexto Canal {CANAL}.md    ← Fase 0
├── Titulos.md                   ← Fase 0
├── Framework Roteiros.md        ← Fase 0
├── Nomes e Locais Usados.md     ← Fase 0
├── Pipeline.md                  ← Cópia deste template
└── NN - TITULO/
    ├── roteiro.md               ← Fase 1
    ├── avatar.md                ← Fase 1
    ├── nano.md                  ← Fase 1
    ├── veo3.md                  ← Fase 1
    ├── thumb.md                 ← Fase 1
    ├── thumb-image.png          ← Fase 6
    ├── desc.md                  ← Fase 1
    ├── README.md                ← Fase 1
    ├── audio.wav                ← Fase 2
    ├── audio.srt                ← Fase 2
    ├── cenas-minutagem.md       ← Fase 2
    ├── prompts-veo3.md          ← Fase 3
    ├── Cenas/                   ← Fase 4
    └── final.mp4                ← Fase 5
```

---

## Checklist rápido por episódio

- [ ] Fase 1: `/{GERENTE}` → 8 ficheiros criados
- [ ] Fase 2: `tts-full.py` → audio.wav + SRT + cenas-minutagem
- [ ] Fase 3: `/sincronizador` → prompts-veo3.md
- [ ] Fase 4: `veo3-generator.js` → Cenas/ completas
- [ ] Fase 5: rsync → bounce → Remotion render → FFmpeg → final.mp4
- [ ] Fase 6: Thumbnail gerada
- [ ] Fase 7: Upload YouTube

#pipeline #template #producao #playbook
