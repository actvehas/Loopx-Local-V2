# LoopX Local V2

Pipeline de produção de vídeos YouTube, cross-platform (Mac + Windows).

Assets vivem no Obsidian vault. Montagem pesada roda na Hetzner.

---

## ✨ Novidades do V2

- **Narrative Forge integrada** — DNA + history por canal, anti-repetição obrigatória de arcos narrativos (`docs/FORGE.md`).
- **Comando único `/proximo-{x}`** — orquestra Fase 1→3 automático, pausa visual antes da Fase 4, retoma Fase 4→5 até `final.mp4`. Auto-mode em todas as skills (`docs/AUTOMATION.md`).
- **Pipeline Status Dataview** — `Pipeline-Status.md` no vault renderiza board ao vivo do estado de todos os EPs em todos os canais (`docs/PIPELINE-STATUS.md`).
- **Auto-marking de `Titulos.md`** — `[ ]` → `[⏳]` → `[x]` atualizado por `update-titulos.sh` em cada transição de fase.
- **Buckets de duração controlados** — `curto/medio/longo/maraton` mapeados a palavras→cenas→custo Flow.
- **Bugs Fase 4 fixados** — `Meta+A` cross-platform, tRPC log de schema, scroll dedup por URL, `stillMissing` correto.
- **Estrutura padronizada** — código no repo, conteúdo no Obsidian, jobs no Hetzner (`docs/STRUCTURE.md`).

---

## Pipeline de 6 Fases (0 a 5)

### Fase 0 — Onboarding do Canal (1x por canal novo)

Esta fase é feita **uma única vez** quando se cria um canal novo. É o trabalho de pesquisa e configuração que define a identidade do canal.

**O que acontece:**

1. **Pesquisa de referência** — Escolher um canal YouTube de sucesso no nicho desejado. Analisar 10-20 títulos com views, identificar estruturas vencedoras, gatilhos emocionais e gaps de mercado.
   - Ferramenta: `/analista-titulos` (skill Claude Code)
   - Output: Briefing com estruturas, saturação, oportunidades

2. **Geração de títulos** — Com base no briefing, gerar 20 títulos otimizados usando 3 métodos (variação, subnicho, título do zero).
   - Ferramenta: `/criador-titulos` (skill Claude Code)
   - Output: 20 títulos rankeados por potencial

3. **Validação cruzada** — O orquestrador roda analista + criador em sequência, valida restrições e entrega o ranking final.
   - Ferramenta: `/titulo-pipeline` (skill Claude Code)
   - Output: Top 5-10 títulos aprovados pra começar

4. **Criação da skill do gerente** — Criar o `/gerenteX` (ex: `/gerenteE`, `/gerenteF`) com toda a identidade do canal:
   - Nicho e subnicho (urbano, rural, etc.)
   - Vocabulário permitido e proibido
   - Personagens típicos (profissões, idades)
   - Estrutura narrativa (quantos blocos, palavras por bloco)
   - Regras de thumbnail (templates, cores, fonte)
   - Zona dourada de títulos (fórmulas, defesa plausível)
   - Cenários e ambientação
   - Diferenciação de outros canais
   - Template: baseado nos gerentes existentes (`gerenteE.md`, `gerenteF.md`)

5. **Mix visual (vídeo vs imagem)** — Definir a proporção de cenas em vídeo e em imagem para o canal.
   - Exemplo: 70% vídeo + 30% imagem, ou 100% vídeo
   - Vídeos dão mais imersão mas são mais lentos de gerar
   - Imagens (Ken Burns pan/zoom) são rápidas e mantêm consistência visual
   - O sincronizador usa esta proporção pra gerar prompts de cada tipo
   - Personagens devem ter a **mesma descrição física** em vídeo e imagem pra manter consistência
   - Configurar em `config/channels.json`

6. **Definição de vozes** — Selecionar ou clonar vozes TTS para o canal.
   - Gravar ou escolher áudios de referência
   - Transcrever ref_text real via Whisper
   - Adicionar ao `config/voice-refs.json`

