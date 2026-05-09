#!/bin/bash
# Pipeline completo — do roteiro ao vídeo final (100% automático)
# Uso: ./pipeline-full.sh CANAL NUM [TITULO]
# Exemplo: ./pipeline-full.sh E 18 "TENGO 73 Y UN MUCHACHO DE 28 ME PUSO BOCA ABAJO"

set -e

CANAL="$1"
NUM="$2"
TITULO="$3"
SCRIPTS_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPTS_DIR")"
HETZNER="root@65.109.85.250"

if [ -z "$CANAL" ] || [ -z "$NUM" ]; then
    echo "Uso: ./pipeline-full.sh CANAL NUM [TITULO]"
    echo "Exemplo: ./pipeline-full.sh E 18"
    exit 1
fi

# ══════════════════════════════════════
# CONFIG: Ler canal de channels.json
# ══════════════════════════════════════
CHANNELS_JSON="$PROJECT_DIR/config/channels.json"
if [ ! -f "$CHANNELS_JSON" ]; then
    echo "❌ config/channels.json não encontrado"
    exit 1
fi

CHANNEL_NAME=$(python3 -c "import json; print(json.load(open('$CHANNELS_JSON')).get('$CANAL',{}).get('name',''))" 2>/dev/null)
if [ -z "$CHANNEL_NAME" ]; then
    echo "❌ Canal $CANAL não encontrado em channels.json"
    python3 -c "import json; d=json.load(open('$CHANNELS_JSON')); [print(f'   {k}: {v[\"name\"]}') for k,v in d.items() if not k.startswith('_')]"
    exit 1
fi

OBSIDIAN_BASE="$HOME/Documents/Obsidian Vault/Projetos/Meus Canais"
CHANNEL_DIR="$OBSIDIAN_BASE/$CHANNEL_NAME"
REMOTE_DIR="/root/loopx-local/jobs/$CANAL/$NUM"

if [ ! -d "$CHANNEL_DIR" ]; then
    echo "❌ Pasta não encontrada: $CHANNEL_DIR"
    exit 1
fi

# Encontrar pasta do episódio
EPISODE_DIR=$(find "$CHANNEL_DIR" -maxdepth 1 -type d -name "${NUM} - *" 2>/dev/null | head -1)

# Se não existe e tem título, criar
if [ -z "$EPISODE_DIR" ] && [ -n "$TITULO" ]; then
    EPISODE_DIR="$CHANNEL_DIR/${NUM} - ${TITULO}"
    mkdir -p "$EPISODE_DIR"
    echo "📁 Pasta criada: $EPISODE_DIR"
elif [ -z "$EPISODE_DIR" ]; then
    echo "❌ Pasta do EP$NUM não encontrada. Passe o título como 3º argumento para criar."
    exit 1
fi

EPISODE_NAME=$(basename "$EPISODE_DIR")

# Estilo visual e gerente por canal (lido de channels.json)
ESTILO=$(python3 -c "import json; print(json.load(open('$CHANNELS_JSON')).get('$CANAL',{}).get('style','Cinematic Realism warm tones'))" 2>/dev/null)
GERENTE=$(python3 -c "import json; print(json.load(open('$CHANNELS_JSON')).get('$CANAL',{}).get('gerente','gerenteE'))" 2>/dev/null)
LANGUAGE=$(python3 -c "import json; print(json.load(open('$CHANNELS_JSON')).get('$CANAL',{}).get('language','es'))" 2>/dev/null)

# Fallbacks para canais sem config completa
if [ -z "$ESTILO" ]; then ESTILO="Cinematic Realism warm tones"; fi
if [ -z "$GERENTE" ]; then GERENTE="gerenteE"; fi
if [ -z "$LANGUAGE" ]; then LANGUAGE="es"; fi

echo ""
echo "════════════════════════════════════════════════════"
echo "🎬 PIPELINE COMPLETO — Canal $CANAL EP$NUM"
echo "📁 $EPISODE_NAME"
echo "════════════════════════════════════════════════════"
echo ""

