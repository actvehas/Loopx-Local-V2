# MiroYouTube — Design Spec

**Data:** 2026-03-21
**Autor:** Seu Cláudio
**Status:** Aprovado

---

## 1. Visão Geral

MiroYouTube é um sistema de inteligência para canais YouTube que opera em 3 camadas:

- **O Diretor** (`/miro`) — Analisa mercado, varre nichos/subnichos, diagnostica saúde de canais
- **O Estrategista** (`/miro-{X}`) — Recomenda método de título com base em dados isolados do canal
- **O Gerente** (`/gerente{X}`) — Executa produção (já existe)

O Diretor pensa. O Estrategista recomenda. O Gerente executa. O usuário decide em cada etapa.

### Princípios

1. **Dados reais** — YouTube API v3 + CSV do YouTube Studio. Zero simulação na v1.
2. **Isolamento total** — Cada canal é um universo. Nenhuma skill acessa dados de outro canal.
3. **Obsidian é a interface** — Todo output é `.md` com wikilinks no vault.
4. **Recomendação, não imposição** — O sistema recomenda UM método, o usuário aprova ou troca.
5. **Nunca os 3 métodos juntos** — Sempre recomenda o de maior probabilidade de sucesso.

### Os 3 Métodos de Criação de Título

Definição canônica: `[[Metodologia-Titulos-YouTube-2026]]` (Parte 3)

| Método | Nome | O que é | Quando usar |
|---|---|---|---|
| **1** | **Variação** | Manter apelo emocional, trocar ESTRUTURA e palavras. Mesma emoção, esqueleto diferente. | Canal novo, porta aberta, CTR estável, pouca saturação |
| **2** | **Subnichar** | Adicionar qualificador único que ninguém usou (emocional, geográfico, temporal, demográfico). Estreitar o subnicho. | Estrutura saturada (interna ou externa), muitos imitadores |
| **3** | **Do Zero** | Estrutura completamente nova. Mesmo nicho, mesma emoção base, zero similaridade estrutural. | CTR em queda, estrutura morta, competição em inglês, reset total necessário |

**Regra:** O sistema recomenda UM método por vez. NUNCA gera títulos com os 3 métodos simultaneamente.

### Os 5 Frameworks de Título (usados dentro de cada método)

| Framework | Mecânica |
|---|---|
| **Curiosity Gap** | Vazio de informação que só o clique resolve |
| **Open Loop** | Efeito Zeigarnik — abre loop que só fecha no vídeo |
| **Contraste/Transformação** | [Estado A] → [Estado B] |
| **Especificidade Extrema** | Números, datas, lugares concretos > generalidades |
| **Fórmula MrBeast** | <50 chars, voz ativa, dinheiro/tempo, extremos |

---

## 2. Arquitetura

```
INVOCAÇÃO                    MOTOR                         OUTPUT
─────────                    ─────                         ──────

/miro ──────────┐
                ▼
         ┌─────────────┐     ┌──────────────────┐     ┌─────────────────────┐
         │  Skill Mãe   │────▶│  miro-scanner.mjs │────▶│  Obsidian Vault/     │
         │  (O Diretor)  │    │  (YouTube API v3)  │    │  MiroYouTube/        │
         └─────────────┘     └──────────────────┘     │                     │
                │                                      │  ├── Canais/{X}/    │
                │             ┌──────────────────┐     │  ├── Varreduras/    │
                │────────────▶│  miro-analyzer.mjs│────▶│  └── Dashboard.md  │
                │             │  (CSV + JSON)     │    │                     │
                │             └──────────────────┘     └─────────────────────┘
                │                                              │
                │             ┌──────────────────┐             │
                └────────────▶│  miro-report.mjs  │─────────────┘
                              │  (gera .md final)  │
                              └──────────────────┘

/miro-{X} ──────┐
                ▼
         ┌──────────────────┐
         │  Skill Filha      │──── Lê APENAS Canais/{X}/*
         │  (O Estrategista) │──── Recomenda método (1, 2 ou 3)
         └──────────────────┘
                │
                ▼
         ┌──────────────────┐
         │  /gerente{X}      │──── Executa produção (já existe)
         └──────────────────┘
```

### Componentes