7. **Estrutura no Obsidian** — Criar pasta do canal no vault:
   ```
   Projetos/{Nome do Canal}/
   ├── Contexto Canal X.md    (dados do canal)
   ├── Titulos.md             (lista com checklist)
   ├── Framework Roteiros.md  (regras de roteiro)
   ├── Nomes e Locais Usados.md (anti-repetição)
   └── Thumbs/                (referências visuais)
   ```

---

### Fase 1 — Roteiro

Geração do roteiro completo e todos os ficheiros auxiliares para um episódio.

**O que acontece:**
1. Invocar `/gerenteX` no Claude Code
2. Claude lê referências do canal, framework de roteiros, nomes já usados
3. Gera 4 ficheiros na pasta `NN - TITULO/`:

| Ficheiro | Conteúdo |
|----------|----------|
| `roteiro.md` | História completa, 10-12 blocos, ~17K palavras, 1ª pessoa |
| `thumb.md` | Prompt da thumbnail + texto 3 cores + layout |
| `desc.md` | Descrição YouTube (3-5 linhas + hashtags) |
| `README.md` | Índice do episódio (personagens, locais, arco, checklist) |

4. Atualiza `Nomes e Locais Usados.md` (anti-repetição)
5. Marca checkbox em `Titulos.md`

**Ferramenta:** Claude Code + skill `/gerenteX`
**Tempo:** ~10-15 min
**Plataforma:** Mac ou Windows

---

### Fase 2 — TTS + Whisper (Áudio)

Conversão do roteiro em áudio narrado + transcrição com timestamps.

**O que acontece:**
1. Script lê o `roteiro.md` e divide em chunks de ~300 palavras
2. Qwen3-TTS gera áudio de cada chunk com a voz selecionada
3. FFmpeg concatena todos os chunks → `audio.wav` (~45-90 min de áudio)
4. Whisper transcreve → `audio.srt` (legendas com timestamps)
5. Agrupa segmentos em cenas de ~6-8s → `cenas-minutagem.md`

**Comando:**
```bash
# Mac
./scripts/pipeline-tts.sh 16 roteiro.md E-female-es-01 ./output/

# Windows
.\scripts\pipeline-tts.bat 16 roteiro.md E-female-es-01 .\output\
```

**Output:** `audio.wav`, `audio.srt`, `cenas-minutagem.md`
**Tempo:** ~30-60 min
**Plataforma:**
- Mac: Qwen3-TTS via MLX (Apple Silicon nativo)
- Windows: Qwen3-TTS via PyTorch + CUDA (RTX 2070)

---

### Fase 3 — Sincronizador (Prompts VEO 3.1)

Conversão das cenas narradas em prompts cinematográficos para geração de vídeo.

**O que acontece:**
1. Invocar `/sincronizador` no Claude Code
2. Fornecer: roteiro + cenas-minutagem + canal (E/F/X)
3. Claude identifica TODOS os personagens e cria fichas (Personagem001, 002...)
4. Cada cena vira um prompt VEO 3.1 com:
   - Descrição física COMPLETA de cada personagem (VEO não tem memória)
   - Tipo de plano variado (wide, close-up, tracking, etc.)
   - Iluminação + atmosfera + elementos ambientais
   - Ação em movimento (nunca estático)
   - Tags obrigatórias: No Blood, No Nudity, No Dialogue, No Music

**Output:** `prompts-veo3.md` (~600 prompts, 1 por cena)
**Tempo:** ~15-30 min
**Plataforma:** Mac ou Windows (Claude Code)

---

### Fase 4 — Geração Visual (Vídeos)

Geração dos vídeos de cada cena usando Google Labs Flow via Puppeteer (automático).

**O que acontece:**
1. Script abre Chrome com profile logado no Google
2. Navega para Google Labs Flow
3. Submete prompts em lotes (4 por vez)
4. Aguarda geração, baixa vídeos automaticamente → pasta `Cenas/`
5. Retry automático de prompts que falharem
6. Pula cenas que já existem na pasta