# ══════════════════════════════════════
# FASE 1: Roteiro (claude -p --dangerously-skip-permissions)
# ══════════════════════════════════════
if [ -f "$EPISODE_DIR/roteiro.md" ]; then
    WORD_COUNT=$(wc -w < "$EPISODE_DIR/roteiro.md" | tr -d ' ')
    echo "⏭️  FASE 1: roteiro.md já existe ($WORD_COUNT palavras) — pulando"
else
    echo "📝 FASE 1: Gerando roteiro via Claude..."

    NOMES_PATH="$CHANNEL_DIR/Nomes e Locais Usados.md"
    FRAMEWORK_PATH="$CHANNEL_DIR/Framework Roteiros.md"

    if [ "$LANGUAGE" = "en" ]; then
        ROTEIRO_PROMPT="You are the screenplay writer for Canal $CANAL ($CHANNEL_NAME).
Read these files for context:
- Framework: $FRAMEWORK_PATH
- Names already used: $NOMES_PATH

Title: $EPISODE_NAME
Canal: $CANAL

Write a complete documentary script in ENGLISH.
- 5,000-7,000 words (target: 15-20 minutes at 0.85 speed)
- Follow the Framework structure (Paradoxo + 5-7 Camadas + Contraste + Ciclo + Fecho)
- 3rd person, historical present tense
- One specific number every 30-60 seconds
- Cite historical sources in narration (Polybius, Plutarch, etc.)
- Use original terms in the civilization's language (Latin, Greek, Nahuatl, etc.)
- NO humor, NO 'you', NO rhetorical questions in body
- Tone: grave, authoritative, fascinated
- TTS-ready: plain text, no bold/italic/caps, no emojis

Write the COMPLETE roteiro to: $EPISODE_DIR/roteiro.md"
    else
        ROTEIRO_PROMPT="You are the screenplay writer for Canal $CANAL ($CHANNEL_NAME).
Read these files for context:
- Framework: $FRAMEWORK_PATH
- Names already used: $NOMES_PATH

Title: $EPISODE_NAME
Canal: $CANAL

Write a complete screenplay (roteiro) in SPANISH (castellano mexicano urbano).
- 10 blocks (Bloque 1 through Bloque 10)
- Each block ~1700 words (minimum 1500)
- Total ~17,000 words
- First person narration (elderly woman)
- YouTube-safe: NO explicit sexual content, only double meaning and ambiguity
- TTS-ready: plain text, no bold/italic/caps, no emojis
- DO NOT use any character names from the 'Nomes e Locais Usados' file
- Follow the Framework structure (spoiler opening, arc, subplots, CTAs)

Write the COMPLETE roteiro to: $EPISODE_DIR/roteiro.md"
    fi

    claude -p --dangerously-skip-permissions "$ROTEIRO_PROMPT" --max-turns 80

    if [ -f "$EPISODE_DIR/roteiro.md" ]; then
        WORD_COUNT=$(wc -w < "$EPISODE_DIR/roteiro.md" | tr -d ' ')
        echo "✅ FASE 1: Roteiro completo ($WORD_COUNT palavras)"
    else
        echo "❌ FASE 1: Falhou ao gerar roteiro"
        exit 1
    fi
fi
echo ""

# ══════════════════════════════════════
# FASE 1b: desc.md + README.md
# ══════════════════════════════════════
if [ ! -f "$EPISODE_DIR/desc.md" ]; then
    echo "📝 FASE 1b: Gerando desc.md..."
    claude -p --dangerously-skip-permissions "Read the roteiro at $EPISODE_DIR/roteiro.md.
Write a YouTube description in SPANISH (3-5 lines + hashtags) for this video.
Style: confessional, hook the viewer, ask for comments.
Include hashtags: #ConfesionesdelasAbuelas #HistoriaDeVida #NuncaEsTarde
Write to: $EPISODE_DIR/desc.md" --max-turns 10
    echo "✅ desc.md criado"
fi

if [ ! -f "$EPISODE_DIR/README.md" ]; then
    echo "📝 FASE 1b: Gerando README.md..."
    claude -p --dangerously-skip-permissions "Read the roteiro at $EPISODE_DIR/roteiro.md.