| Componente | Tipo | Responsabilidade |
|---|---|---|
| `/miro` | Skill `.md` | Orquestra — decide o que fazer, chama scripts, escreve no Obsidian |
| `/miro-{X}` | Skill `.md` por canal | Estrategista isolado — contexto específico, recomenda método |
| `miro-scanner.mjs` | Script Node | Varredura YouTube API v3 com rotation de 16 keys |
| `miro-analyzer.mjs` | Script Node | Processa CSV + JSON da API, calcula scores |
| `miro-report.mjs` | Script Node | Gera relatório `.md` formatado pro Obsidian |
| `keys.json` | Config | 16 API keys com rotation automática |

### Localização dos arquivos

```
LoopX-Local/
├── scripts/miro/
│   ├── miro-scanner.mjs
│   ├── miro-analyzer.mjs
│   ├── miro-report.mjs
│   └── keys.json
│
├── skills/
│   ├── miro.md              ← Skill Mãe (O Diretor)
│   ├── miro-E.md            ← Skill Filha (Estrategista Canal E)
│   └── miro-F.md            ← Skill Filha (Estrategista Canal F)

~/.claude/commands/
├── miro.md                  ← Symlink ou cópia da skill
├── miro-E.md
└── miro-F.md
```

---

## 3. Estrutura no Obsidian

### Árvore de pastas

```
Obsidian Vault/
└── MiroYouTube/
    ├── Dashboard.md                         ← Índice geral (só links + scores)
    │
    ├── Canais/
    │   ├── E/                               ← UNIVERSO ISOLADO
    │   │   ├── Perfil.md                    ← Identidade + nicho + idioma
    │   │   ├── Referências.md               ← Canais de referência DESTE nicho
    │   │   ├── Histórico.md                 ← Scores ao longo do tempo
    │   │   ├── Metodologia.md               ← Regras ESPECÍFICAS deste canal
    │   │   ├── Estruturas.md                ← Estruturas usadas + performance
    │   │   ├── Vocabulário.md               ← Palavras permitidas/proibidas
    │   │   ├── dados.json                   ← Métricas (só deste canal)
    │   │   ├── concorrentes.json            ← Só concorrentes DESTE nicho
    │   │   └── Reports/
    │   │       └── YYYY-MM-DD - Tipo.md
    │   │
    │   ├── F/                               ← UNIVERSO ISOLADO (outro nicho)
    │   │   └── (mesma estrutura)
    │   │
    │   └── G/                               ← Futuro (qualquer nicho)
    │       └── (mesma estrutura)
    │
    └── Varreduras/                          ← Varreduras de nicho (não pertencem a nenhum canal)
        └── YYYY-MM-DD - Nicho SubNicho.md
```

### Regras de isolamento

1. Skill `/miro-E` só lê `MiroYouTube/Canais/E/`. NUNCA acessa dados de F, G ou outro canal.
2. Vocabulário é isolado. Palavras permitidas num canal podem ser proibidas em outro.
3. Concorrentes são isolados. Cada canal monitora concorrentes do SEU subnicho.
4. Estruturas são isoladas. Saturação no Canal E não afeta recomendação do Canal F.
5. A Skill Mãe (`/miro`) é a ÚNICA que vê o Dashboard geral, mas ao analisar um canal específico, acessa apenas a pasta dele.
6. Isolamento é por convenção nas skills (prompt instrui limitar acesso). Não há enforcement técnico na v1. Scripts recebem `--canal X` e só operam nessa pasta.

### Dashboard.md — Formato

```markdown
# MiroYouTube — Dashboard

Última atualização: 2026-03-21

## Canais Ativos
| Canal | Nome | Nicho | Subnicho | Score | Tendência | Última Análise |
|-------|------|-------|----------|-------|-----------|----------------|
| [[Canais/E/Perfil\|E]] | Confesiones | Storytime urbano | Confissões doble sentido | 🟡 6.2 | ↘ Caindo | [[2026-03-21 - Análise Saúde]] |
| [[Canais/F/Perfil\|F]] | Abuela Recuerda | Storytime rural | Avó rural doble sentido | 🔴 2.1 | ↓ Morto | [[2026-03-21 - Análise Saúde]] |

## Últimas Varreduras
| Data | Nicho | Subnicho | Saturação | Link |
|------|-------|----------|-----------|------|
| 2026-03-21 | Storytime ES | Rural abuela | BAIXA | [[2026-03-21 - Storytime Rural]] |

## Links Rápidos
- [[Metodologia-Titulos-YouTube-2026]]
- [[Pesquisa Competitiva - Storytime Espanhol YouTube 2026]]
```

