# Clawboy Dispatcher — Design Specification

**Data:** 2026-03-12 (compilado 2026-03-20)
**Status:** Implementado e validado
**Fonte:** Mesa Redonda do Squad (Daily 2026-03-12)

---

## 1. Visão Geral

O Clawboy é o **Dispatcher Central do Squad** — o único ponto de entrada para a Jaci acionar agentes remotamente. Em vez de cada agente ter seu próprio bot ou canal, a Jaci fala APENAS com o `@Atlasloopxbot` no Telegram e o Clawboy roteia para o agente correto.

**Problema resolvido:** Jaci era o dispatcher manual — orquestrava cada passo, dizia quem faz o quê, mediava entre agentes. Isso a prendia.

**Solução:** Clawboy recebe tudo via Telegram → roteia para a caixa do agente correto → agente é acordado pelo watcher → responde na daily → Jaci vê tudo num lugar só.

---

## 2. Arquitetura

```
Jaci (Telegram)
    ↓
@Atlasloopxbot (Bot Telegram)
    ↓
OpenClaw Gateway (Mac M1)
    ↓
Clawboy (DeepSeek via OpenClaw)
    ├── Analisa mensagem
    ├── Roteia para Squad/caixa-{agente}.md
    ├── Responde no Telegram: "Encaminhei pro [agente]"
    └── Registra na daily
    ↓
Workers (Mac M3 — LaunchAgents)
    ├── daily-mirror.sh (5min) — detecta @mentions na daily
    ├── debate-referee.sh (10min) — corta debates em 3 rounds
    ├── squad-watcher.sh (10min) — vigia mesa-redonda/
    └── enforce-updates.sh (5min) — cobra reports dos agentes
    ↓
Agentes (Cláudio/Gê)
    ├── Acordados via CLI (claude -p / antigravity)
    ├── Lêem arquivo + daily + brain dump antes de responder
    └── Postam resultado na daily
```

### Infraestrutura

| Componente | Máquina | Descrição |
|-----------|---------|-----------|
| OpenClaw Gateway | Mac M1 | Atende Telegram, roda DeepSeek |
| Workers/Daemons | Mac M3 | LaunchAgents, shell scripts, custo zero |
| Vault Obsidian | Mac M3 | Fonte de verdade, filesystem compartilhado |
| Caixas de mensagem | Mac M3 | `Squad/caixa-{claudio,ge,clawboy}.md` |

---

## 3. Os 6 Papéis do Clawboy

| # | Papel | Descrição |
|---|-------|-----------|
| 1 | **Dispatcher** | Roteia mensagens do Telegram para caixa do agente correto |
| 2 | **Sintetizador** | Consolida debates da Mesa Redonda quando todos responderam |
| 3 | **Fiscal** | Cobra agentes que não postam na daily há >2h |
| 4 | **Foundry** | Detecta ações repetidas (3+) → cria Playbook |
| 5 | **Coach** | Analisa produtividade e sugere melhorias |
| 6 | **RL (Reinforcement)** | Feedback loop — aprende com aprovações/rejeições da Jaci |

### Proibições

- **NÃO** edita código-fonte (.ts, .tsx, .js)
- **NÃO** faz git commit, push, merge
- **NÃO** faz deploy em produção
- **NÃO** toca em .env ou credenciais

---

## 4. Contexto do Clawboy (responder.sh v2)

O `responder.sh` injeta contexto antes de cada resposta do DeepSeek:

| Fonte | Antes (v1) | Depois (v2) |
|-------|-----------|-------------|
| Daily | 80 linhas | **200 linhas** |
| Regras (`clawboy-regras.md`) | 40 linhas | **arquivo completo** (~130 linhas) |
| Feedback (`feedback-jaci.md`) | 20 linhas | **30 linhas** |
| Mesa Redonda ativa | ❌ | **100 linhas** dos debates ativos |
| Brain dump Cláudio | ❌ | **50 linhas** do mais recente |
| Brain dump Gê | ❌ | **30 linhas** do mais recente |
| System prompt | Básico | **Expandido** (6 papéis) |
| max_chars por bloco | 3000 | **6000** |