Create a README.md with:
- Title and episode number
- Characters list (name, age, role)
- Locations used
- Story arc summary (3-5 lines)
- Production checklist (roteiro, audio, srt, cenas, prompts, render, thumb, upload)
Write to: $EPISODE_DIR/README.md" --max-turns 10
    echo "✅ README.md criado"
fi
echo ""

# ══════════════════════════════════════
# FASE 1c: Atualizar Nomes e Locais
# ══════════════════════════════════════
echo "📝 FASE 1c: Atualizando Nomes e Locais..."
NOMES_PATH="$CHANNEL_DIR/Nomes e Locais Usados.md"
claude -p --dangerously-skip-permissions "Read the roteiro at $EPISODE_DIR/roteiro.md.
Read the current names file at $NOMES_PATH.
Extract ALL new character names and locations from the roteiro.
APPEND them to the appropriate sections in $NOMES_PATH (mark with **bold** and note roteiro $NUM).
Also mark the profession used in the 'Profissões DISPONÍVEIS' section.
Do NOT remove any existing content, only APPEND." --max-turns 10
echo "✅ Nomes e Locais atualizados"
echo ""

# ══════════════════════════════════════
# FASE 2: TTS + Whisper
# ══════════════════════════════════════
if [ -f "$EPISODE_DIR/audio.wav" ]; then
    echo "⏭️  FASE 2: audio.wav já existe — pulando TTS"
else
    echo "🔊 FASE 2: Gerando TTS..."
    cd "$SCRIPTS_DIR"
    python3 tts-full.py --num "$NUM" --canal "$CANAL"
    echo "✅ FASE 2: TTS completo"
fi
echo ""

# Verificar outputs do TTS
if [ ! -f "$EPISODE_DIR/audio.wav" ] || [ ! -f "$EPISODE_DIR/audio.srt" ] || [ ! -f "$EPISODE_DIR/cenas-minutagem.md" ]; then
    echo "❌ Faltam ficheiros do TTS (audio.wav, audio.srt, cenas-minutagem.md)"
    exit 1
fi

CENAS_COUNT=$(grep -c "^Cena " "$EPISODE_DIR/cenas-minutagem.md" || echo "0")
echo "📊 $CENAS_COUNT cenas no cenas-minutagem.md"

# ══════════════════════════════════════
# FASE 3: Sincronizador (prompts VEO)
# ══════════════════════════════════════
if [ -f "$EPISODE_DIR/prompts-veo3.md" ]; then
    echo "⏭️  FASE 3: prompts-veo3.md já existe — pulando sincronizador"
else
    echo "🎯 FASE 3: Gerando prompts VEO 3.1 via sincronizador..."

    claude -p --dangerously-skip-permissions "You are the VEO 3.1 prompt sincronizador. Read these two files:
1. Roteiro: $EPISODE_DIR/roteiro.md
2. Cenas: $EPISODE_DIR/cenas-minutagem.md

Canal: $CANAL
Estilo: $ESTILO

Also read the full sincronizador skill for detailed rules: ~/.claude/commands/sincronizador.md

CRITICAL IMMERSION RULES:

THREE SCENE TYPES IN ROTATION:
- TYPE A (AVATAR): Narrator in PRESENT DAY (current age), seated, talking to camera in a warm living room. Natural window light. Gesturing, touching objects, changing expression. MINIMUM 25% of all scenes.
- TYPE B (FLASHBACK): Story scenes in the PAST. Period-appropriate clothing for the era and social class. Vintage aesthetic: slightly desaturated warm amber tones, film grain feel. Natural lighting. ALWAYS with movement.
- TYPE C (CUTAWAY): Detail shots of hands, objects, food, scenery. No faces. For dramatic pauses.

MANDATORY ROTATION:
- Opening: A A A A B (narrator talks first, then flashback begins)
- Body: B B B C A B B B A B B C A (natural rhythm)
- Climax: B B B B A (intense flashback, narrator reacts)
- Closing: A A A (narrator closes to camera)
- NEVER more than 5 flashbacks without an avatar
- NEVER more than 2 avatars in a row (except opening/closing)