### Arquivos por canal

**`Perfil.md`** — Identidade fixa, editada pelo usuário:
```markdown
# Canal {X} — {Nome}
Handle: @handle
ID: UCxxxxx
Idioma: {idioma}
Nicho: {nicho}
Subnicho: {subnicho}
Branding: {elemento fixo, se houver}
Persona fixa: Sim/Não
Skill Gerente: [[gerente{X}]]
Contexto completo: [[Contexto Canal {X}]]
```

**`Referências.md`** — Canais de referência definidos pelo usuário:
```markdown
# Canais de Referência — Canal {X}
| Canal | ID | Subnicho | Por que monitorar |
|-------|-----|----------|-------------------|
| @Canal1 | UCxxxxx | {subnicho} | Concorrente direto |
```

**`Histórico.md`** — Acumula automaticamente a cada análise:
```markdown
# Histórico — Canal {X}
| Data | Score | Impr/vídeo | Estrutura dominante | Saturação | Alerta |
|------|-------|-----------|---------------------|-----------|--------|
| 2026-03-21 | 7.2 | 22.000 | {estrutura} | MÉDIA | — |
```

**`Metodologia.md`** — Regras específicas derivadas da base geral:
```markdown
# Metodologia — Canal {X}
Base: [[Metodologia-Titulos-YouTube-2026]]

## Regras específicas
- {regra 1}
- {regra 2}

## Personagens permitidos
{lista}

## Personagens PROIBIDOS (pertencem a outros canais)
{lista}

## Frameworks preferidos (baseado em dados)
1. {framework} (CTR médio X%)
```

**`Estruturas.md`** — Tracking de estruturas usadas:
```markdown
# Estruturas — Canal {X}
| Estrutura | Vezes usada | CTR médio | Views média | Última vez | Status |
|-----------|-------------|-----------|-------------|------------|--------|
| Personagem+Ação+Idade | 18 | 7.8% | 4.200 | 2026-03-20 | SATURADA |
| Confissão Temporal | 0 | — | — | — | DISPONÍVEL |
```

**`Vocabulário.md`** — Palavras isoladas por canal:
```markdown
# Vocabulário — Canal {X}

## Permitido
{palavras deste nicho/subnicho}

## PROIBIDO (pertence a outros canais ou fora do subnicho)
{palavras}
```

**`dados.json`** — Métricas brutas (para scripts, não para leitura humana):
```json
{
  "channel_id": "UCxxxxx",
  "last_updated": "2026-03-21",
  "videos": [
    {
      "id": "videoId",
      "title": "...",
      "published": "2026-03-20",
      "views": 96,
      "ctr": null,
      "impressions": null,
      "avg_view_duration": null,
      "subs_gained": null,
      "structure": "personagem+ação+idade",
      "framework": "open_loop",
      "method_used": 1,
      "has_branding": false,
      "source": "csv|api"
    }
  ],
  "csv_imports": [
    { "date": "2026-03-21", "file": "canal-f-mar2026.csv", "videos_updated": 21 }
  ]
}
```

**`concorrentes.json`** — Dados dos canais de referência:
```json
{
  "last_updated": "2026-03-21",
  "channels": [
    {
      "id": "UCxxxxx",
      "name": "@Canal1",
      "subs": 15000,
      "total_views": 500000,
      "created": "2026-01-15",
      "videos": [
        {
          "id": "videoId",
          "title": "...",
          "views": 50000,
          "published": "2026-03-10",
          "structure": "...",
          "framework": "curiosity_gap",
          "note": "structure = esqueleto do título, framework = mecânica emocional (mesmos nomes em dados.json e concorrentes.json)"
        }
      ]
    }
  ]
}
```

---

## 4. Scripts (Motor de Dados)

### 4.1 `miro-scanner.mjs`

Varredura YouTube API v3 com rotation de 16 keys.

**Modos de operação:**

