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

# ── Carrega skill do gerente do canal (Abordagem B: inline skill content) ──
# Garante isolamento por canal: cada chamada claude recebe LITERALMENTE o skill
# do canal correto como contexto, sem depender de slash-commands em headless.
load_skill() {
    local skill_name="$1"
    local path="$HOME/.claude/commands/${skill_name}.md"
    if [ ! -f "$path" ]; then
        echo "❌ Skill '$skill_name' não existe em $path" >&2
        echo "   Crie o skill antes de rodar pipeline pra este canal." >&2
        exit 1
    fi
    cat "$path"
}

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
GERENTE=$(python3 -c "import json; print(json.load(open('$CHANNELS_JSON')).get('$CANAL',{}).get('gerente',''))" 2>/dev/null)
LANGUAGE=$(python3 -c "import json; print(json.load(open('$CHANNELS_JSON')).get('$CANAL',{}).get('language','es'))" 2>/dev/null)

# Fallbacks para canais sem config completa
if [ -z "$ESTILO" ]; then ESTILO="Cinematic Realism warm tones"; fi
if [ -z "$GERENTE" ]; then
    echo "❌ Canal $CANAL não tem campo 'gerente' em $CHANNELS_JSON — defina antes de rodar pipeline."
    exit 1
fi
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
    echo "📝 FASE 1: Gerando roteiro via skill /${GERENTE}..."

    # Abordagem B: skill inline. Carrega LITERALMENTE o gerenteX.md como contexto
    # — Claude segue só as regras desse canal, sem chance de mistura.
    SKILL_CONTENT=$(load_skill "$GERENTE")

    ROTEIRO_PROMPT="${SKILL_CONTENT}

---

EXECUTE AGORA — VOCÊ É O GERENTE ACIMA.

Tarefa: escrever o roteiro completo do EP${NUM} do canal acima.

Contexto operacional:
- Canal: ${CANAL} (${CHANNEL_NAME})
- Número do EP: ${NUM}
- Título: ${EPISODE_NAME}
- Pasta do EP: ${EPISODE_DIR}
- Pasta do canal: ${CHANNEL_DIR}

Salve o roteiro COMPLETO em: ${EPISODE_DIR}/roteiro.md

Siga TODAS as regras de identidade, idioma, persona, estrutura, duração, tom e restrições definidas no seu skill acima. NÃO use referências, hashtags, personagens, cenários ou vocabulário de outros canais. Se este canal tem 'Nomes e Locais Usados.md' ou 'Framework Roteiros.md' na pasta do canal, leia antes de escrever."

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
    echo "📝 FASE 1b: Gerando desc.md via skill /${GERENTE}..."
    # Skill inline garante hashtags/estilo/idioma corretos do canal — sem hardcode.
    SKILL_CONTENT=$(load_skill "$GERENTE")
    ROTEIRO_TXT=$(cat "$EPISODE_DIR/roteiro.md")
    claude -p --dangerously-skip-permissions "${SKILL_CONTENT}

---

EXECUTE: escreva a descrição de YouTube do EP${NUM} (${EPISODE_NAME}) deste canal.

Roteiro completo do EP${NUM}:
${ROTEIRO_TXT}

Regras:
- Idioma, tom e hashtags SEGUEM as regras do canal definidas no seu skill acima.
- NÃO use hashtags de outros canais.
- 3-5 linhas + hashtags próprias do canal.
- Salve em: ${EPISODE_DIR}/desc.md
- Responda APENAS escrevendo o arquivo, sem preâmbulo." --max-turns 20 && echo "✅ desc.md criado"
fi

if [ ! -f "$EPISODE_DIR/README.md" ]; then
    echo "📝 FASE 1b: Gerando README.md (OpenRouter free)..."
    ROTEIRO_TXT=$(cat "$EPISODE_DIR/roteiro.md")
    "$SCRIPTS_DIR/openrouter-task.sh" "$EPISODE_DIR/README.md" "Roteiro do EP$NUM:

$ROTEIRO_TXT

---
Tarefa: crie um README.md em markdown com:
- Título e número do episódio
- Lista de personagens (nome, idade, papel)
- Locais usados
- Resumo do arco da história (3-5 linhas)
- Production checklist: [ ] roteiro [ ] audio [ ] srt [ ] cenas [ ] prompts [ ] render [ ] thumb [ ] upload

