# Skills — Claude Code

Skills são prompts especializados que o Claude Code executa. Ficam em `~/.claude/commands/` e são invocadas com `/nome-da-skill`.

## Instalação

Copiar todos os `.md` da pasta `skills/` do repo pra pasta de commands do Claude Code:

### Mac
```bash
cp skills/*.md ~/.claude/commands/
```

### Windows
```powershell
Copy-Item skills\*.md $env:USERPROFILE\.claude\commands\
```

---

## Skills incluídas

### Skills de produção (usam-se direto)

#### `/sincronizador` — Sincronizador de Prompts VEO 3.1
**Quando usar:** Depois que o áudio TTS estiver pronto e a minutagem gerada.
**O que faz:**
- Recebe roteiro + cenas com minutagem
- Identifica personagens e cria fichas (Personagem001, 002...)
- Gera 1 prompt VEO 3.1 por cena (~600 prompts por episódio)
- Descrição física COMPLETA em toda aparição
- Tags: No Blood, No Nudity obrigatórios
- Tipos de plano variados (wide, close-up, tracking...)
**Fase:** 3

#### `/analista-titulos` — Analista de Títulos YouTube 2026
**Quando usar:** Pra analisar um canal de referência antes de criar títulos.
**O que faz:**
- Analisa 10-20 títulos com views
- Extrai estruturas vencedoras e gatilhos emocionais
- Identifica gaps de mercado
- Produz briefing estruturado pro Criador
- NÃO gera títulos — só diagnostica
**Fase:** 0

#### `/criador-titulos` — Criador de Títulos YouTube 2026
**Quando usar:** Depois de receber o briefing do Analista.
**O que faz:**
- Gera 20 títulos usando 3 métodos:
  - Método 1: Variação (10 títulos)
  - Método 2: Subnichar (5 títulos)
  - Método 3: Do zero (5 títulos)
- Rankeia por potencial
- Monta plano de ação (primeiros 5 vídeos, teste 48h, pivô)
- NÃO analisa — só cria com base no briefing
**Fase:** 0

#### `/titulo-pipeline` — Orquestrador de Títulos
**Quando usar:** Pra rodar análise + criação de títulos de uma vez.
**O que faz:**
- Executa 5 fases em sequência:
  1. Analista pesquisa e diagnostica
  2. Debate interno (validação)
  3. Criador gera 20 títulos
  4. Revisão cruzada (Analista valida os títulos)
  5. Entrega final rankeada
**Fase:** 0

---

### Skills de REFERÊNCIA (templates — NÃO são regras)

> **IMPORTANTE:** Os gerentes E e F são **exemplos reais** de como se monta um gerente de canal.
> NÃO são pra usar diretamente (a menos que trabalhes nesses canais).
> Servem como **template** pra criar o gerente do TEU canal.

#### `gerenteE.md` — REFERÊNCIA: Canal E (Confesiones de las Abuelas)
Exemplo de gerente para canal de **nicho urbano, espanhol, confessional**.
Mostra como definir: zona dourada de títulos, vocabulário, personagens, thumbnails, estrutura narrativa (10-12 blocos), regras anti-saturação.

#### `gerenteF.md` — REFERÊNCIA: Canal F (Abuela Recuerda)
Exemplo de gerente para canal de **nicho rural, espanhol, mesma persona fixa**.
Mostra como diferenciar dois canais do mesmo dono: vocabulário diferente, cenários diferentes, branding diferente.

---

## Criar o gerente do TEU canal

O gerente é a skill mais importante — é ele que define a identidade do canal e gera todo o conteúdo.

### Passo a passo

1. **Copiar o template:** Pegar `skills/gerenteE.md` como base
2. **Renomear:** `gerenteX.md` (ex: `gerenteG.md`, `gerenteMeuCanal.md`)
3. **Editar TUDO** que é específico — não deixar nada do Canal E:

| Secção | O que definir |
|--------|--------------|
| Identidade | Nome do canal, handle, idioma, nicho, subnicho |
| Diferenciação | Como se distingue de canais similares |
| Títulos | Zona dourada: palavras permitidas, proibidas, fórmulas, defesa plausível |
| Thumbnails | Templates (T1-T6), cores, fonte, rotação |
| Personagens | Profissões, idades, cenários típicos do nicho |
| Vocabulário | Palavras do nicho (urbano vs rural vs tech vs etc.) |
| Narrativa | Blocos, palavras por bloco, tom, pessoa (1ª/3ª), abertura |
| Anti-saturação | Regras de rotação (títulos, temas, thumbs) |
| Ficheiros | 8 ficheiros obrigatórios por episódio |
| Paths | Pasta no Obsidian vault |

4. **Instalar:** Copiar pra `~/.claude/commands/`
5. **Testar:** Abrir Claude Code e digitar `/gerenteX`

### Exemplo de adaptação

Canal E (confessional espanhol urbano) → Canal G (horror stories inglês):

| E (referência) | G (novo canal) |
|----------------|----------------|
| Espanhol | Inglês |
| 1ª pessoa confessional | 1ª pessoa terror |
| Urbano (casa, consultório) | Lugares abandonados (hospital, escola) |
| Señor de 80, plomero, doctor | Shadow figure, stranger, old man |
| "ME AGARRÓ TAN FUERTE" | "I SHOULD NEVER HAVE OPENED THAT DOOR" |
| Zona dourada: duplo sentido sexual | Zona dourada: terror psicológico vs real |
| Thumbs: rosto idosa + texto quente | Thumbs: rosto assustado + ambiente escuro |

### Dica

Quanto mais detalhado for o gerente, melhor o Claude gera. O gerenteE tem 366 linhas — isso é proposital. Cada regra, cada exemplo, cada restrição ajuda o Claude a acertar de primeira sem precisar corrigir.