```
MODO 1: Canal específico (concorrente)
  node miro-scanner.mjs --channel UCxxxxx --canal E --tipo concorrente

  → Puxa via channels.list: subs, total views, data criação, país
  → Puxa via search.list: últimos 50 vídeos
  → Puxa via videos.list: views, likes, comments, duração por vídeo
  → Salva em: MiroYouTube/Canais/E/concorrentes.json (append ao array channels)

MODO 1b: Canal próprio (self-scan via API)
  node miro-scanner.mjs --channel UCxxxxx --canal E --tipo proprio

  → Mesmos dados que Modo 1
  → Salva em: MiroYouTube/Canais/E/dados.json (merge com existente)
  → Usado quando não tem CSV disponível

MODO 2: Varredura de nicho + subnicho (2 camadas)
  node miro-scanner.mjs --nicho "storytime espanol" --subnicho "rural abuela doble sentido"

  CAMADA 1 — NICHO (visão ampla):
  → Busca via search.list: termos genéricos + variações semânticas
  → Ex: "storytime espanol", "historias narradas", "cuentos", "confesiones"
  → Encontra: 50-200 canais
  → Classifica por: subs, views/mês, idade, frequência

  CAMADA 2 — SUBNICHO (zoom):
  → Busca termos específicos + variações semânticas similares:
    "abuela" → abuela, abuelita, nana, doña, señora mayor, anciana
    "rancho" → rancho, campo, pueblo, ranchería, ejido, hacienda
    "pueblo" → pueblo, aldea, comunidad, sierra
    "confesiones" → confesiones, secretos, lo que nunca conté, historias reales
  → Expansão semântica gerada por Claude CLI no momento da varredura
    (a skill /miro pede ao Claude pra expandir os termos antes de chamar o scanner)
  → Combina termos em queries cruzadas
  → Deduplica resultados
  → Filtra: canais com <90 dias + >100K views (configurável via --min-views e --max-age)
  → Classifica:
    - Concorrentes diretos (mesmo subnicho exato)
    - Concorrentes adjacentes (mesmo nicho, subnicho diferente)
    - Canais novos com tração
  → Salva em: MiroYouTube/Varreduras/YYYY-MM-DD - {Nicho}.md
```

**Key rotation:**
```
→ 16 keys em keys.json
→ Cada key = 10.000 units/dia
→ Rotation automática quando key atinge 80% quota
→ Total disponível: 160.000 units/dia
→ Tracking de uso por key pra evitar 403
```

**Custo por operação (YouTube API v3 units):**
```
search.list = 100 units/request (50 resultados)
channels.list = 1 unit/request
videos.list = 1 unit/request (50 vídeos por batch)
```

### 4.2 `miro-analyzer.mjs`

Processa CSV do YouTube Studio + JSON da API, calcula scores.

**Modos de operação:**

```
MODO 1: Importar CSV do YouTube Studio
  node miro-analyzer.mjs --import /path/to/canal-f-mar2026.csv --canal F

  → Aceita path absoluto ou relativo ao diretório atual
  → A skill /miro pergunta o path do CSV ao usuário
  → Lê CSV (views, CTR, impressions, watch time, subs gained)
  → Merge com dados.json existente (acumula, não sobrescreve)
  → Calcula:
    - Score de saúde (0-10)
    - Saturação interna (diversidade de estruturas)
    - Tendência (subindo, estável, caindo, morto)
    - Estruturas mais usadas + performance de cada
    - Presença de branding (% dos vídeos com elemento fixo)
    - Frequência de publicação

MODO 2: Análise de concorrentes
  node miro-analyzer.mjs --concorrentes --canal F

  → Lê concorrentes.json (dados isolados deste canal)
  → Compara performance do canal vs referências
  → Identifica: o que concorrentes fazem que o canal não faz
  → Identifica: gaps de mercado (estruturas que ninguém usa)
  → Identifica: estruturas que estão viralizando nos concorrentes

MODO 3: Recomendação de método
  node miro-analyzer.mjs --recomendar --canal F

  → Lê dados.json + concorrentes.json + Estruturas.md
  → Aplica regras de decisão (em ordem de prioridade — primeira match ganha):
    1. CTR caiu >20% nos últimos 5 vídeos → Método 3 (reset urgente)
    2. Estrutura usada 5+ vezes seguidas → Método 2 ou 3 (saturação interna)
    3. Saturação externa alta (30+ canais com mesma estrutura) → Método 2
    4. Canal novo (<10 vídeos) → Método 1 (testar variações)
    5. CTR estável >8% → Método 1 (manter o que funciona)
    6. Default → Método 2 (subnichar é o mais seguro)
  → Output JSON:
    {
      "metodo_recomendado": 2,
      "razao": "Estrutura 'Personagem+Ação+Idade' usada 18x, CTR caiu 35%",
      "estruturas_proibidas": ["personagem+ação+idade"],
      "estruturas_sugeridas": ["confissão temporal", "contraste transformação"],
      "frameworks_recomendados": ["open_loop", "especificidade_extrema"],
      "branding_compliance": 0.38,
      "alerta": "NUNCA LO CONTÉ presente em apenas 38% dos vídeos (deveria ser 100%)"
    }
```

