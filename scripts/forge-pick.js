#!/usr/bin/env node
/**
 * forge-pick.js — Sorteia combo Forge max-distance pra próximo EP de um canal.
 *
 * Lê forge-dna.json + forge-history.json do canal (Obsidian), gera todos os combos
 * válidos, exclui os que repetem camadas anti_repeticao.obrigatorias, escolhe o
 * de maior Hamming distance vs histórico, GRAVA no history.
 *
 * Uso:
 *   node scripts/forge-pick.js --canal E [--bucket longo] [--ep 18] [--dry-run]
 *
 * Output (stdout JSON):
 *   { combo: {...}, filtros: {...}, distancia_media: 9.2, candidatos_restantes: 412 }
 */

const fs = require('fs');
const path = require('path');

const LAYERS = [
  'D01_HOOK','D02_PERSPECTIVA','D03_ARQUITETURA','D04_TOM','D05_ARCO',
  'D06_MOTOR','D07_RITMO','D08_ANALOGIA','D09_TEMPORAL','D10_STAKES',
  'D11_PROVA','D12_TECNICA','D13_FECHAMENTO','D14_DISPOSITIVO'
];
const ALL_OPTS = ['A','B','C','D','E','F','G','H','I','J','K','L'];

function parseArgs() {
  const args = process.argv.slice(2);
  const cfg = { canal: null, bucket: null, ep: null, dryRun: false };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--canal') cfg.canal = args[++i];
    else if (args[i] === '--bucket') cfg.bucket = args[++i];
    else if (args[i] === '--ep') cfg.ep = parseInt(args[++i]);
    else if (args[i] === '--dry-run') cfg.dryRun = true;
  }
  if (!cfg.canal) { console.error('--canal obrigatório'); process.exit(1); }
  return cfg;
}

function channelPaths(canal) {
  const channelsJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config', 'channels.json'), 'utf-8'));
  const name = channelsJson[canal]?.name;
  if (!name) throw new Error(`Canal ${canal} não está em config/channels.json`);
  const base = path.join(process.env.HOME, 'Documents', 'Obsidian Vault', 'Projetos', 'Meus Canais', name);
  return {
    name,
    dna: path.join(base, 'forge-dna.json'),
    history: path.join(base, 'forge-history.json'),
  };
}

function readJson(p) { return JSON.parse(fs.readFileSync(p, 'utf-8')); }
function writeJson(p, obj) { fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n'); }

function allowedOptionsFor(dna, layer) {
  const allowed = dna.layers_allowed?.[layer];
  if (!allowed || allowed.length === 0) return ALL_OPTS;
  return allowed;
}

function pickRotating(values, history, key, window = 3) {
  // history: array of recent EP entries; key: 'tom' | 'intensidade' etc.
  const recent = history.slice(-window).map(e => e?.filtros?.[key]).filter(Boolean);
  const candidates = values.filter(v => !recent.includes(v));
  const pool = candidates.length > 0 ? candidates : values;
  return pool[Math.floor(Math.random() * pool.length)];
}

function hammingDistance(comboA, comboB) {
  let d = 0;
  for (const L of LAYERS) if (comboA[L] !== comboB[L]) d++;
  return d;
}

function main() {
  const cfg = parseArgs();
  const { name, dna: dnaPath, history: histPath } = channelPaths(cfg.canal);

  if (!fs.existsSync(dnaPath)) {
    console.error(`❌ DNA não encontrado: ${dnaPath}`);
    console.error(`   Copia docs/templates/forge-dna.template.json e edita.`);
    process.exit(1);
  }

  const dna = readJson(dnaPath);
  const hist = fs.existsSync(histPath) ? readJson(histPath) : { canal: cfg.canal, episodios: {} };
  const history = Object.values(hist.episodios || {}).filter(e => e.combo);

  // Bucket
  const bucket = cfg.bucket || dna.duracao?.default || 'medio';
  if (!dna.duracao?.permitidos?.includes(bucket)) {
    console.error(`❌ Bucket "${bucket}" não está em duracao.permitidos: ${dna.duracao?.permitidos}`);
    process.exit(1);
  }

  // Anti-repetição obrigatória — coleta valores já usados nessas camadas
  const obrigatorias = dna.anti_repeticao?.obrigatorias || ['D05_ARCO','D03_ARQUITETURA','D01_HOOK'];
  const usados = {};
  for (const L of obrigatorias) usados[L] = new Set(history.map(e => e.combo[L]).filter(Boolean));

  // Gera melhor combo via amostragem + max-distance (espaço é grande demais pra enumerar)
  const window = dna.anti_repeticao?.janela_max_distance || 10;
  const recent = history.slice(-window);

  const SAMPLES = 5000;
  let best = null, bestScore = -1, validCount = 0;
  for (let i = 0; i < SAMPLES; i++) {
    const combo = {};
    let ok = true;
    for (const L of LAYERS) {
      const opts = allowedOptionsFor(dna, L);
      let candidates = opts;
      if (obrigatorias.includes(L)) candidates = opts.filter(o => !usados[L].has(o));
      if (candidates.length === 0) { ok = false; break; }
      combo[L] = candidates[Math.floor(Math.random() * candidates.length)];
    }
    if (!ok) continue;
    validCount++;
    if (recent.length === 0) { best = combo; bestScore = 14; break; }
    const avgDist = recent.reduce((sum, e) => sum + hammingDistance(combo, e.combo), 0) / recent.length;
    if (avgDist > bestScore) { best = combo; bestScore = avgDist; }
  }

  if (!best) {
    console.error('❌ Nenhum combo válido — DNA esgotado nas camadas obrigatórias.');
    console.error('   Camadas anti-repetição:');
    for (const L of obrigatorias) {
      const opts = allowedOptionsFor(dna, L);
      const used = [...usados[L]];
      console.error(`   ${L}: permitidos ${opts.join(',')} — usados ${used.join(',') || '(nenhum)'}`);
    }
    process.exit(2);
  }

  // Filtros
  const filtros = { ...(dna.filtros_locked || {}) };
  for (const [k, vals] of Object.entries(dna.filtros_variable || {})) {
    filtros[k] = pickRotating(vals, history, k, 3);
  }

  const result = {
    canal: cfg.canal,
    ep: cfg.ep,
    duracao_bucket: bucket,
    combo: best,
    filtros,
    distancia_media: Number(bestScore.toFixed(2)),
    samples_validos: validCount,
  };

  // Grava no history (a menos que dry-run)
  if (!cfg.dryRun && cfg.ep != null) {
    hist.episodios = hist.episodios || {};
    const key = `EP${String(cfg.ep).padStart(3, '0')}`;
    hist.episodios[key] = {
      ep: cfg.ep,
      data: new Date().toISOString().slice(0, 10),
      duracao_bucket: bucket,
      combo: best,
      filtros,
    };
    writeJson(histPath, hist);
  }

  console.log(JSON.stringify(result, null, 2));
}

main();
