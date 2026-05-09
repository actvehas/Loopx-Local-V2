---
name: proximo-{x}
description: Orquestrador completo do pipeline V2 — pega próximo título, gera roteiro/áudio/prompts, pausa antes da Fase 4, depois roda Fase 4 e 5 até final.mp4.
---

# /proximo-{X} — Pipeline Completo

> **Template.** Para cada canal, copiar esta pasta para `~/.claude/skills/proximo-{letra}/` e substituir `{X}` pela letra do canal (E, F, J, K, …) e `{Nome do Canal}` pelo nome real.

## Quando invocar

Sempre que o user disser:
- `/proximo-{x}` — pega 1º `[ ]` da fila
- `/proximo-{x} N` — força EP número N (mesmo se está em outra posição)
- `/proximo-{x} "Título"` — força título específico (gera próximo número)

## Fonte da verdade (NUNCA perguntar — ler daqui)

| Info | Onde | Falha se ausente |
|------|------|------------------|
| Próximo título | `Obsidian/.../Titulos.md` (1º item `[ ]`) | "Fila vazia. Adiciona títulos." |
| DNA / combo | `Obsidian/.../forge-dna.json` | "DNA não existe. Copia template." |
| Histórico | `Obsidian/.../forge-history.json` | OK criar vazio se não existe |
| Voz TTS | `config/voice-refs.json` chave `{X}` | "Voz não configurada." |
| Flow project | `config/channels.json` → `flow_project_id` | "Flow project ID não definido." |

## Fluxo

### 1. Setup
```bash
CANAL={X}
EP=$(próximo número disponível ou param)
TITULO=$(do Titulos.md ou param)
SLUG=$(slugify "$TITULO")
EP_DIR="$OBSIDIAN/Projetos/Meus Canais/{Nome do Canal}/EP$(printf %03d $EP) - $TITULO"
mkdir -p "$EP_DIR/Cenas" "$EP_DIR/logs"
cp docs/templates/ep-readme.template.md "$EP_DIR/README.md"
./scripts/update-titulos.sh $CANAL $EP start
```

### 2. Fase 1 — Roteiro (auto)
```bash
node scripts/forge-pick.js --canal $CANAL --ep $EP > "$EP_DIR/.combo.json"
# Invocar /gerente{X} passando título + combo + EP_DIR
# /gerente{X} gera: roteiro.md, thumb.md, desc.md
# Atualizar frontmatter: fase: 1-roteiro, combo: ...
./scripts/update-titulos.sh $CANAL $EP phase 1-roteiro
```

### 3. Fase 2 — TTS + Whisper (auto)
```bash
./scripts/pipeline-tts.sh $EP "$EP_DIR/roteiro.md" {X}-voice "$EP_DIR"
./scripts/update-titulos.sh $CANAL $EP phase 2-tts
```

### 4. Fase 3 — Sincronizador (auto)
```bash
# Invocar /sincronizador passando $EP_DIR
# Output: prompts-veo3.md, personagens.md
./scripts/update-titulos.sh $CANAL $EP phase 3-sync
```

### 5. 🛑 CHECKPOINT — Antes da Fase 4

**Mostrar ao user e parar:**

```
✅ EP{NN} pronto pra Fase 4 — Geração Visual no Flow

📋 Checklist:
  • Chrome aberto com --remote-debugging-port=9222 ?
  • Tab Flow no projeto correto (id: {flow_project_id}) ?
  • DNA bucket: {bucket} → ~{cenas} prompts esperados

Quando ok, responde "go" para submeter.
Para abortar, responde "stop".
```

**ESPERAR resposta do user.** Se "go", continuar. Se "stop", marcar `[ ]` de volta e sair.

### 6. Fase 4 — Flow (auto após "go")
```bash
node scripts/flow-submit.js "$EP_DIR/prompts-veo3.md" --output "$EP_DIR/Cenas" --port 9222
# Aguarda gerações (Flow demora 2-5min/cena)
# Loop até todas as cenas baixarem (timeout 4h):
while [ $(ls "$EP_DIR/Cenas" | wc -l) -lt $TOTAL ]; do
  node scripts/flow-download.js "$EP_DIR/prompts-veo3.md" --output "$EP_DIR/Cenas"
  sleep 60
done
./scripts/update-titulos.sh $CANAL $EP phase 4-flow
```

### 7. Fase 5 — Montagem + Final (auto)
```bash
./scripts/assemble.sh $CANAL $EP
./scripts/download.sh $CANAL $EP
mv ~/Downloads/final-$CANAL$EP.mp4 "$EP_DIR/final.mp4"
./scripts/update-titulos.sh $CANAL $EP done
```

### 8. Encerramento
- Atualizar frontmatter: `fase: done`, `publicado: HOJE` (ou null se ainda não publicou)
- Logar no Daily do Obsidian: link pro final.mp4
- Mostrar ao user: `✅ EP{NN} pronto: {EP_DIR}/final.mp4`

## Princípios

- **Nunca perguntar** o que está no DNA / Titulos / config.
- **Falhar com erro explícito** se faltar info. Sair com exit 1.
- **Idempotente**: se rodar de novo no mesmo EP, pula fases já feitas (verifica frontmatter `fase`).
- **Logs** vão pra `$EP_DIR/logs/pipeline.log`, não pro chat.