### 4.3 `miro-report.mjs`

Gera relatórios `.md` formatados com wikilinks e tags pro Obsidian.

**Tipos de relatório:**

```
node miro-report.mjs --tipo saude --canal F
  → Gera: MiroYouTube/Canais/F/Reports/YYYY-MM-DD - Análise Saúde.md
  → Atualiza: Histórico.md (append nova linha)
  → Atualiza: Dashboard.md (score atualizado)

node miro-report.mjs --tipo titulos --canal F --metodo 2
  → Gera: MiroYouTube/Canais/F/Reports/YYYY-MM-DD - Recomendação Títulos.md
  → Inclui: método recomendado, razão, títulos gerados, filtros aplicados

node miro-report.mjs --tipo concorrentes --canal F
  → Gera: MiroYouTube/Canais/F/Reports/YYYY-MM-DD - Análise Concorrentes.md
  → Inclui: comparativo, gaps, estruturas que funcionam neles

node miro-report.mjs --tipo varredura --nicho "storytime rural"
  → Gera: MiroYouTube/Varreduras/YYYY-MM-DD - Storytime Rural.md
  → Inclui: mapa nicho, mapa subnicho, saturação, porta de entrada
```

### 4.4 Score de Saúde (0-10)

```
COMPONENTES:
├── Tendência de impressões (peso 3)
│   10: subindo >20%
│    7: estável (±10%)
│    4: caindo até 30%
│    1: caindo >50%
│
├── Diversidade de estruturas (peso 2)
│   10: 4+ estruturas diferentes nos últimos 10 vídeos
│    7: 3 estruturas
│    4: 2 estruturas
│    1: 1 estrutura (repetição total)
│
├── CTR médio (peso 2)
│   10: >10%
│    7: 7-10%
│    4: 4-7%
│    1: <4%
│
├── Consistência de branding (peso 1)
│   10: 100% dos vídeos com branding
│    5: 50-99%
│    1: <50%
│
├── Frequência adequada (peso 1)
│   10: 2-3 vídeos/semana
│    7: 4-5/semana
│    4: 1/semana
│    2: 6-7/semana (excessivo)
│    1: >7/semana (spam)
│    0: 0 vídeos nas últimas 2 semanas (inativo)
│
└── SCORE FINAL = média ponderada (0-10)
    🟢 8-10: Saudável
    🟡 5-7: Atenção
    🔴 0-4: Crítico
```

---

## 5. Skills (Invocação)

### 5.1 `/miro` — O Diretor

**Comandos:**

| Comando | O que faz |
|---|---|
| `/miro saúde {X}` | Analisa saúde do canal, importa CSV se disponível, gera score |
| `/miro varrer --nicho "..." --subnicho "..."` | Varredura de nicho + subnicho (2 camadas) |
| `/miro concorrentes {X}` | Analisa canais de referência definidos em Referências.md |
| `/miro criar canal {X} --nicho "..." --subnicho "..."` | Cria estrutura completa de novo canal |

**Fluxo `/miro saúde F`:**
1. Lê `MiroYouTube/Canais/F/Perfil.md` (confirma existência)
2. Pergunta: "Tem CSV novo pra importar?"
   - Se sim: roda `miro-analyzer.mjs --import {CSV} --canal F`
   - Se não: usa `dados.json` existente
3. Roda `miro-analyzer.mjs --recomendar --canal F`
4. Roda `miro-report.mjs --tipo saude --canal F`
5. Output: Report salvo no Obsidian

