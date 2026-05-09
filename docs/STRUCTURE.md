# Estrutura de Pastas — LoopX V2

Três zonas separadas por responsabilidade. Cada coisa tem **um** lugar.

## 1. Código (este repo Git)

```
LoopX-Local-V2/
├── README.md
├── .gitignore
├── package.json
├── config/
│   ├── channels.json              # mapping CANAL → nome de pasta + voz + flow_project_id
│   └── voice-refs.json            # vozes TTS por canal (clones, refs)
├── scripts/
│   ├── flow-submit.js             # Fase 4 — submete prompts no Flow
│   ├── flow-download.js           # Fase 4 — baixa cenas
│   ├── pipeline-tts.sh            # Fase 2 — TTS + Whisper
│   ├── pipeline-full.sh           # F2-F5 não-interativo
│   ├── assemble.sh / download.sh  # Fase 5 — Hetzner
│   ├── forge-pick.js              # NOVO — sorteia combo Forge max-distance
│   ├── update-titulos.sh          # NOVO — auto-marking [ ]→[⏳]→[x]
│   └── ... (whisper, render-remotion, etc.)
├── skills/
│   ├── proximo-template/          # template skill /proximo-{x}
│   └── gerente-template/          # template skill /gerente{X}
├── docs/
│   ├── FORGE.md                   # DNA + history + algoritmo
│   ├── AUTOMATION.md              # princípio auto-mode
│   ├── PIPELINE-STATUS.md         # queries Dataview prontas
│   ├── STRUCTURE.md               # este ficheiro
│   ├── HETZNER.md / TTS.md
│   └── templates/
│       ├── forge-dna.template.json
│       ├── forge-history.template.json
│       ├── titulos.template.md
│       └── ep-readme.template.md
├── hetzner/                       # configs do servidor remoto
└── panel/ remotion-fe/            # frontends auxiliares (renders, painel)
```

**Não vai pro git:** `node_modules/`, `__pycache__/`, `*.log`, `**/Cenas/`, `**/audio.wav`, `**/final.mp4`, `assets/music/`, `.env`. Ver `.gitignore`.

## 2. Conteúdo (Obsidian, NÃO versionado)

```
~/Documents/Obsidian Vault/
├── Pipeline-Status.md             # board Dataview ao vivo
├── Daily/YYYY-MM-DD.md            # logs diários do pipeline
├── Decisões/ Aprendizados/ Playbooks/ Sessões/
└── Projetos/Meus Canais/
    └── {Nome do Canal}/           # ex: "Confesiones de las Abuelas"
        ├── Contexto.md            # identidade do canal
        ├── Titulos.md             # fila + estado (auto-marked)
        ├── Framework-Roteiros.md  # regras herdadas do gerente
        ├── Nomes-e-Locais-Usados.md
        ├── Voz-do-Canal.md        # anti-cópia (canais inspirados)
        ├── forge-dna.json         # DNA permitido
        ├── forge-history.json     # combos usados (auto-atualizado)
        ├── Thumbs/                # refs visuais
        └── EP{NNN} - Título Curto/
            ├── README.md          # frontmatter: fase, combo, datas
            ├── roteiro.md
            ├── thumb.md
            ├── desc.md
            ├── audio.wav  / audio.srt
            ├── cenas-minutagem.md
            ├── personagens.md
            ├── prompts-veo3.md
            ├── Cenas/
            │   ├── (Cena_001).mp4
            │   └── ...
            ├── final.mp4
            └── logs/
                └── pipeline.log
```

## 3. Servidor Hetzner

```
/root/loopx-local/jobs/
└── {CANAL}/{NUM}/                 # ex: E/18/
    ├── Cenas/                     # rsync'd do Mac
    ├── audio.wav, audio.srt
    ├── raw.mp4                    # antes do pós-processamento
    └── final.mp4                  # antes do upload R2
```

## Convenções

| Item | Padrão |
|------|--------|
| Nome de pasta de EP | `EP{NNN} - {Título curto}` (3 dígitos zero-padded) |
| Nome de cena | `(Cena_NNN).mp4` ou `(Cena_NNN).jpg` |
| Frontmatter EP | obrigatório `ep`, `canal`, `fase`, `atualizado`, `combo` |
| Pasta de EP | só ficheiros do EP — sem `final/no-music/format-vN` |
| Slug | minúsculas, sem acento, sem espaços (gerado do título) |
