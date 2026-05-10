# Edit Style — Template do Canal

Esta pasta é o **esqueleto** que tu copia pra dentro de cada canal:

```bash
cp -r ~/Documents/LoopX-Local-V2/docs/templates/edit-style \
      "$HOME/Documents/Obsidian Vault/Projetos/Meus Canais/{Nome do Canal}/edit-style"
```

Depois edita `style.json` + os `.html` pra dar identidade visual única.

## Ficheiros

- `style.json` — tokens (cor, fonte, duração, toggles)
- `intro.html` — title card de abertura (3-5s)
- `outro.html` — quote final + créditos (3s)
- `overlays/chapter-verb.html` — overlay opcional por bloco do roteiro

Doc completa: `docs/EDIT-STYLE.md` no repo.

## Princípio

**Cada canal tem o próprio `edit-style/`. Nada cruza.** O `hyperframes-render.sh` só lê do canal alvo.
