// scripts/miro/miro-analyzer.mjs
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { parseArgs } from 'util';
import { parseCSV } from './lib/csv-parser.mjs';
import { calculateHealthScore, calcSaturation, recommendMethod } from './lib/score.mjs';

const VAULT = '/Users/jaci/Documents/Obsidian Vault/MiroYouTube';

const { values: args } = parseArgs({
  options: {
    import: { type: 'string' },
    canal: { type: 'string' },
    concorrentes: { type: 'boolean', default: false },
    recomendar: { type: 'boolean', default: false },
  },
});

if (!args.canal) { console.error('--canal required'); process.exit(1); }

const canalDir = join(VAULT, 'Canais', args.canal);

if (args.import) {
  await importCSV(args.import, args.canal);
} else if (args.concorrentes) {
  await analyzeConcorrentes(args.canal);
} else if (args.recomendar) {
  await recommend(args.canal);
} else {
  console.error('Usage: --import FILE | --concorrentes | --recomendar (+ --canal X)');
  process.exit(1);
}

async function importCSV(csvPath, canal) {
  console.error(`Importing CSV: ${csvPath} for canal ${canal}`);

  const videos = await parseCSV(csvPath);
  console.error(`Parsed ${videos.length} videos from CSV`);

  // Load existing dados.json
  const dadosPath = join(canalDir, 'dados.json');
  let dados = { channel_id: '', last_updated: '', videos: [], csv_imports: [] };
  try { dados = JSON.parse(await readFile(dadosPath, 'utf-8')); } catch {}

  // Merge: CSV data enriches existing entries or creates new
  let updated = 0, added = 0;
  for (const csvVideo of videos) {
    const existing = dados.videos.find(v =>
      v.id === csvVideo.id ||
      (v.title && csvVideo.title && v.title.toLowerCase() === csvVideo.title.toLowerCase())
    );
    if (existing) {
      // Merge CSV data into existing (CSV has CTR, impressions that API doesn't)
      if (csvVideo.views != null) existing.views = csvVideo.views;
      if (csvVideo.ctr != null) existing.ctr = csvVideo.ctr;
      if (csvVideo.impressions != null) existing.impressions = csvVideo.impressions;
      if (csvVideo.avg_view_duration != null) existing.avg_view_duration = csvVideo.avg_view_duration;
      if (csvVideo.subs_gained != null) existing.subs_gained = csvVideo.subs_gained;
      existing.source = 'csv';
      updated++;
    } else {
      dados.videos.push(csvVideo);
      added++;
    }
  }

  dados.last_updated = new Date().toISOString().split('T')[0];
  dados.csv_imports.push({
    date: dados.last_updated,
    file: csvPath.split('/').pop(),
    videos_updated: updated + added,
  });

  await writeFile(dadosPath, JSON.stringify(dados, null, 2));

  // Calculate health score
  const health = calculateHealthScore(dados.videos);
  const saturation = calcSaturation(dados.videos);

  const result = {
    imported: { updated, added, total: dados.videos.length },
    health,
    saturation,
  };

  console.log(JSON.stringify(result, null, 2));
}

async function analyzeConcorrentes(canal) {
  console.error(`Analyzing competitors for canal ${canal}`);

  const concPath = join(canalDir, 'concorrentes.json');
  let conc;
  try { conc = JSON.parse(await readFile(concPath, 'utf-8')); } catch {
    console.error(`No concorrentes.json found for canal ${canal}`);
    process.exit(1);
  }

  const dadosPath = join(canalDir, 'dados.json');
  let dados = { videos: [] };
  try { dados = JSON.parse(await readFile(dadosPath, 'utf-8')); } catch {}

  // Compare own performance vs competitors
  const ownAvgViews = dados.videos.length > 0
    ? dados.videos.reduce((a, v) => a + (v.views || 0), 0) / dados.videos.length
    : 0;

  const comparison = conc.channels.map(ch => {
    const avgViews = ch.videos.length > 0
      ? ch.videos.reduce((a, v) => a + v.views, 0) / ch.videos.length
      : 0;

    // Extract structures used by competitor
    const structures = {};
    for (const v of ch.videos) {
      if (v.structure) structures[v.structure] = (structures[v.structure] || 0) + 1;
    }

    return {
      name: ch.name,
      subs: ch.subs,
      avg_views: Math.round(avgViews),
      vs_own: ownAvgViews > 0 ? Math.round((avgViews / ownAvgViews - 1) * 100) : null,
      structures_used: structures,
      top_video: ch.videos.sort((a, b) => b.views - a.views)[0] || null,
    };
  });

  // Find gaps: structures competitors use that we don't
  const ownStructures = new Set(dados.videos.map(v => v.structure).filter(Boolean));
  const competitorStructures = new Set();
  for (const ch of conc.channels) {
    for (const v of ch.videos) {
      if (v.structure) competitorStructures.add(v.structure);
    }
  }
  const gaps = [...competitorStructures].filter(s => !ownStructures.has(s));

  const result = { comparison, gaps, own_avg_views: Math.round(ownAvgViews) };
  console.log(JSON.stringify(result, null, 2));
}

async function recommend(canal) {
  console.error(`Generating recommendation for canal ${canal}`);

  const dadosPath = join(canalDir, 'dados.json');
  let dados;
  try { dados = JSON.parse(await readFile(dadosPath, 'utf-8')); } catch {
    console.error(`No dados.json for canal ${canal}`);
    process.exit(1);
  }

  const concPath = join(canalDir, 'concorrentes.json');
  let conc = { channels: [] };
  try { conc = JSON.parse(await readFile(concPath, 'utf-8')); } catch {}

  const recommendation = recommendMethod(dados.videos, conc.channels);
  const saturation = calcSaturation(dados.videos);
  const health = calculateHealthScore(dados.videos);

  // Determine banned structures (used 5+ times)
  const freq = {};
  for (const v of dados.videos) {
    if (v.structure) freq[v.structure] = (freq[v.structure] || 0) + 1;
  }
  const banned = Object.entries(freq).filter(([_, count]) => count >= 5).map(([s]) => s);

  // Check branding compliance
  const withBranding = dados.videos.filter(v => v.has_branding === true).length;
  const brandingPct = dados.videos.length > 0 ? Math.round((withBranding / dados.videos.length) * 100) : 0;

  const result = {
    metodo_recomendado: recommendation.method,
    razao: recommendation.reason,
    prioridade: recommendation.priority,
    estruturas_proibidas: banned,
    saturation,
    health_score: health.score,
    health_status: health.status,
    branding_compliance: brandingPct,
  };

  console.log(JSON.stringify(result, null, 2));
}