**Fluxo `/miro varrer --nicho "..." --subnicho "..."`:**
1. Roda `miro-scanner.mjs --nicho "..." --subnicho "..."` (2 camadas)
2. Roda `miro-report.mjs --tipo varredura`
3. Output: Varredura salva no Obsidian (área compartilhada, não pertence a nenhum canal)

**Fluxo `/miro concorrentes F`:**
1. Lê `MiroYouTube/Canais/F/Referências.md`
2. Roda `miro-scanner.mjs --channel {ID}` pra cada referência
3. Roda `miro-analyzer.mjs --concorrentes --canal F`
4. Roda `miro-report.mjs --tipo concorrentes --canal F`
5. Output: Report salvo no Obsidian

**Fluxo `/miro criar canal G --nicho "..." --subnicho "..."`:**
1. Cria pasta `MiroYouTube/Canais/G/`
2. Cria: Perfil.md, Referências.md, Histórico.md, Metodologia.md, Estruturas.md, Vocabulário.md
3. Cria: dados.json, concorrentes.json (vazios)
4. Cria: pasta Reports/
5. Cria skill `/miro-G` (arquivo `.md` isolado)
6. Atualiza Dashboard.md
7. Output: "Canal G criado. Preenche Perfil.md e Referências.md"

### 5.2 `/miro-{X}` — O Estrategista (1 por canal, isolado)

**Regra de isolamento:** A skill `/miro-{X}` APENAS lê arquivos em `MiroYouTube/Canais/{X}/`. Não sabe que outros canais existem.

**Comandos:**

| Comando | O que faz |
|---|---|
| `/miro-{X} títulos` | Recomenda método + gera títulos com base nos dados do canal |
| `/miro-{X} importar varredura {data}` | Importa dados relevantes de uma varredura pro canal |
| `/miro-{X} status` | Mostra score atual, tendência, alertas |

**Fluxo `/miro-F títulos`:**
1. Lê APENAS `MiroYouTube/Canais/F/*` (isolamento total)
2. Lê `dados.json` → calcula saturação atual
3. Lê `Estruturas.md` → quais já usou e performance
4. Lê `Vocabulário.md` → palavras permitidas/proibidas
5. Lê `Metodologia.md` → regras específicas do canal
6. Decide método (1, 2 ou 3) com base nos dados
7. Apresenta recomendação com razão
8. Usuário aprova ou escolhe outro método
9. Gera títulos APENAS com o método escolhido
10. Aplica filtros: vocabulário, zona dourada, branding
11. Salva report em `MiroYouTube/Canais/F/Reports/`

### 5.3 Integração com skills existentes

```
/miro (O Diretor)           → Analisa, diagnostica
/miro-{X} (O Estrategista)  → Recomenda método, gera títulos
/gerente{X} (O Gerente)     → Executa produção (roteiro, thumb, etc.)
/analista-titulos            → Pode ser chamado pelo Estrategista pra análise profunda
/criador-titulos             → Pode ser chamado pelo Estrategista pra geração
/titulo-pipeline             → Substituído pelo fluxo Diretor → Estrategista
/sincronizador               → Chamado pelo Gerente (fase 3 da produção)
```

O `/titulo-pipeline` continua existindo como fallback para uso avulso (ex: analisar canal externo sem contexto MiroYouTube). O fluxo principal passa a ser:
`/miro` → `/miro-{X}` → `/gerente{X}`

O `/titulo-pipeline` é **deprecated** para canais que têm Estrategista ativo.

---

## 6. Fluxo Completo (Exemplo Real)

### Caso 1: Análise de saúde + novos títulos

```
Usuário: /miro saúde F
         (passa CSV do YouTube Studio)

Miro:    → Importa CSV, merge com dados existentes
         → Score: 2.1/10 🔴 CRÍTICO
         → Saturação interna: 0.12/1.0
         → Tendência: MORTO (impressões caíram 97%)
         → Branding: 38% (deveria ser 100%)
         → Salva report no Obsidian

Usuário: /miro-F títulos

Miro-F:  → Lê dados do Canal F (isolado)
         → Recomendação: "Método 3 (Do Zero)"
         → Razão: "Estrutura Personagem+Ação+Idade usada 18x, CTR caiu 35%"
         → Estruturas proibidas: [personagem+ação+idade]
         → Alerta: "NUNCA LO CONTÉ presente em apenas 38%"

Usuário: "ok, vai com método 3"

Miro-F:  → Gera 5 títulos com estrutura nova
         → Aplica filtros: vocabulário rural, zona dourada, "NUNCA LO CONTÉ"
         → Salva report no Obsidian

Usuário: /gerenteF
         "Faz roteiro pro título 2 da recomendação do Miro"

GerenteF: → Executa produção normal
```