**Total:** ~500 linhas de contexto (era 140). Custo: ~$0.002/invocação.

---

## 5. OpenClaw Workspace (Telegram)

O Telegram fala com o OpenClaw Gateway, que lê esses arquivos internos:

| Arquivo | Conteúdo |
|---------|----------|
| `~/.openclaw/workspace/IDENTITY.md` | 6 papéis, tabela do Squad, regras, roteamento |
| `~/.openclaw/workspace/SOUL.md` | Personalidade (caubói, PT-BR direto) |
| `~/.openclaw/workspace/MEMORY.md` | Squad, Mesa Redonda, workers, pipeline, contexto Jaci |
| `~/.openclaw/workspace/HEARTBEAT.md` | Checklist periódica: ler caixa, checar mesa redonda, fiscal |

**Modelo:** `ollama/qwen2.5:3b` (roda local no M1)

---

## 6. Workers (LaunchAgents no M3)

Scripts shell "burros" — zero IA, custo zero, rodam como daemons:

### daily-mirror.sh (a cada 5min)
- Detecta @mentions na daily (ex: `@Cláudio`, `@Gê`)
- Escreve na caixa do agente mencionado
- Anti-loop por hash de menção (não re-envia)

### debate-referee.sh (a cada 10min)
- Conta rounds por agente nos arquivos de `Squad/mesa-redonda/`
- Corta no limite de 3 rounds
- Posta aviso na daily quando cortado

### squad-watcher.sh (a cada 10min)
- Vigia `Squad/mesa-redonda/` por debates pendentes
- Invoca agente que ainda não respondeu
- Comando de despertar inclui: arquivo do debate + daily + brain dump

### enforce-updates.sh (a cada 5min)
- Verifica se agentes postaram na daily na última hora
- Alerta automático se >1h sem post
- Notifica Jaci se >2h sem resposta

---

## 7. Fluxo de Roteamento

### Telegram → Agente
```
1. Jaci manda mensagem no Telegram
2. OpenClaw Gateway recebe (M1)
3. DeepSeek analisa: quem deve resolver?
4. Clawboy escreve em Squad/caixa-{agente}.md
5. Clawboy responde no Telegram: "Encaminhei pro Cláudio"
6. daily-mirror.sh detecta (M3, 5min)
7. Agente é acordado via CLI com contexto
8. Agente responde na daily
9. Jaci vê na daily (ou Clawboy resume no Telegram)
```

### Mesa Redonda (debate entre agentes)
```
1. Agente detecta problema/decisão
2. Cria arquivo em Squad/mesa-redonda/YYYY-MM-DD-titulo.md
3. squad-watcher.sh detecta debate pendente
4. Cada agente responde (max 3 rounds — debate-referee corta)
5. Clawboy sintetiza quando todos responderam (ou timeout 2h)
6. Jaci lê síntese na daily → ✅/❌/🔄
```

---

## 8. Validação

**Teste realizado (2026-03-12 16:00):** Jaci mandou no Telegram pro Clawboy pedir parecer sobre RetentionBlueprint.

Resultado:
- ✅ Clawboy leu a daily inteira sozinho
- ✅ Entendeu o debate entre Cláudio e Gê
- ✅ Deu parecer de meta-agente com ordem de implementação
- ✅ Pediu aprovação da Jaci
- ✅ Tudo sem a Jaci intermediar nada

**Conclusão:** Sistema funcional. Telegram → Clawboy (com contexto) → parecer → aprovação.

---

## 9. Referências

- `Squad/clawboy-regras.md` — regras operacionais
- `Squad/mesa-redonda/TEMPLATE.md` — template de debate
- `Squad/scripts/` — workers (daily-mirror, debate-referee, squad-watcher, enforce-updates)
- `Decisões/2026-03-12 - Sistema Autonomo do Squad.md` — decisões formais
- `Playbooks/restart-openclaw-gateway.md` — restart do gateway
- `Daily/2026-03-12.md` — sessão completa da Mesa Redonda
