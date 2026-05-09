// scripts/miro/miro-report.mjs
import { readFile, writeFile, appendFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { parseArgs } from 'util';

const VAULT = '/Users/jaci/Documents/Obsidian Vault/MiroYouTube';

const { values: args } = parseArgs({
  options: {
    tipo: { type: 'string' },
    canal: { type: 'string' },
    input: { type: 'string' },
    nicho: { type: 'string' },
  },
});

// Read JSON data from file or stdin
let data;
if (args.input) {
  data = JSON.parse(await readFile(args.input, 'utf-8'));
} else {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  data = JSON.parse(Buffer.concat(chunks).toString());
}

const today = new Date().toISOString().split('T')[0];

if (args.tipo === 'saude' && args.canal) {
  await reportSaude(data, args.canal);
} else if (args.tipo === 'concorrentes' && args.canal) {
  await reportConcorrentes(data, args.canal);
} else if (args.tipo === 'varredura' && args.nicho) {
  await reportVarredura(data, args.nicho);
} else {
  console.error('Usage: --tipo saude|concorrentes|varredura --canal X | --nicho "term"');
  process.exit(1);
}

async function reportSaude(data, canal) {
  const reportsDir = join(VAULT, 'Canais', canal, 'Reports');
  await mkdir(reportsDir, { recursive: true });

  // Support both formats: full health object (from --import) or flat (from --recomendar)
  const h = data.health || {
    score: data.health_score,
    status: data.health_status,
    emoji: data.health_score >= 8 ? '🟢' : data.health_score >= 5 ? '🟡' : '🔴',
    components: {},
  };
  const s = data.saturation || {};
  const emoji = h.emoji || (h.score >= 8 ? '🟢' : h.score >= 5 ? '🟡' : h.score != null ? '🔴' : '❓');
  const trend = h.components?.trend?.score >= 7 ? '↗ Subindo'
    : h.components?.trend?.score >= 4 ? '→ Estável'
    : h.components?.trend?.score >= 1 ? '↘ Caindo' : '↓ Morto';

  const report = `# ${emoji} Análise de Saúde — Canal ${canal}

**Data:** ${today}
**Score:** ${h.score}/10 (${h.status})

---

## Score Detalhado

| Componente | Score | Peso | Detalhe |
|---|---|---|---|
| Tendência de impressões | ${h.components?.trend?.score || '?'}/10 | 3 | ${trend} |
| Diversidade de estruturas | ${h.components?.diversity?.score || '?'}/10 | 2 | ${h.components?.diversity?.unique || '?'} estruturas únicas |
| CTR médio | ${h.components?.ctr?.score || '?'}/10 | 2 | ${h.components?.ctr?.avg || '?'}% |
| Branding | ${h.components?.branding?.score || '?'}/10 | 1 | |
| Frequência | ${h.components?.frequency?.score || '?'}/10 | 1 | |

## Saturação

| Métrica | Valor |
|---|---|
| Score diversidade | ${s.score || '?'} |
| Estrutura dominante | ${s.dominant || 'N/A'} |
| Vezes usada | ${s.dominant_count || 0} |
| Consecutivas | ${s.consecutive || 0} |
| Estruturas únicas | ${s.unique_structures || 0} |

## Dados Importados

- Vídeos atualizados: ${data.imported?.updated || 0}
- Vídeos adicionados: ${data.imported?.added || 0}
- Total no banco: ${data.imported?.total || 0}

---

#miroyoutube #saude #canal-${canal.toLowerCase()}
`;

  const filename = `${today} - Análise Saúde.md`;
  await writeFile(join(reportsDir, filename), report);
  console.log(`Report saved: ${join(reportsDir, filename)}`);

  // Update Histórico.md
  const histPath = join(VAULT, 'Canais', canal, 'Histórico.md');
  const histLine = `| ${today} | ${h.score} | ${h.components?.trend?.score >= 4 ? '?' : '?'} | ${s.dominant || 'N/A'} | ${s.score < 0.3 ? 'CRÍTICA' : s.score < 0.6 ? 'ALTA' : s.score < 0.8 ? 'MÉDIA' : 'BAIXA'} | ${h.status === 'CRITICO' ? '🔴 ' + trend : h.status === 'ATENCAO' ? '⚠️ ' + trend : '—'} |\n`;

  try {
    await readFile(histPath, 'utf-8');
    await appendFile(histPath, histLine);
  } catch {
    const histHeader = `# Histórico — Canal ${canal}\n\n| Data | Score | Impr/vídeo | Estrutura dominante | Saturação | Alerta |\n|------|-------|-----------|---------------------|-----------|--------|\n${histLine}`;
    await writeFile(histPath, histHeader);
  }

  // Update Dashboard.md
  await updateDashboard(canal, h, s, trend, filename);
}

async function reportConcorrentes(data, canal) {
  const reportsDir = join(VAULT, 'Canais', canal, 'Reports');
  await mkdir(reportsDir, { recursive: true });

  let compTable = '| Canal | Subs | Views média | vs Nosso | Top vídeo |\n|---|---|---|---|---|\n';
  for (const c of data.comparison || []) {
    const topTitle = c.top_video ? c.top_video.title.slice(0, 50) + '...' : 'N/A';
    const vsOwn = c.vs_own != null ? `${c.vs_own > 0 ? '+' : ''}${c.vs_own}%` : 'N/A';
    compTable += `| ${c.name} | ${c.subs} | ${c.avg_views} | ${vsOwn} | ${topTitle} |\n`;
  }

  const gaps = (data.gaps || []).map(g => `- ${g}`).join('\n') || '- Nenhum gap identificado';

  const report = `# Análise de Concorrentes — Canal ${canal}

**Data:** ${today}
**Views média nosso canal:** ${data.own_avg_views || '?'}

---

## Comparativo

${compTable}

## Gaps de Mercado (estruturas que eles usam e nós não)

${gaps}

---

#miroyoutube #concorrentes #canal-${canal.toLowerCase()}
`;

  const filename = `${today} - Análise Concorrentes.md`;
  await writeFile(join(reportsDir, filename), report);
  console.log(`Report saved: ${join(reportsDir, filename)}`);
}

async function reportVarredura(data, nicho) {
  const varDir = join(VAULT, 'Varreduras');
  await mkdir(varDir, { recursive: true });

  const directChannels = (data.channels || []).filter(c => c.is_subniche);
  const adjacentChannels = (data.channels || []).filter(c => !c.is_subniche && !c.has_traction);
  const tractionChannels = (data.channels || []).filter(c => c.has_traction);

  let directTable = directChannels.length > 0
    ? '| Canal | Subs | Views total | Idade (dias) |\n|---|---|---|---|\n' + directChannels.map(c => `| ${c.name} | ${c.subs} | ${c.total_views} | ${c.age_days} |`).join('\n')
    : 'Nenhum canal direto encontrado.';

  let tractionTable = tractionChannels.length > 0
    ? '| Canal | Subs | Views total | Idade (dias) |\n|---|---|---|---|\n' + tractionChannels.map(c => `| ${c.name} | ${c.subs} | ${c.total_views} | ${c.age_days} |`).join('\n')
    : 'Nenhum canal novo com tração.';

  const satNiche = data.total_channels > 50 ? 'ALTA' : data.total_channels > 20 ? 'MÉDIA' : 'BAIXA';
  const satSub = data.subniche_channels > 10 ? 'ALTA' : data.subniche_channels > 3 ? 'MÉDIA' : 'BAIXA';
  const porta = satSub === 'BAIXA' ? 'ABERTA' : satSub === 'MÉDIA' ? 'FECHANDO' : 'FECHADA';

  const report = `# Varredura de Nicho — ${nicho}

**Data:** ${today}
**Subnicho:** ${data.subnicho || 'N/A'}
**Termos usados:** ${(data.terms_used || []).join(', ')}

---

## Resumo

| Métrica | Valor |
|---|---|
| Total canais no nicho | ${data.total_channels} |
| Canais no subnicho | ${data.subniche_channels} |
| Canais novos com tração | ${data.new_with_traction} |
| Saturação nicho | ${satNiche} |
| Saturação subnicho | ${satSub} |
| Porta de entrada | **${porta}** |

## Concorrentes Diretos (subnicho)

${directTable}

## Canais Novos com Tração (<${data.channels?.[0]?.age_days || 90} dias)

${tractionTable}

## Canais Adjacentes (mesmo nicho, outro subnicho)

Total: ${adjacentChannels.length} canais

---

#miroyoutube #varredura #${nicho.replace(/\s+/g, '-').toLowerCase()}
`;

  const filename = `${today} - ${nicho.replace(/[^a-zA-Z0-9áéíóúñ ]/g, '')}.md`;
  await writeFile(join(varDir, filename), report);
  console.log(`Report saved: ${join(varDir, filename)}`);
}

async function updateDashboard(canal, health, saturation, trend, reportFile) {
  const dashPath = join(VAULT, 'Dashboard.md');

  // Simple approach: rewrite dashboard
  // In production, would parse and update specific row
  try {
    let content = await readFile(dashPath, 'utf-8');
    // For now, just log that dashboard needs manual update
    console.log(`Dashboard update: Canal ${canal} = ${health.emoji} ${health.score} ${trend}`);
  } catch {
    // Create initial dashboard
    const dashboard = `# MiroYouTube — Dashboard

Última atualização: ${today}

## Canais Ativos
| Canal | Score | Tendência | Última Análise |
|-------|-------|-----------|----------------|
| [[Canais/${canal}/Perfil\\|${canal}]] | ${health.emoji} ${health.score} | ${trend} | [[${reportFile.replace('.md', '')}]] |

## Links Rápidos
- [[Metodologia-Titulos-YouTube-2026]]
`;
    await writeFile(dashPath, dashboard);
    console.log(`Dashboard created: ${dashPath}`);
  }
}
