# Narrative Forge — Integração com LoopX

A Forge (`/Users/jaci/Documents/FORGE/narrative-forge-v3.jsx`) é uma engine de variação narrativa: **14 camadas × 12 opções = 1.28 trilhões de combos** + 11 filtros condicionais. No LoopX V2 ela é a fonte de **identidade controlada** de cada canal.

## 🧬 Por canal: 2 ficheiros

```
Obsidian/Projetos/Meus Canais/{Canal}/
├── forge-dna.json       # subset PERMITIDO (a "voz" do canal)
└── forge-history.json   # combos JÁ USADOS por EP
```

Ambos seguem os templates em `docs/templates/`.

## DNA (`forge-dna.json`)

Define o que o canal **pode** fazer:

- **`filtros_locked`** — filtros que NUNCA mudam (ex: pessoa narrativa = 1ª pessoa, audiência = maduro)
- **`filtros_variable`** — filtros que rotacionam (ex: tom alterna entre nostalgia/triste/esperança)
- **`duracao`** — quais buckets aceita + bucket padrão
- **`layers_allowed`** — quais opções (A-L) cada camada D01-D14 pode usar (vazio = todas)
- **`anti_repeticao`** — camadas obrigatórias de variar + janela de comparação

**Por que existir:** sem DNA, a Forge gera combos aleatórios — cada EP do mesmo canal teria voz diferente. Com DNA, o canal mantém identidade enquanto rotaciona arcos.

## Histórico (`forge-history.json`)

Lista de combos já usados por EP. **Atualizado automaticamente** pelo `forge-pick.js` após gerar cada EP.

## Algoritmo Max-Distance

Quando `/gerente{X}` precisa gerar EP novo:

1. **Lê DNA + history** do canal
2. **Filtra opções**: cada camada só aceita valores em `layers_allowed[D]`
3. **Filtra duração**: bucket dentro de `permitidos`, sem repetir nas últimas `rotacao_janela` EPs
4. **Para cada combo candidato**, calcula Hamming distance vs últimas N entradas do history (N = `janela_max_distance`)
5. **Anti-repetição absoluta**: camadas em `anti_repeticao.obrigatorias` (default: D05_ARCO, D03_ARQUITETURA, D01_HOOK) **nunca** repetem valores já usados no histórico inteiro
6. **Escolhe** o combo com maior distância média
7. **Grava** no history antes de chamar a Fase 1

Se nenhum combo válido restar (todos esgotados dentro do DNA): **AVISA a Jaci**, não inventa fora do DNA, não repete.

## Buckets de Duração

| Bucket | Min | Palavras | Cenas (~7s) | Custo Flow estimado |
|--------|-----|----------|-------------|---------------------|
| curto    | 8-15  | 1500   | 90  | ~90 prompts |
| medio    | 15-30 | 3000   | 180 | ~180 prompts |
| longo    | 30-60 | 6000   | 360 | ~360 prompts |
| maraton  | 60+   | 10000  | 600 | ~600 prompts |

**Fórmula:** `palavras = duracao_min × 100` (taxa narração 100 wpm para perfil maduro). Pipeline avisa se `audio_duration` sair ±10% do alvo.

## Comando de uso

```bash
# Sortear combo pra próximo EP do canal E
node scripts/forge-pick.js --canal E --bucket longo

# Output: { combo: {...}, filtros: {...}, distancia_media: 9.2 }
```

`/gerente{X}` chama isso internamente — tu nunca precisa rodar à mão.

## Editar o DNA depois

Sim, pode. O history não muda. Próxima geração usa o novo DNA — combos antigos continuam contando para anti-repetição (são fatos do passado).

**Cuidado:** se restringires demais o `layers_allowed`, podes esgotar combos válidos rápido. A Forge avisa quando estás abaixo de 20 combos restantes.
