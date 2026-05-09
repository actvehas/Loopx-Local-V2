# Princípio Auto-Mode

Skills e scripts do LoopX V2 seguem 4 regras pra eliminar perguntas no terminal.

## 1. Fonte da verdade no Obsidian

Quando uma skill precisa de info, ela **lê do Obsidian** antes de perguntar:

| Pergunta clássica | Onde está a resposta |
|-------------------|----------------------|
| "Qual o próximo título?" | `Titulos.md` (1º item `[ ]`) |
| "Que tom usar?" | `forge-dna.json` → `filtros_locked` ou `filtros_variable` |
| "Qual duração?" | `forge-dna.json` → `duracao.default` ou flag `--bucket` |
| "Quantos blocos no roteiro?" | derivado do bucket: `palavras / 500` |
| "Que voz TTS usar?" | `config/voice-refs.json` (chave do canal) |
| "Em que projeto Flow submeter?" | `config/channels.json` → `flow_project_id` |

## 2. Falha explícita > pergunta

Se a info **não está** disponível: a skill **falha com erro claro**, não pergunta.

```
❌ DNA do canal E não tem `tom` em filtros_variable.
   Edita: Obsidian/Projetos/Meus Canais/Confesiones de las Abuelas/forge-dna.json
   Re-rode quando estiver pronto.
```

Tu vês o erro, edita o JSON, rodas de novo. Sem chat ping-pong.

## 3. Confirmação só em pontos visuais

Há **2 confirmações legítimas** no pipeline:

- **Aprovar título** antes de gerar (oferece escolha numérica 1-5, não input livre)
- **Checkpoint Fase 4** (Chrome aberto na 9222 + tab certa) — visual

Tudo o resto roda sem parar.

## 4. Progresso na daily, não no chat

Cada fase escreve em `Daily/YYYY-MM-DD.md` no Obsidian:

```markdown
## 14:32 — EP18 Fase 2 → 3 (Canal E)
- audio.wav 47:12 ✅
- Whisper 12000 segments ✅
- cenas-minutagem.md 358 cenas ✅
- Sincronizador iniciando…
```

Claude Code chat fica leve (resumo final só, ou nada).

---

## Implementação por skill

### `/gerente{X}` (Fase 1)
1. Lê título do `Titulos.md` (param ou 1º da fila)
2. Lê DNA + history → chama `forge-pick.js --canal X --bucket Y --ep N` → recebe combo
3. Gera roteiro/thumb/desc/README aplicando o combo
4. Atualiza frontmatter do `EP{NN}/README.md` (combo, fase: 1)
5. Loga progresso em Daily

### `/sincronizador` (Fase 3)
1. Lê `cenas-minutagem.md` + `roteiro.md`
2. Aplica `combo` do README (D11_PROVA, D08_ANALOGIA → metáforas)
3. Gera `prompts-veo3.md`
4. Atualiza fase: 3

### `/proximo-{x}` (orquestrador)
1. Pega 1º `[ ]` de Titulos.md → `update-titulos.sh CANAL EP start`
2. Roda Fases 1-3 (com `update-titulos.sh CANAL EP phase N` entre cada uma)
3. **PARA** com checklist de Fase 4
4. Após OK do user → roda Fase 4 → 5 → `update-titulos.sh CANAL EP done`