Responda APENAS com o markdown final, sem preâmbulo." && echo "✅ README.md criado"
fi
echo ""

# ══════════════════════════════════════
# FASE 1c: Atualizar Nomes e Locais
# ══════════════════════════════════════
echo "📝 FASE 1c: Atualizando Nomes e Locais (OpenRouter free)..."
NOMES_PATH="$CHANNEL_DIR/Nomes e Locais Usados.md"
if [ -f "$NOMES_PATH" ]; then
    ROTEIRO_TXT=$(cat "$EPISODE_DIR/roteiro.md")
    NOMES_TXT=$(cat "$NOMES_PATH")
    TMP_NOMES=$(mktemp)
    "$SCRIPTS_DIR/openrouter-task.sh" "$TMP_NOMES" "Roteiro do EP$NUM:

$ROTEIRO_TXT

---
Arquivo atual de Nomes e Locais:

$NOMES_TXT

---
Tarefa: extraia TODOS os novos personagens e locais do roteiro $NUM que ainda NÃO estão no arquivo.
Retorne o arquivo COMPLETO atualizado em markdown, com os novos itens APENDADOS nas seções corretas, marcados com **negrito** e a nota \`(roteiro $NUM)\`.
Também marque com [x] a profissão usada (se houver seção 'Profissões DISPONÍVEIS').
NÃO remova nada existente. Responda APENAS com o markdown final do arquivo completo, sem preâmbulo." && {
        # Só sobrescreve se o output tem volume >= ao original (evita truncamento)
        OLD_SIZE=$(wc -c < "$NOMES_PATH")
        NEW_SIZE=$(wc -c < "$TMP_NOMES")
        if [ "$NEW_SIZE" -ge "$OLD_SIZE" ]; then
            mv "$TMP_NOMES" "$NOMES_PATH"
            echo "✅ Nomes e Locais atualizados"
        else
            rm -f "$TMP_NOMES"
            echo "⚠️  FASE 1c: Qwen retornou conteúdo menor ($NEW_SIZE vs $OLD_SIZE bytes) — mantendo original"
        fi
    } || echo "⚠️  FASE 1c falhou — seguindo"
else
    echo "⚠️  FASE 1c: $NOMES_PATH não existe — pulando"
fi
echo ""

# Parada após Fase 1 (modo pipelined: worker slot 1 termina aqui)
if [ "${STOP_AFTER_PHASE:-}" = "1" ]; then
    echo "✋ STOP_AFTER_PHASE=1 — pipeline parou em Fase 1 (Roteiro+desc+README+Nomes). Fases 2-6 puladas."
    exit 0
fi

# ══════════════════════════════════════
# FASE 1d: Pré-processar roteiro pra TTS (strip markdown)
# tts-full.py lê roteiro-tts.md por preferência. Aqui geramos versão limpa
# removendo headers (#, ##), frontmatter, blocos de metadados, listas e
# separadores que o LLM costuma incluir mas não devem ir pra voz.
# ══════════════════════════════════════
if [ ! -f "$EPISODE_DIR/roteiro-tts.md" ] && [ -f "$EPISODE_DIR/roteiro.md" ]; then
    echo "🧹 FASE 1d: Gerando roteiro-tts.md (strip markdown)..."
    python3 <<PYEOF
import re
src = open("$EPISODE_DIR/roteiro.md").read()
# 1. Remove YAML frontmatter
src = re.sub(r'^---\n.*?\n---\n', '', src, count=1, flags=re.DOTALL)
# 2. Remove blocos de metadados rotulados (## DNA, ## Metadata, ## Notes, ## Estructura, etc.)
META_HEADERS = r'(?:DNA|Metadata|Notes?|Estructura|Estrutura|Notas?|Eixos?|Anti[- ]?[Mm]assa|Variation|Variação|Resumo|Resumen|Sinopse|Synopsis|Outline|Esquema|Setup|Briefing)'
src = re.sub(rf'^## {META_HEADERS}.*?(?=^## |\Z)', '', src, flags=re.M | re.DOTALL | re.I)
# 3. Remove TODOS os headers markdown (#, ##, ###...) — mantém só conteúdo
src = re.sub(r'^#+\s.*$', '', src, flags=re.M)
# 4. Remove separadores ---/***
src = re.sub(r'^[-*_]{3,}\s*$', '', src, flags=re.M)
# 5. Remove linhas de lista bullet/numbered se forem metadata-like (curtas, com :)
src = re.sub(r'^\s*[-*]\s+[A-ZÀ-Ÿ][^:.\n]{2,40}:\s*.*$', '', src, flags=re.M)
# 6. Remove markdown formatting inline (**bold**, *italic*, \`code\`, [link](url))
src = re.sub(r'\*\*(.+?)\*\*', r'\1', src)
src = re.sub(r'(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)', r'\1', src)
src = re.sub(r'\`([^\`]+)\`', r'\1', src)
src = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', src)
# 7. Colapsa múltiplas linhas em branco
src = re.sub(r'\n{3,}', '\n\n', src)
src = src.strip() + "\n"
open("$EPISODE_DIR/roteiro-tts.md", "w").write(src)
print(f"   roteiro.md: {len(open('$EPISODE_DIR/roteiro.md').read())} chars")
print(f"   roteiro-tts.md: {len(src)} chars (limpo)")
PYEOF
    echo "✅ FASE 1d: roteiro-tts.md criado (TTS vai ler esse)"
fi
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

# Parada após Fase 2 (modo pipelined: worker slot 2 termina aqui)
if [ "${STOP_AFTER_PHASE:-}" = "2" ]; then
    echo "✋ STOP_AFTER_PHASE=2 — pipeline parou em Fase 2 (TTS). Fases 3-6 puladas."
    exit 0
fi

# ══════════════════════════════════════
# FASE 2.5: Storyboard (canal I apenas) — gate de revisão humana
# ══════════════════════════════════════
# Só roda pro canal I (Fe al Descubierto) onde disciplina visual exige planejamento.
# Cria storyboard.md a partir de roteiro+cenas-minutagem+skill. Cria .WAITING-APPROVAL.
# Pipeline ABORTA limpo até user criar .storyboard-approved (touch manual OU botão dashboard).
if [ "$CANAL" = "I" ]; then
    if [ ! -f "$EPISODE_DIR/storyboard.md" ]; then
        echo "📋 FASE 2.5: Gerando storyboard via skill /${GERENTE}..."
        GERENTE_SKILL=$(load_skill "$GERENTE")
        ROTEIRO_TXT=$(cat "$EPISODE_DIR/roteiro.md")
        CENAS_TXT=$(cat "$EPISODE_DIR/cenas-minutagem.md")

        claude -p --dangerously-skip-permissions "${GERENTE_SKILL}

---

EXECUTE — gerar storyboard estruturado.

Roteiro completo:
${ROTEIRO_TXT}

Cenas-minutagem (timestamps absolutos da narração):
${CENAS_TXT}

Tarefa: gerar storyboard.md em ${EPISODE_DIR}/storyboard.md com UMA entrada por cena (mesma numeração e timestamps de cenas-minutagem.md).

Cada entrada DEVE seguir o formato exato:

## Cena NNN [MM:SS-MM:SS] · Tipo: <TIPO>
- Layout: <um dos 5 tipos B4 do skill: dramatizada | card-conceito | card-tipografico | livro-aberto | objeto-isolado>
- Personagens: <persona-ancora se aplicavel, ou 'narrador implicito', ou 'nenhum'>
- Visual central: <descricao curta de UMA ideia visual — sem floreio>
- Paleta: sépia-base + <cor-tema do EP rotada do Eixo 8>
- Card-transicao: <se cena marca transição entre Pontos/Itens, especifique layout do Eixo 9; senao 'n/a'>
- Mao hand-drawn: <sim/nao — se sim, descreva o gesto/palavra/nome a ser desenhado>
- Audio cobre: <fragmento curto da narração — primeiros ~80 chars do que TTS diz nessa cena>

Regras:
- Aplicar disciplina visual B1-B6 do skill (vocabulario fixo, 1 ideia por frame, fundo papel persistente)
- Rotacionar Layout entre cenas (NUNCA 5 dramatizadas seguidas)
- Card-transicao OBRIGATORIO antes de cada novo Punto da lista (ver roteiro)
- Mao hand-drawn em 2-4 cenas de alta emoção
- Paleta: escolher 1 cor-tema do Eixo 8 e MANTER em TODO o EP (sépia base sempre)
- Output: APENAS markdown estruturado, sem preâmbulo, sem fechamento" --max-turns 80

        if [ ! -f "$EPISODE_DIR/storyboard.md" ]; then
            echo "❌ FASE 2.5: Storyboard não foi criado"
            exit 1
        fi
        touch "$EPISODE_DIR/.WAITING-APPROVAL"
        SB_LINES=$(wc -l < "$EPISODE_DIR/storyboard.md")
        echo "✅ FASE 2.5: storyboard.md criado ($SB_LINES linhas)"
    fi

    # Gate: aborta se não aprovado
    if [ ! -f "$EPISODE_DIR/.storyboard-approved" ]; then
        echo ""
        echo "════════════════════════════════════════════════════"
        echo "⏸  STORYBOARD AGUARDANDO APROVAÇÃO"
        echo "════════════════════════════════════════════════════"
        echo "Arquivo: $EPISODE_DIR/storyboard.md"
        echo ""
        echo "Pra aprovar e continuar pipeline, escolha UMA:"
        echo "  1. Botão 'Aprovar storyboard' no dashboard (card do EP)"
        echo "  2. Terminal: touch \"$EPISODE_DIR/.storyboard-approved\""
        echo ""
        echo "Depois, rode o pipeline de novo (vai pular Fases 1-2.5 já feitas)."
        echo "════════════════════════════════════════════════════"
        exit 0
    fi
    rm -f "$EPISODE_DIR/.WAITING-APPROVAL"
    echo "✅ FASE 2.5: storyboard aprovado, seguindo pra Fase 3"
fi
echo ""

# ══════════════════════════════════════
# FASE 3: Sincronizador (prompts VEO)
# ══════════════════════════════════════
if [ -f "$EPISODE_DIR/prompts-veo3.md" ]; then
    echo "⏭️  FASE 3: prompts-veo3.md já existe — pulando sincronizador"
else
    echo "🎯 FASE 3: Gerando prompts VEO 3.1 via /${GERENTE} + /sincronizador..."

    ROTEIRO_TXT=$(cat "$EPISODE_DIR/roteiro.md")
    CENAS_TXT=$(cat "$EPISODE_DIR/cenas-minutagem.md")
    STORYBOARD_TXT=""
    if [ -f "$EPISODE_DIR/storyboard.md" ]; then
        STORYBOARD_TXT=$(cat "$EPISODE_DIR/storyboard.md")
        echo "   📋 Storyboard aprovado encontrado — Fase 3 vai consumir storyboard.md"
    fi

    # Abordagem B: dois skills inline.
    #  - GERENTE: identidade visual do canal (persona, scene types, aesthetics próprios).
    #  - SINCRONIZADOR: mecânica de transformar roteiro+cenas em prompts VEO no formato (Cena NNN).
    # NÃO repetir regras de scene types aqui: cada canal define as suas no skill do gerente.
    GERENTE_SKILL=$(load_skill "$GERENTE")
    SINCRONIZADOR_SKILL=""
    [ -f "$HOME/.claude/commands/sincronizador.md" ] && SINCRONIZADOR_SKILL=$(cat "$HOME/.claude/commands/sincronizador.md")

    claude -p --dangerously-skip-permissions "════════ SKILL DO CANAL (gerente) ════════
${GERENTE_SKILL}

════════ SKILL UNIVERSAL DE SINCRONIZAÇÃO VEO ════════
${SINCRONIZADOR_SKILL}

════════ EXECUTE ════════
Tarefa: gerar prompts VEO 3.1 do EP${NUM} (${EPISODE_NAME}) deste canal.

Canal: ${CANAL} (${CHANNEL_NAME})
Estilo visual (de channels.json, use literal no header de cada prompt): ${ESTILO}

$([ -n "$STORYBOARD_TXT" ] && printf "STORYBOARD APROVADO (FONTE DE VERDADE — siga 100%%, cada Cena NNN do storyboard vira UM prompt VEO):\n%s\n\n" "$STORYBOARD_TXT")
ROTEIRO COMPLETO:
${ROTEIRO_TXT}

CENAS-MINUTAGEM (timestamps de cada cena):
${CENAS_TXT}

Regras de execução:
- Estética visual, persona do narrador, scene types (avatar/flashback/cutaway ou outros), paleta, vestimenta, cenários e aspecto VÊM EXCLUSIVAMENTE do skill do gerente acima. NÃO use estética de outros canais.
- Mecânica de prompt (formato '(Cena NNN)[ESTILO, restrições] texto', character consistency blocks, VEO sem memória, restrições YouTube-safe) vem do skill do sincronizador.
- Se este canal NÃO usa avatar/narrador-em-cena (ex: 3ª pessoa documental, stick figures, comida hero), siga o que o gerente especifica — NÃO force TYPE A/B/C de outro canal.
- Formato de cada linha: (Cena NNN)[${ESTILO}, No Blood, No Nudity, No Dialogue, No Music] descrição completa
- Output: APENAS os prompts, um por linha, começando em (Cena 001). Sem preâmbulo, sem markdown, sem explicação.
- Salvar em: ${EPISODE_DIR}/prompts-veo3.md" --max-turns 80

    if [ -f "$EPISODE_DIR/prompts-veo3.md" ]; then
        PROMPT_COUNT=$(grep -c "^(Cena" "$EPISODE_DIR/prompts-veo3.md" || echo "0")
        echo "✅ FASE 3: $PROMPT_COUNT prompts gerados"
    else
        echo "❌ FASE 3: Falhou ao gerar prompts"
        exit 1
    fi
fi
echo ""

# Stop after Phase 3 if env var set (modo "fila batch": prepara conteúdo sem queimar API Flow)
if [ "${STOP_AFTER_PHASE:-}" = "3" ]; then
    echo "✋ STOP_AFTER_PHASE=3 — pipeline parou em Fase 3 (Sincronizador). Fases 4-6 puladas."
    exit 0
fi

# ══════════════════════════════════════
# FASE 4: Adquirir conta Flow + garantir Chrome
# ══════════════════════════════════════
echo "🌐 FASE 4: Adquirindo conta Flow livre..."
JOB_TAG="${JOB_ID:-$CANAL$NUM}"
ACQUIRED=$(node "$SCRIPTS_DIR/flow-account-manager.js" wait-acquire "$JOB_TAG")
if [ -z "$ACQUIRED" ]; then
    echo "❌ FASE 4: Falha ao adquirir conta Flow"
    exit 1
fi
FLOW_ACCOUNT_ID=$(echo "$ACQUIRED" | python3 -c "import json,sys;print(json.load(sys.stdin)['id'])")
FLOW_PROFILE=$(echo "$ACQUIRED" | python3 -c "import json,sys;print(json.load(sys.stdin)['profile'])")
FLOW_PORT=$(echo "$ACQUIRED" | python3 -c "import json,sys;print(json.load(sys.stdin)['port'])")
FLOW_USERDATA=$(echo "$ACQUIRED" | python3 -c "import json,sys;print(json.load(sys.stdin)['userdata'])")
FLOW_EMAIL=$(echo "$ACQUIRED" | python3 -c "import json,sys;print(json.load(sys.stdin)['email'])")
export FLOW_ACCOUNT_ID FLOW_PROFILE FLOW_PORT FLOW_USERDATA FLOW_EMAIL
echo "   ✅ Conta $FLOW_ACCOUNT_ID adquirida: $FLOW_EMAIL (porta $FLOW_PORT)"

# Sempre liberar conta no exit (sucesso ou falha)
release_account_on_exit() {
    local code=$?
    if [ -n "${FLOW_ACCOUNT_ID:-}" ]; then
        if [ "$code" -ne 0 ]; then
            node "$SCRIPTS_DIR/flow-account-manager.js" release "$FLOW_ACCOUNT_ID" --reason generic_failure >/dev/null 2>&1
        else
            node "$SCRIPTS_DIR/flow-account-manager.js" release "$FLOW_ACCOUNT_ID" >/dev/null 2>&1
        fi
    fi
}
trap release_account_on_exit EXIT

echo "🌐 FASE 4: Verificando Chrome (porta $FLOW_PORT)..."
CHROME_RUNNING=$(curl -s "http://localhost:$FLOW_PORT/json/version" 2>/dev/null | head -1)
if [ -z "$CHROME_RUNNING" ]; then
    echo "   Lançando Chrome (perfil: $FLOW_PROFILE, port: $FLOW_PORT)..."
    mkdir -p "$FLOW_USERDATA/$FLOW_PROFILE"
    if [ ! -f "$FLOW_USERDATA/$FLOW_PROFILE/Preferences" ]; then
        cp -R "$HOME/Library/Application Support/Google/Chrome/$FLOW_PROFILE/"* "$FLOW_USERDATA/$FLOW_PROFILE/" 2>/dev/null || true
        cp "$HOME/Library/Application Support/Google/Chrome/Local State" "$FLOW_USERDATA/" 2>/dev/null || true
    fi
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
        --user-data-dir="$FLOW_USERDATA" --profile-directory="$FLOW_PROFILE" \
        --remote-debugging-port="$FLOW_PORT" "https://labs.google/fx/tools/flow" &
    sleep 10
    echo "   ✅ Chrome lançado"
else
    echo "   ✅ Chrome já rodando na porta $FLOW_PORT"
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
    echo "🎨 FASE 4b: Gerando visuais ($CENAS_COUNT cenas) — submit + watch em paralelo"

    cd "$PROJECT_DIR"

    # 1) Inicia flow-watch em background: MutationObserver pega cenas conforme aparecem.
    #    Download direto via Node https (concurrency 6, com cookies da sessão).
    WATCH_LOG="/tmp/loopx-flow-watch-$$.log"
    nohup node scripts/flow-watch.js "$EPISODE_DIR/prompts-veo3.md" \
        --output "$CENAS_DIR" \
        --port "$FLOW_PORT" \
        --start 1 --end "$CENAS_COUNT" \
        --concurrency 6 \
        --max-idle 900 > "$WATCH_LOG" 2>&1 &
    WATCH_PID=$!
    echo "   👀 flow-watch background (PID $WATCH_PID, log $WATCH_LOG)"

    # 2) flow-watch precisa que o projeto Flow já esteja aberto. veo3-generator cria projeto novo.
    #    Dá 5s pro watch achar a tab depois que generator criar projeto.
    sleep 3

    # 3) Submit em foreground (com nossa humanização anti-abuse + --submit-only)
    node scripts/veo3-generator.js "$EPISODE_DIR/prompts-veo3.md" \
        --start 1 --end "$CENAS_COUNT" --batch 1 \
        --port "$FLOW_PORT" \
        --output "$CENAS_DIR" \
        --submit-only

    SUBMIT_EXIT=$?
    echo "   📤 Submit terminou (exit=$SUBMIT_EXIT)"

    # 4) Espera flow-watch terminar (sai após --max-idle min sem novas cenas)
    echo "   ⏳ Aguardando flow-watch terminar (max-idle 15min)..."
    wait "$WATCH_PID" 2>/dev/null
    WATCH_EXIT=$?
    echo "   👀 flow-watch terminou (exit=$WATCH_EXIT)"
    tail -10 "$WATCH_LOG" 2>/dev/null

    EXISTING_CENAS=$(ls "$CENAS_DIR" 2>/dev/null | wc -l | tr -d ' ')
    echo "✅ FASE 4b: $EXISTING_CENAS / $CENAS_COUNT cenas baixadas"
fi
echo ""

# ── Guard: NÃO prossegue pra FASE 5 se faltam cenas (vídeo final ficaria quebrado) ──
# Threshold default 95%, override via env CENAS_THRESHOLD (0-100)
CENAS_THRESHOLD="${CENAS_THRESHOLD:-95}"
REQUIRED=$(( CENAS_COUNT * CENAS_THRESHOLD / 100 ))
if [ "$EXISTING_CENAS" -lt "$REQUIRED" ]; then
    echo "❌ FASE 5 BLOQUEADA: $EXISTING_CENAS / $CENAS_COUNT cenas baixadas ($(( EXISTING_CENAS * 100 / CENAS_COUNT ))%)"
    echo "   Mínimo exigido: $REQUIRED ($CENAS_THRESHOLD%)"
    echo "   Resolva o problema (Flow rate-limit, captcha, conta cooldown) e rode pipeline de novo"
    echo "   Pra forçar mesmo assim: CENAS_THRESHOLD=0 ./pipeline-full.sh ..."
    exit 2
fi

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
    echo "🎨 FASE 7: Gerando prompt de thumbnail via skill /${GERENTE}..."
    if [ ! -f "$EPISODE_DIR/thumb.md" ]; then
        ROTEIRO_TXT=$(cat "$EPISODE_DIR/roteiro.md")
        EP_TITLE=$(basename "$EPISODE_DIR" | sed 's/^[0-9]* - //')
        # Template fixo do canal (opcional — se existir, skill recebe como contexto extra)
        THUMB_TEMPLATE=""
        if [ -f "$CHANNEL_DIR/Thumb-Template.md" ]; then
            THUMB_TEMPLATE=$(cat "$CHANNEL_DIR/Thumb-Template.md")
            echo "   📄 Anexando Thumb-Template.md do canal ao contexto"
        fi
        # Abordagem B: skill inline. Cada canal tem seu próprio estilo de thumb no skill.
        SKILL_CONTENT=$(load_skill "$GERENTE")
        claude -p --dangerously-skip-permissions "${SKILL_CONTENT}

---

EXECUTE: gere UM prompt pronto pra Ideogram (16:9) que produza a thumbnail do EP${NUM} deste canal.

Título do EP${NUM}: ${EP_TITLE}

Roteiro:
${ROTEIRO_TXT}

$([ -n "$THUMB_TEMPLATE" ] && printf "Template fixo do canal (siga 100%%):\n%s\n" "$THUMB_TEMPLATE")

Regras:
- Estilo visual, idioma do texto overlay, hashtags-de-thumb (se houver), figuras, cenários, paleta e tipografia SEGUEM exclusivamente o skill deste canal acima.
- NÃO use elementos visuais, paleta ou estilo de outros canais.
- Output: UM bloco de prompt em INGLÊS pra colar direto no Ideogram. Sem preâmbulo, sem markdown.
- Salve em: ${EPISODE_DIR}/thumb.md" --max-turns 20
    fi
    [ -f "$EPISODE_DIR/thumb.md" ] && echo "✅ FASE 7: thumb.md criado" || echo "⚠️  FASE 7: thumb.md NÃO criado — verifique se skill ${GERENTE} gera prompt de thumbnail"
fi
echo ""

# ══════════════════════════════════════
# FASE 8: Thumbnail Image (ai33.pro / Nano Banana Pro)
# ══════════════════════════════════════
if [ -f "$EPISODE_DIR/thumb-image.png" ]; then
    echo "⏭️  FASE 8: thumb-image.png já existe — pulando"
elif [ ! -f "$EPISODE_DIR/thumb.md" ]; then
    echo "⚠️  FASE 8: thumb.md não existe — pulando (rode FASE 7 antes)"
else
    if [ -z "$AI33_API_KEY" ] && [ -f "$SCRIPTS_DIR/../.env" ]; then
        export $(grep -E '^AI33_API_KEY=' "$SCRIPTS_DIR/../.env" | xargs)
    fi
    if [ -z "$AI33_API_KEY" ]; then
        echo "⚠️  FASE 8: AI33_API_KEY não setada — pulando render"
        echo "   (echo 'AI33_API_KEY=sk_...' >> .env)"
    else
        AI33_MODEL="${AI33_MODEL:-gemini-3.1-flash-image-preview}"
        echo "🎨 FASE 8: Renderizando thumb via ai33.pro ($AI33_MODEL)..."
        if node "$SCRIPTS_DIR/ai33-image.js" "$(cat "$EPISODE_DIR/thumb.md")" \
                --model "$AI33_MODEL" --ar 16:9 --res 2K \
                --out "$EPISODE_DIR/Thumb"; then
            LATEST=$(ls -t "$EPISODE_DIR/Thumb"/*.png 2>/dev/null | head -1)
            [ -n "$LATEST" ] && cp "$LATEST" "$EPISODE_DIR/thumb-image.png" \
                && echo "✅ FASE 8: $EPISODE_DIR/thumb-image.png"
        else
            echo "❌ FASE 8: falha no render ai33"
        fi
    fi
fi
echo ""

THUMB_STATUS="⬜ thumb-image"
[ -f "$EPISODE_DIR/thumb-image.png" ] && THUMB_STATUS="✅ thumb-image"

echo "════════════════════════════════════════════════════"
echo "🎉 PIPELINE COMPLETO — Canal $CANAL EP$NUM"
echo "📁 $EPISODE_DIR"
echo ""
echo "   ✅ roteiro.md    ✅ audio.wav     ✅ audio.srt"
echo "   ✅ cenas.md      ✅ prompts-veo3  ✅ Cenas/"
echo "   ✅ desc.md       ✅ README.md     ✅ video-final.mp4 ($SIZE)"
echo "   ✅ thumb.md      $THUMB_STATUS   ⬜ YouTube upload"
echo "════════════════════════════════════════════════════"