**Comando:**
```bash
# Todas as cenas
node scripts/veo3-generator.js prompts-veo3.md --output ./Cenas

# Batch específico (cenas 1-100)
node scripts/veo3-generator.js prompts-veo3.md --start 1 --end 100 --output ./Cenas

# Dry run (mostra prompts sem gerar)
node scripts/veo3-generator.js prompts-veo3.md --dry-run

# Batch size customizado
node scripts/veo3-generator.js prompts-veo3.md --batch 8
```

**Output:** `Cenas/*.mp4` (~600 vídeos de ~6-8s cada)
**Tempo:** ~2-5 min por vídeo (paralelo, limite diário do Google Labs)
**Plataforma:** Mac ou Windows (Chrome instalado + Node.js)

---

### Fase 5 — Montagem (Hetzner)

Envio dos assets para o servidor Hetzner e montagem do vídeo final.

**O que acontece:**
1. Script envia via rsync/scp: `Cenas/*.mp4` + `audio.wav` + `audio.srt` → Hetzner
2. Hetzner executa a montagem FFmpeg:
   - Concatena vídeos na ordem das cenas
   - Injeta áudio narrado como trilha principal
   - Gera legendas hardcoded (estilo Hormozi)
   - Crossfade de 0.6s entre clips
   - Remoção de silêncio (-40dB)
   - Avatar intercalado (se o canal tiver)
   - H264, CRF 18, faststart
3. Upload automático do `final.mp4` → Cloudflare R2
4. Download do vídeo final pro vault local

**Comando:**
```bash
# Mac
./scripts/assemble.sh E 16
./scripts/download.sh E 16

# Windows
.\scripts\assemble.bat E 16
```

**Output:** `final.mp4` (no R2 + download local)
**Tempo:** ~10-30 min
**Servidor:** Hetzner 65.109.85.250 (Ryzen 5, 64GB RAM, Ubuntu 24.04)

---

## Setup

### Mac (Apple Silicon)
```bash
./scripts/setup-mac.sh
```

### Windows (NVIDIA GPU)
```powershell
PowerShell -ExecutionPolicy Bypass -File .\scripts\setup-windows.ps1
```

## Estrutura de pastas (Obsidian vault)

```
Projetos/{Canal}/
├── Contexto Canal X.md
├── Titulos.md
├── Framework Roteiros.md
├── Nomes e Locais Usados.md
├── Thumbs/
└── NN - TITULO/
    ├── roteiro.md          ← Fase 1
    ├── thumb.md            ← Fase 1 / Fase 6
    ├── desc.md             ← Fase 1
    ├── README.md           ← Fase 1
    ├── audio.wav           ← Fase 2
    ├── audio.srt           ← Fase 2
    ├── cenas-minutagem.md  ← Fase 2
    ├── prompts-veo3.md     ← Fase 3
    ├── Cenas/              ← Fase 4
    │   ├── (Cena_001)[...].mp4
    │   └── ...
    └── final.mp4           ← Fase 5
```

## Requisitos

| Software | Mac | Windows | Pra quê |
|----------|-----|---------|---------|
| Git | sim | sim | Clonar repo, SSH |
| Node.js 20+ | sim | sim | Claude Code CLI |
| Python 3.10+ | sim | sim | TTS, Whisper |
| FFmpeg | sim | sim | Concatenar áudio, processar vídeo |
| Whisper | `pip install openai-whisper` | `pip install openai-whisper` | Transcrição → SRT + cenas |
| TTS | MLX (`pip install mlx-audio`) | PyTorch+CUDA (`pip install torch --index-url ...cu121`) | Qwen3-TTS local |
| Chrome | sim | sim | Google Labs Flow (Fase 4) |
| Claude Code | `npm i -g @anthropic-ai/claude-code` | `npm i -g @anthropic-ai/claude-code` | Skills (Fases 0-3) |
| Obsidian | sim | sim | Vault local (filesystem dos projetos) |
| VS Code | opcional | sim | Editor + Pixel Agents |
| SSH key | pra Hetzner + GitHub | pra Hetzner + GitHub | Acesso ao servidor e ao repo privado |

Setup completo: ver `docs/SETUP-WINDOWS-CHECKLIST.md`