CHARACTER CONSISTENCY:
- Create FULL identity blocks for EVERY character
- COPY the COMPLETE identity block into EVERY prompt where that character appears
- VEO has NO memory — each prompt must be fully self-contained
- SAME clothing, accessories, hair in ALL scenes of same character

FLASHBACK AESTHETICS:
- Clothing CORRECT for the era and social class
- Realistic settings for the specific city/region
- Natural lighting only, warm desaturated colors like aged analog film
- Textures: dust, steam, light rays, long shadows

AVATAR AESTHETICS:
- Simple dignified elderly woman clothing
- SAME room in ALL avatar scenes
- Warm afternoon window light, personal objects visible

FORMAT: (Cena NNN)[${ESTILO}, No Blood, No Nudity, No Dialogue, No Music] prompt text
- EVERY prompt has FULL character description
- VARY shot types (never 5 identical in a row)
- YouTube-safe only, output ONLY prompts, one per line

Write ALL prompts to: $EPISODE_DIR/prompts-veo3.md" --max-turns 80

    if [ -f "$EPISODE_DIR/prompts-veo3.md" ]; then
        PROMPT_COUNT=$(grep -c "^(Cena" "$EPISODE_DIR/prompts-veo3.md" || echo "0")
        echo "✅ FASE 3: $PROMPT_COUNT prompts gerados"
    else
        echo "❌ FASE 3: Falhou ao gerar prompts"
        exit 1
    fi
fi
echo ""