### Caso 2: Varredura de nicho antes de criar canal novo

```
Usuário: /miro varrer --nicho "true crime espanol" --subnicho "cold cases resueltos"

Miro:    → Scanner busca nicho (amplo) + subnicho (zoom)
         → Nicho: 85 canais, saturação MÉDIA
         → Subnicho: 4 canais diretos, saturação BAIXA
         → Porta de entrada: ABERTA
         → Gap: ninguém faz cold cases com foco em DNA/forense
         → Salva varredura no Obsidian

Usuário: /miro criar canal G --nicho "true crime espanol" --subnicho "cold cases DNA"

Miro:    → Cria estrutura completa em MiroYouTube/Canais/G/
         → Cria skill /miro-G
         → "Canal G criado. Preenche Perfil.md e Referências.md"

Usuário: (preenche Perfil.md, Referências.md, Vocabulário.md, Metodologia.md)

Usuário: /miro-G títulos

Miro-G:  → Recomenda Método 1 (Variação) — canal novo, porta aberta
         → Gera títulos baseados no subnicho cold cases DNA
```

### Caso 3: Monitoramento de concorrentes

```
Usuário: /miro concorrentes F

Miro:    → Lê Referências.md do Canal F (3 canais definidos)
         → Scanner puxa dados atuais de cada referência
         → Analyzer compara: Canal F vs referências
         → "Canal @Fulano viralizou com estrutura X (180K views)
            Ninguém no teu subnicho usou essa estrutura ainda"
         → Salva report no Obsidian
```

---

## 7. API Keys e Custos

### YouTube Data API v3

```
16 keys disponíveis (buscar da VPS DigitalOcean)
Cada key: 10.000 units/dia
Total: 160.000 units/dia

Custo por operação:
- search.list = 100 units (retorna 50 resultados)
- channels.list = 1 unit
- videos.list = 1 unit (batch de 50)

Operações estimadas por dia:
- 1 varredura de nicho = ~500 units (5 queries × 100)
- 1 análise de canal = ~10 units (1 channel + ~5 video batches)
- 1 concorrentes (3 canais) = ~30 units

Margem: enorme — usa <1% da quota diária por operação
```

### keys.json

```json
{
  "keys": [
    { "key": "AIza...", "daily_used": 0, "last_reset": "2026-03-21" },
    { "key": "AIza...", "daily_used": 0, "last_reset": "2026-03-21" }
  ],
  "rotation_threshold": 0.8,
  "current_index": 0,
  "auto_reset": "daily_used resets to 0 when last_reset != today's date (checked at start of each scan)"
}
```

---

## 8. Dependências

```json
{
  "googleapis": "YouTube Data API v3 client",
  "csv-parse": "Parser de CSV do YouTube Studio",
  "fs/promises": "Leitura/escrita de arquivos (nativo Node)"
}
```

Zero dependência externa pesada. Sem Flask, sem Vue, sem Docker, sem Zep, sem CAMEL.

---

## 9. O que NÃO está no escopo da v1

- Simulação multi-agente (v2)
- Dashboard web (Obsidian é a interface)
- Monitoramento automático via cron (manual por design)
- Upload automático no YouTube
- Integração com YouTube Studio API (usa CSV exportado manualmente)
- Geração de thumbnails
- Geração de roteiros (isso é do Gerente)

---

## 10. Critérios de sucesso

1. `/miro saúde F` com CSV importado gera score correto e salva no Obsidian
2. `/miro varrer` com nicho+subnicho retorna canais reais via API com classificação
3. `/miro-F títulos` recomenda UM método com razão baseada em dados e gera títulos filtrados
4. Isolamento: `/miro-F` não acessa nenhum dado do Canal E
5. Histórico acumula ao longo do tempo — cada análise enriquece a próxima
6. Varredura de subnicho expande termos semanticamente similares
7. Key rotation funciona sem 403 errors
