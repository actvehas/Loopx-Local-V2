# Pipeline Status — Dataview

`Pipeline-Status.md` na raiz do vault Obsidian renderiza um board ao vivo de todos os EPs em todos os canais. Atualiza sozinho — fonte da verdade é o frontmatter dos `README.md` de cada EP.

## Pré-requisito

Plugin **Dataview** instalado e habilitado no Obsidian (Settings → Community plugins → Browse → "Dataview").

## Setup

Cria `~/Documents/Obsidian Vault/Pipeline-Status.md` com o conteúdo abaixo.

````markdown
# 📊 Pipeline Status

## 🎬 Em produção (todos os canais)

```dataview
TABLE WITHOUT ID
  ("[" + canal + "] EP" + ep) AS "EP",
  titulo AS "Título",
  fase AS "Fase",
  duracao_bucket AS "Bucket",
  atualizado AS "Atualizado"
FROM "Projetos/Meus Canais"
WHERE fase != "0-fila" AND fase != null AND publicado = null
SORT atualizado DESC
```

## 📋 Fila (próximos)

```dataviewjs
const channels = dv.pages('"Projetos/Meus Canais"').where(p => p.file.name === "Titulos");
const rows = [];
for (const t of channels) {
  const lines = (await dv.io.load(t.file.path)).split('\n');
  for (const line of lines) {
    const m = line.match(/^- \[ \] (EP\d+)\s+—\s+(.+?)(\s+\[|$)/);
    if (m) rows.push([t.file.folder, m[1], m[2]]);
  }
}
dv.table(["Canal", "EP", "Título"], rows);
```

## ⚠️ Travados há +24h

```dataview
TABLE WITHOUT ID
  ("[" + canal + "] EP" + ep) AS "EP",
  titulo AS "Título",
  fase AS "Fase",
  atualizado AS "Última atividade"
FROM "Projetos/Meus Canais"
WHERE fase != "0-fila" AND fase != null AND publicado = null
  AND date(now) - date(atualizado) > dur(24 hours)
SORT atualizado ASC
```

## ✅ Publicados (últimos 30 dias)

```dataview
TABLE WITHOUT ID
  ("[" + canal + "] EP" + ep) AS "EP",
  titulo AS "Título",
  publicado AS "Publicado",
  views7d AS "Views 7d"
FROM "Projetos/Meus Canais"
WHERE publicado != null
  AND date(now) - date(publicado) < dur(30 days)
SORT publicado DESC
```

## Por canal — resumo

```dataview
TABLE WITHOUT ID
  canal AS "Canal",
  length(rows) AS "Total EPs",
  length(filter(rows, r => r.publicado != null)) AS "Publicados",
  length(filter(rows, r => r.fase != "0-fila" AND r.publicado = null)) AS "Em produção"
FROM "Projetos/Meus Canais"
WHERE ep != null
GROUP BY canal
```
````

## Como o frontmatter é mantido

Cada script de fase atualiza `fase:` e `atualizado:` no `README.md` do EP via `sed`/`yq`:

```bash
# Exemplo dentro de pipeline-tts.sh, ao terminar
yq -i ".fase = \"2-tts\" | .atualizado = \"$(date +%Y-%m-%d)\"" \
   "$EPISODE_DIR/README.md"
```

(Se `yq` não estiver instalado: `brew install yq` no Mac.)

## Códigos de fase

- `0-fila` — apenas título escolhido, nada gerado
- `1-roteiro` — Fase 1 concluída
- `2-tts` — Fase 2 concluída
- `3-sync` — Fase 3 concluída
- `4-flow` — Fase 4 em andamento ou concluída
- `5-assembly` — Fase 5 em andamento
- `done` — `final.mp4` baixado, mas ainda não publicado
- (campo `publicado` preenchido) — saiu do board "em produção"
