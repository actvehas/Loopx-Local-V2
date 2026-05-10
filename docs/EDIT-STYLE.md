# Edit Style — Identidade Visual por Canal

Cada canal carrega o próprio estilo de edição em `Obsidian/Projetos/Meus Canais/{Canal}/edit-style/`. **Esse estilo nunca cruza para outro canal.** O repo só fornece templates esqueleto que tu copias e edita.

## Setup (Fase 0 do canal)

```bash
# No onboarding de um canal novo, copia o esqueleto:
cp -r ~/Documents/LoopX-Local-V2/docs/templates/edit-style \
      "$HOME/Documents/Obsidian Vault/Projetos/Meus Canais/{Canal}/edit-style"

# Depois edita os ficheiros pra dar a cara do canal.
```

## Estrutura

```
{Canal}/edit-style/
├── style.json              # tokens (cores, fontes, durações, toggles)
├── intro.html              # template da intro (3-5s)
├── outro.html              # template do outro (3s, quote final)
├── overlays/
│   └── chapter-verb.html   # overlay opcional (capítulo + verbo destacado)
└── README.md               # documenta o estilo do canal
```

## `style.json` — tokens do canal

Campos principais:

| Campo | O que faz |
|-------|-----------|
| `palette.fg` / `fg_dim` / `accent` / `bg` | cores principais (hex/rgba) |
| `fonts.title` / `context` / `stamp` / `quote` | fontes do Google Fonts |
| `decorations.letterbox` / `vignette` / `grain` | toggles de pós-processamento |
| `decorations.letterbox_h` / `grain_alpha` | intensidades |
| `overlays_enabled.*` | quais overlays gerar (intro, outro, chapters, stamps, …) |
| `intro.*` | placeholders + duração da intro card |
| `outro.*` | placeholders + duração do outro |
| `verb_style.*` | tamanho/glow do verbo destacado |
| `transitions.*` | timings GSAP |

**Placeholders dinâmicos** (substituídos pelo `hyperframes-render.sh`):
- `{ep}` → número do EP zero-padded (`018`)
- `{CHANNEL_TITLE}` → `nome` do canal em maiúsculas
- `{tagline}` → título do EP (do `Titulos.md`)
- `{duration}` → duração do EP em `MM:SS`
- `{handle}` → letra do canal
- `{year}` → ano corrente
- `{quote}` / `{quote_author}` → preenchidos por skill futura, ou hardcoded

## Templates HTML

Cada template é um documento HyperFrames completo com **placeholders `{{VAR}}`** entre chaves duplas. O `hyperframes-render.sh` faz substituição literal por `style.json` + frontmatter do EP.

Variáveis comuns disponíveis: `{{FG}}`, `{{FG_DIM}}`, `{{BG}}`, `{{LETTERBOX_H}}`, `{{FONT_TITLE}}`, `{{FONT_SUB}}`, `{{FONT_PRE}}`, `{{DURATION}}`, `{{FONTS_LINK}}`.

Variáveis específicas do `intro.html`: `{{PRE}}`, `{{TITLE}}`, `{{SUBTITLE}}`, `{{POST}}`, `{{RULE_WIDTH}}`.
Variáveis específicas do `outro.html`: `{{QUOTE}}`, `{{ATTRIBUTION}}`, `{{CREDIT_1}}`, `{{CREDIT_2}}`.

## Como rodar manualmente

```bash
# Renderiza intro.mp4 + outro.mp4 do EP18 do Canal E
./scripts/hyperframes-render.sh E 18

# Outputs:
#   Obsidian/.../{Canal E}/EP018 - .../overlays/intro.mp4
#   Obsidian/.../{Canal E}/EP018 - .../overlays/outro.mp4
```

## Integração com a Fase 5

`assemble.sh` chama automaticamente o `hyperframes-render.sh` antes de fazer rsync das cenas — se o canal tem `edit-style/` configurado, intro/outro vão pra Hetzner junto. Se não tem, pipeline pula sem reclamar (skip silencioso).

Na Hetzner, o assembly final precisa **consumir** `overlays/intro.mp4` (concat no início) e `overlays/outro.mp4` (concat no fim). Fica como TODO no `assembly/assemble.js` — o user implementa quando quiser ativar.

## Princípios

- **Isolamento absoluto**: `hyperframes-render.sh` só lê do `--style $STYLE_DIR` do canal alvo. Nenhum canal vê configuração de outro.
- **Editável a qualquer momento**: muda `style.json` ou os HTML, próxima Fase 5 já usa o novo estilo. EPs antigos não são afetados.
- **Fail loud**: se faltar `edit-style/`, o pipeline só pula o passo (sem intro/outro). Se faltar o template (`intro.html` referenciado mas ausente), o `hyperframes-render.sh` falha com erro claro.
- **Sem overlays default**: nenhum canal "novo" recebe estilo. Tu copia o esqueleto e cria a identidade. Ausência = sem overlay.