# ══════════════════════════════════════
# FASE 4: Garantir Chrome com Flow aberto
# ══════════════════════════════════════
echo "🌐 FASE 4: Verificando Chrome com Flow..."
CHROME_RUNNING=$(curl -s http://localhost:9222/json/version 2>/dev/null | head -1)
if [ -z "$CHROME_RUNNING" ]; then
    echo "   Lançando Chrome com debug port..."
    TEMP_DIR="/tmp/chrome-veo3"
    rm -rf "$TEMP_DIR" && mkdir -p "$TEMP_DIR/Profile 7"
    cp -R "$HOME/Library/Application Support/Google/Chrome/Profile 7/"* "$TEMP_DIR/Profile 7/" 2>/dev/null || true
    cp "$HOME/Library/Application Support/Google/Chrome/Local State" "$TEMP_DIR/" 2>/dev/null || true
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
        --user-data-dir="$TEMP_DIR" --profile-directory="Profile 7" \
        --remote-debugging-port=9222 "https://labs.google/fx/tools/flow" &
    sleep 10
    echo "   ✅ Chrome lançado"
else
    echo "   ✅ Chrome já rodando com debug port"
fi
echo ""

# ══════════════════════════════════════
# FASE 4b: Geração visual (VEO/Nano Banana)
# ══════════════════════════════════════
CENAS_DIR="$EPISODE_DIR/Cenas"
mkdir -p "$CENAS_DIR"
EXISTING_CENAS=$(ls "$CENAS_DIR" 2>/dev/null | wc -l | tr -d ' ')

if [ "$EXISTING_CENAS" -ge "$CENAS_COUNT" ]; then
    echo "⏭️  FASE 4b: $EXISTING_CENAS cenas já existem — pulando geração"
else
    echo "🎨 FASE 4b: Gerando visuais ($CENAS_COUNT cenas)..."

    cd "$PROJECT_DIR"
    node scripts/veo3-generator.js "$EPISODE_DIR/prompts-veo3.md" \
        --start 1 --end "$CENAS_COUNT" --batch 1 \
        --output "$CENAS_DIR"

    # Download loop (até ter todas ou 5 tentativas)
    ATTEMPTS=0
    MAX_ATTEMPTS=5
    while [ "$ATTEMPTS" -lt "$MAX_ATTEMPTS" ]; do
        EXISTING_CENAS=$(ls "$CENAS_DIR" 2>/dev/null | wc -l | tr -d ' ')
        echo "   📊 $EXISTING_CENAS / $CENAS_COUNT cenas baixadas"

        if [ "$EXISTING_CENAS" -ge "$CENAS_COUNT" ]; then
            break
        fi

        PENDING=$((CENAS_COUNT - EXISTING_CENAS))
        echo "   🔄 Tentativa $((ATTEMPTS+1)): baixando $PENDING faltantes..."
        node scripts/flow-download.js "$EPISODE_DIR/prompts-veo3.md" \
            --start 1 --end "$CENAS_COUNT" \
            --output "$CENAS_DIR" || true

        ATTEMPTS=$((ATTEMPTS + 1))

        if [ "$ATTEMPTS" -lt "$MAX_ATTEMPTS" ]; then
            EXISTING_CENAS=$(ls "$CENAS_DIR" 2>/dev/null | wc -l | tr -d ' ')
            if [ "$EXISTING_CENAS" -lt "$CENAS_COUNT" ]; then
                echo "   ⏳ Aguardando 60s para geração no Flow..."
                sleep 60
            fi
        fi
    done

    EXISTING_CENAS=$(ls "$CENAS_DIR" 2>/dev/null | wc -l | tr -d ' ')
    echo "✅ FASE 4b: $EXISTING_CENAS cenas baixadas"
fi
echo ""

# ══════════════════════════════════════
# FASE 5: Upload para Hetzner
# ══════════════════════════════════════
echo "📤 FASE 5: Upload para Hetzner..."
ssh "$HETZNER" "mkdir -p $REMOTE_DIR/Cenas $REMOTE_DIR/Cenas-bounced"

rsync -avz --quiet "$EPISODE_DIR/audio.wav" "$EPISODE_DIR/audio.srt" "$EPISODE_DIR/cenas-minutagem.md" \
    "$HETZNER:$REMOTE_DIR/"

rsync -avz --quiet "$CENAS_DIR/" "$HETZNER:$REMOTE_DIR/Cenas/"
echo "✅ FASE 5: Upload completo"
echo ""

# ══════════════════════════════════════
# FASE 5b: Bounce videos
# ══════════════════════════════════════
VIDEO_COUNT=$(ssh "$HETZNER" "ls $REMOTE_DIR/Cenas/*.mp4 2>/dev/null | wc -l" | tr -d ' ')
if [ "$VIDEO_COUNT" -gt 0 ]; then
    echo "🔄 FASE 5b: Bouncing $VIDEO_COUNT vídeos..."
    ssh "$HETZNER" "cd $REMOTE_DIR/Cenas && for f in *.mp4; do ffmpeg -y -i \"\$f\" -filter_complex '[0:v]split[fwd][rev];[rev]reverse[reversed];[fwd][reversed]concat=n=2:v=1:a=0' -an -c:v libx264 -preset fast -crf 18 \"../Cenas-bounced/\$f\" 2>/dev/null; done"
    echo "✅ FASE 5b: Bounce completo"
else
    echo "⏭️  FASE 5b: Sem vídeos mp4 para bounce"
fi
echo ""

# ══════════════════════════════════════
# FASE 5c: Symlink public/assets
# ══════════════════════════════════════
echo "🔗 FASE 5c: Linkando assets..."
ssh "$HETZNER" "rm -rf /root/loopx-local/remotion/public/assets && ln -s $REMOTE_DIR /root/loopx-local/remotion/public/assets"
ssh "$HETZNER" "rm -f $REMOTE_DIR/props.json"
echo "✅ FASE 5c: Assets linkados"
echo ""

# ══════════════════════════════════════
# FASE 5d: Render Remotion (via nohup — sem timeout SSH)
# ══════════════════════════════════════
if ssh "$HETZNER" "[ -f $REMOTE_DIR/raw.mp4 ]" 2>/dev/null; then
    echo "⏭️  FASE 5d: raw.mp4 já existe — pulando render"
else
    echo "🎬 FASE 5d: Render Remotion (~3-5h)..."
    ssh "$HETZNER" "cd /root/loopx-local/remotion && nohup node render.mjs --jobs $REMOTE_DIR --concurrency 2 > $REMOTE_DIR/render.log 2>&1 &"

    # Monitorar progresso
    echo "   Monitorando render..."
    while true; do
        sleep 120
        PROGRESS=$(ssh "$HETZNER" "tail -1 $REMOTE_DIR/render.log 2>/dev/null | grep -oP 'Rendered \K\d+' | tail -1" 2>/dev/null || echo "0")
        DONE=$(ssh "$HETZNER" "grep -c 'Done' $REMOTE_DIR/render.log 2>/dev/null" 2>/dev/null || echo "0")

        if [ "$DONE" -gt 0 ]; then
            echo "   ✅ Render completo!"
            break
        fi

        if [ -n "$PROGRESS" ] && [ "$PROGRESS" -gt 0 ]; then
            echo "   🔄 Rendered $PROGRESS frames..."
        fi
    done
fi
echo ""

# ══════════════════════════════════════
# FASE 5e: Finalizar vídeo (raw → final)
# ══════════════════════════════════════
if ssh "$HETZNER" "[ -f $REMOTE_DIR/final.mp4 ]" 2>/dev/null; then
    echo "⏭️  FASE 5e: final.mp4 já existe — pulando"
else
    echo "📦 FASE 5e: Copiando raw.mp4 → final.mp4..."
    ssh "$HETZNER" "cp $REMOTE_DIR/raw.mp4 $REMOTE_DIR/final.mp4"
    echo "✅ FASE 5e: final.mp4 pronto"
fi
echo ""

# ══════════════════════════════════════
# FASE 6: Download final
# ══════════════════════════════════════
if [ -f "$EPISODE_DIR/video-final.mp4" ]; then
    echo "⏭️  FASE 6: video-final.mp4 já existe — pulando download"
else
    echo "📥 FASE 6: Baixando vídeo final..."
    scp "$HETZNER:$REMOTE_DIR/final.mp4" "$EPISODE_DIR/video-final.mp4"
fi

SIZE=$(du -h "$EPISODE_DIR/video-final.mp4" | cut -f1)
echo "✅ FASE 6: Download completo — $SIZE"
echo ""

# ══════════════════════════════════════
# FASE 7: Thumbnail
# ══════════════════════════════════════
if [ -f "$EPISODE_DIR/thumb-image.png" ]; then
    echo "⏭️  FASE 7: thumb-image.png já existe — pulando"
else
    echo "🎨 FASE 7: Gerando prompt de thumbnail..."
    if [ ! -f "$EPISODE_DIR/thumb.md" ]; then
        claude -p --dangerously-skip-permissions "Read the roteiro at $EPISODE_DIR/roteiro.md.
Read the thumbnail rules from $CHANNEL_DIR/Contexto Canal $CANAL.md (section Thumbnails).
Generate a thumbnail prompt for Ideogram with:
- Composition matching one of the 6 templates (T1-T6)
- Elderly Mexican mestiza woman matching the story
- Face well-lit and fully visible on left side, text space on right
- Bold text overlay with 3 colors: white (setup) + yellow #FFD700 (bridge) + red #FF2020 (impact)
- Small red badge bottom left: HISTORIA DE VIDA
- 16:9, photorealistic cinematic
Write to: $EPISODE_DIR/thumb.md" --max-turns 10
    fi
    echo "✅ FASE 7: thumb.md criado (gerar imagem manualmente no Ideogram)"
fi
echo ""

echo "════════════════════════════════════════════════════"
echo "🎉 PIPELINE COMPLETO — Canal $CANAL EP$NUM"
echo "📁 $EPISODE_DIR"
echo ""
echo "   ✅ roteiro.md    ✅ audio.wav     ✅ audio.srt"
echo "   ✅ cenas.md      ✅ prompts-veo3  ✅ Cenas/"
echo "   ✅ desc.md       ✅ README.md     ✅ video-final.mp4 ($SIZE)"
echo "   ✅ thumb.md      ⬜ thumb-image   ⬜ YouTube upload"
echo "════════════════════════════════════════════════════"
