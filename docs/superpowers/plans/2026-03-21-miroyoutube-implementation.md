# MiroYouTube Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a YouTube channel intelligence system that scans competitors via API, analyzes channel health from CSV data, recommends title methods, and outputs everything to Obsidian.

**Architecture:** Three Node.js scripts (scanner, analyzer, reporter) orchestrated by Claude Code skills (`/miro`, `/miro-E`, `/miro-F`). Data persists as JSON + Markdown in the Obsidian vault. YouTube API v3 with 16-key rotation.

**Tech Stack:** Node.js (ESM), googleapis npm package, csv-parse, fs/promises. No server, no DB, no Docker.

**Spec:** `docs/superpowers/specs/2026-03-21-miroyoutube-design.md`

---

## File Structure

### Scripts (LoopX-Local)
```
scripts/miro/
├── miro-scanner.mjs        — YouTube API v3 scanner (channel + niche/sub-niche)
├── miro-analyzer.mjs       — CSV import, health score, method recommendation
├── miro-report.mjs         — Generate .md reports for Obsidian
├── keys.json               — 16 API keys with rotation tracking
└── lib/
    ├── youtube-api.mjs      — API client with key rotation
    ├── score.mjs            — Health score calculation (0-10)
    └── csv-parser.mjs       — YouTube Studio CSV parser
```

### Skills (LoopX-Local + symlinks)
```
skills/
├── miro.md                 — O Diretor (Skill Mãe)
├── miro-E.md               — O Estrategista Canal E
└── miro-F.md               — O Estrategista Canal F

~/.claude/commands/         — Symlinks to skills/
├── miro.md → skills/miro.md
├── miro-E.md → skills/miro-E.md
└── miro-F.md → skills/miro-F.md
```

### Obsidian Vault
```
MiroYouTube/
├── Dashboard.md
├── Canais/
│   ├── E/
│   │   ├── Perfil.md, Referências.md, Histórico.md
│   │   ├── Metodologia.md, Estruturas.md, Vocabulário.md
│   │   ├── dados.json, concorrentes.json
│   │   └── Reports/
│   └── F/
│       └── (same structure)
└── Varreduras/
```

---

## Task 1: Dependencies & keys.json

**Files:**
- Modify: `package.json`
- Create: `scripts/miro/keys.json`

- [ ] **Step 1: Install dependencies**

```bash
cd /Users/jaci/Documents/LoopX-Local
npm install googleapis csv-parse
```

- [ ] **Step 2: Create keys.json with 16 API keys**

Create `scripts/miro/keys.json`:

```json
{
  "keys": [
    { "key": "AIzaSyA_L0BzylmmABGMZ9iPwivZmXNn0kBHyW8", "daily_used": 0, "last_reset": "" },
    { "key": "AIzaSyDfM2nskL3cjLSiA-AY7rBuGjzHiRE5GzE", "daily_used": 0, "last_reset": "" },
    { "key": "AIzaSyCz3N-pTq8sW0GHwXRcGAyeyUoqyk43780", "daily_used": 0, "last_reset": "" },
    { "key": "AIzaSyDvgGcG8-81qTu6QgpjwYqVlTDR-rA0Yqc", "daily_used": 0, "last_reset": "" },
    { "key": "AIzaSyAqjSV0J8JtjzFJieq9RhSeKooImoiraqo", "daily_used": 0, "last_reset": "" },
    { "key": "AIzaSyCK-bbJO3OGssKiljuyZS9RR7d6avg1vj8", "daily_used": 0, "last_reset": "" },
    { "key": "AIzaSyCshonQUWqTymXsGPCjGdsM3O3JuuanMnw", "daily_used": 0, "last_reset": "" },
    { "key": "AIzaSyDFwa5iQ0PTXquc-2wkXKEgZW1BUQaC50c", "daily_used": 0, "last_reset": "" },
    { "key": "AIzaSyA54-u_nScKnimjFveeJY8XyrhchEzq6-o", "daily_used": 0, "last_reset": "" },
    { "key": "AIzaSyAI0ut1ibtMIrRR8nZZ8uh1V3KHCs--VBk", "daily_used": 0, "last_reset": "" },
    { "key": "AIzaSyDFLMdSc5LhKLRR0q8ZkZ2il1dsSOHaZpc", "daily_used": 0, "last_reset": "" },
    { "key": "AIzaSyCsJEL33yX6Qi460fxUl0vB301mdYZM_Oo", "daily_used": 0, "last_reset": "" },
    { "key": "AIzaSyCax4uv2cuAK9maGvZEPhm8EEjPX5nOJbw", "daily_used": 0, "last_reset": "" },
    { "key": "AIzaSyBrKx57_ld7wA9TE0WFY-LppnVIdKmQrDU", "daily_used": 0, "last_reset": "" },
    { "key": "AIzaSyB9iKEfCUuDiaf9gHG4SifOrHta_icmQcI", "daily_used": 0, "last_reset": "" },
    { "key": "AIzaSyD_f-cHkKodZad0XQ52-dMWubuhlpWATeI", "daily_used": 0, "last_reset": "" }
  ],
  "rotation_threshold": 8000,
  "current_index": 0
}
```

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json scripts/miro/keys.json
git commit -m "feat(miro): add dependencies and API keys for MiroYouTube"
```

---

## Task 2: YouTube API client with key rotation

**Files:**
- Create: `scripts/miro/lib/youtube-api.mjs`

- [ ] **Step 1: Write youtube-api.mjs**

This module handles:
- Load keys.json, auto-reset daily counters when date changes
- Pick next key when current hits threshold (8000 units)
- Track units consumed per call type
- Expose methods: `getChannel(channelId)`, `searchChannels(query, maxResults)`, `getVideos(videoIds)`

Key details:
- `getChannel(channelId)` → calls `channels.list` with `part=snippet,statistics` (cost: 1 unit)
- `searchChannels(query, maxResults=50)` → calls `search.list` with `part=snippet`, `type=channel`, `order=viewCount` (cost: 100 units)
- `searchVideos(query, maxResults=50)` → calls `search.list` with `part=snippet`, `type=video` (cost: 100 units)
- `getVideos(videoIds[])` → calls `videos.list` with `part=snippet,statistics,contentDetails`, batches of 50 (cost: 1 unit per batch)
- `getChannelVideos(channelId, maxResults=50)` → calls `search.list` with `channelId`, `type=video`, `order=date` (cost: 100 units)
- After each call, increment `daily_used` on current key and write back to `keys.json`
- On 403 quota error, rotate to next key automatically

```javascript
// scripts/miro/lib/youtube-api.mjs
import { google } from 'googleapis';
import { readFile, writeFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const KEYS_PATH = join(__dirname, '..', 'keys.json');

// Unit costs per API method
const UNIT_COSTS = {
  'search.list': 100,
  'channels.list': 1,
  'videos.list': 1,
};

let keysData = null;

async function loadKeys() {
  keysData = JSON.parse(await readFile(KEYS_PATH, 'utf-8'));
  const today = new Date().toISOString().split('T')[0];
  for (const k of keysData.keys) {
    if (k.last_reset !== today) {
      k.daily_used = 0;
      k.last_reset = today;
    }
  }
  await saveKeys();
  return keysData;
}

async function saveKeys() {
  await writeFile(KEYS_PATH, JSON.stringify(keysData, null, 2));
}

function getCurrentKey() {
  if (!keysData) throw new Error('Call loadKeys() first');
  return keysData.keys[keysData.current_index];
}

async function rotateKey() {
  keysData.current_index = (keysData.current_index + 1) % keysData.keys.length;
  await saveKeys();
  return getCurrentKey();
}

async function trackUsage(method) {
  const key = getCurrentKey();
  key.daily_used += UNIT_COSTS[method] || 1;
  if (key.daily_used >= keysData.rotation_threshold) {
    await rotateKey();
  }
  await saveKeys();
}

function getYouTube() {
  const key = getCurrentKey();
  return google.youtube({ version: 'v3', auth: key.key });
}

async function withRetry(fn) {
  try {
    return await fn();
  } catch (err) {
    if (err.code === 403 && err.message?.includes('quota')) {
      await rotateKey();
      return await fn();
    }
    throw err;
  }
}

export async function init() {
  await loadKeys();
}

export async function getChannel(channelId) {
  const yt = getYouTube();
  const res = await withRetry(() =>
    yt.channels.list({ part: 'snippet,statistics', id: channelId })
  );
  await trackUsage('channels.list');
  return res.data.items?.[0] || null;
}

export async function searchChannels(query, maxResults = 50) {
  const yt = getYouTube();
  const res = await withRetry(() =>
    yt.search.list({ part: 'snippet', q: query, type: 'channel', maxResults, order: 'viewCount' })
  );
  await trackUsage('search.list');
  return res.data.items || [];
}

export async function searchVideos(query, maxResults = 50) {
  const yt = getYouTube();
  const res = await withRetry(() =>
    yt.search.list({ part: 'snippet', q: query, type: 'video', maxResults, order: 'viewCount' })
  );
  await trackUsage('search.list');
  return res.data.items || [];
}

export async function getChannelVideos(channelId, maxResults = 50) {
  const yt = getYouTube();
  const res = await withRetry(() =>
    yt.search.list({ part: 'snippet', channelId, type: 'video', maxResults, order: 'date' })
  );
  await trackUsage('search.list');
  const videoIds = res.data.items.map(i => i.id.videoId);
  if (videoIds.length === 0) return [];
  return getVideos(videoIds);
}

export async function getVideos(videoIds) {
  const results = [];
  for (let i = 0; i < videoIds.length; i += 50) {
    const batch = videoIds.slice(i, i + 50);
    const yt = getYouTube();
    const res = await withRetry(() =>
      yt.videos.list({ part: 'snippet,statistics,contentDetails', id: batch.join(',') })
    );
    await trackUsage('videos.list');
    results.push(...(res.data.items || []));
  }
  return results;
}
```

- [ ] **Step 2: Test manually**

```bash
cd /Users/jaci/Documents/LoopX-Local
node -e "
import { init, getChannel } from './scripts/miro/lib/youtube-api.mjs';
await init();
const ch = await getChannel('UCsJ63lzgJ-qbqIX-2yVPyUA');
console.log(ch.snippet.title, ch.statistics.subscriberCount);
"
```

Expected: `Abuela Recuerda` + subscriber count

- [ ] **Step 3: Commit**

```bash
git add scripts/miro/lib/youtube-api.mjs
git commit -m "feat(miro): YouTube API client with 16-key rotation"
```

---

## Task 3: CSV parser for YouTube Studio exports

**Files:**
- Create: `scripts/miro/lib/csv-parser.mjs`

- [ ] **Step 1: Write csv-parser.mjs**

YouTube Studio CSV format varies, but common columns:
- `Video`, `Video title`, `Views`, `Impressions`, `Impressions click-through rate (%)`,
  `Average view duration`, `Subscribers gained`, `Video publish time`

The parser should:
- Auto-detect delimiter (comma or tab)
- Normalize column names (handle English/Spanish variants)
- Return array of video objects matching `dados.json` schema
- Handle percentage strings ("8.5%") → number (8.5)
- Handle duration strings ("0:29:52") → seconds (1792)

```javascript
// scripts/miro/lib/csv-parser.mjs
import { readFile } from 'fs/promises';
import { parse } from 'csv-parse/sync';

const COLUMN_MAP = {
  // English variants
  'video': 'id',
  'video title': 'title',
  'views': 'views',
  'impressions': 'impressions',
  'impressions click-through rate (%)': 'ctr',
  'average view duration': 'avg_view_duration',
  'subscribers': 'subs_gained',
  'subscribers gained': 'subs_gained',
  'video publish time': 'published',
  // Spanish variants
  'título del vídeo': 'title',
  'visualizaciones': 'views',
  'impresiones': 'impressions',
  'porcentaje de clics en impresiones (%)': 'ctr',
  'duración media de visualización': 'avg_view_duration',
  'suscriptores': 'subs_gained',
  'fecha de publicación del vídeo': 'published',
};

function normalizeValue(key, value) {
  if (!value || value === '') return null;
  if (key === 'ctr') return parseFloat(value.replace('%', '').replace(',', '.'));
  if (key === 'views' || key === 'impressions' || key === 'subs_gained') {
    return parseInt(value.replace(/[.,\s]/g, ''), 10);
  }
  if (key === 'avg_view_duration') {
    const parts = value.split(':').map(Number);
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return parseInt(value, 10);
  }
  return value;
}

export async function parseCSV(filePath) {
  const content = await readFile(filePath, 'utf-8');
  const delimiter = content.includes('\t') ? '\t' : ',';

  const records = parse(content, {
    delimiter,
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
  });

  return records.map(row => {
    const video = {};
    for (const [col, val] of Object.entries(row)) {
      const normalized = COLUMN_MAP[col.toLowerCase().trim()];
      if (normalized) {
        video[normalized] = normalizeValue(normalized, val);
      }
    }
    // Fields that come from analysis, not CSV
    video.structure = null;
    video.framework = null;
    video.method_used = null;
    video.has_branding = null;
    video.source = 'csv';
    return video;
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add scripts/miro/lib/csv-parser.mjs
git commit -m "feat(miro): YouTube Studio CSV parser with EN/ES column support"
```

---

## Task 4: Health score calculator

**Files:**
- Create: `scripts/miro/lib/score.mjs`

- [ ] **Step 1: Write score.mjs**

Implements the weighted health score from the spec (Section 4.4):
- Trend (weight 3), Structure diversity (weight 2), CTR (weight 2), Branding (weight 1), Frequency (weight 1)

```javascript
// scripts/miro/lib/score.mjs

export function calculateHealthScore(videos, brandingField = null) {
  if (!videos || videos.length === 0) return { score: 0, components: {}, status: 'NO_DATA' };

  const sorted = [...videos].sort((a, b) => new Date(b.published) - new Date(a.published));
  const recent10 = sorted.slice(0, 10);
  const recent5 = sorted.slice(0, 5);

  // 1. Trend (weight 3) — compare impressions of last 5 vs previous 5
  const trendScore = calcTrend(sorted);

  // 2. Structure diversity (weight 2) — unique structures in last 10
  const structures = recent10.map(v => v.structure).filter(Boolean);
  const uniqueStructures = new Set(structures).size;
  const diversityScore = uniqueStructures >= 4 ? 10 : uniqueStructures === 3 ? 7 : uniqueStructures === 2 ? 4 : 1;

  // 3. CTR (weight 2)
  const ctrs = recent10.map(v => v.ctr).filter(v => v != null);
  const avgCtr = ctrs.length > 0 ? ctrs.reduce((a, b) => a + b, 0) / ctrs.length : 0;
  const ctrScore = avgCtr > 10 ? 10 : avgCtr >= 7 ? 7 : avgCtr >= 4 ? 4 : 1;

  // 4. Branding consistency (weight 1)
  let brandingScore = 5;
  if (brandingField) {
    const withBranding = recent10.filter(v => v.has_branding === true).length;
    const pct = recent10.length > 0 ? withBranding / recent10.length : 0;
    brandingScore = pct >= 1 ? 10 : pct >= 0.5 ? 5 : 1;
  }

  // 5. Frequency (weight 1)
  const frequencyScore = calcFrequency(sorted);

  // Weighted average
  const weights = { trend: 3, diversity: 2, ctr: 2, branding: 1, frequency: 1 };
  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
  const score = (
    trendScore * weights.trend +
    diversityScore * weights.diversity +
    ctrScore * weights.ctr +
    brandingScore * weights.branding +
    frequencyScore * weights.frequency
  ) / totalWeight;

  const rounded = Math.round(score * 10) / 10;
  const status = rounded >= 8 ? 'SAUDAVEL' : rounded >= 5 ? 'ATENCAO' : 'CRITICO';

  return {
    score: rounded,
    status,
    emoji: rounded >= 8 ? '🟢' : rounded >= 5 ? '🟡' : '🔴',
    components: {
      trend: { score: trendScore, weight: 3 },
      diversity: { score: diversityScore, weight: 2, unique: uniqueStructures },
      ctr: { score: ctrScore, weight: 2, avg: Math.round(avgCtr * 100) / 100 },
      branding: { score: brandingScore, weight: 1 },
      frequency: { score: frequencyScore, weight: 1 },
    },
  };
}

function calcTrend(sorted) {
  const withImpressions = sorted.filter(v => v.impressions != null);
  if (withImpressions.length < 4) return 5; // not enough data
  const recent = withImpressions.slice(0, Math.floor(withImpressions.length / 2));
  const older = withImpressions.slice(Math.floor(withImpressions.length / 2));
  const avgRecent = recent.reduce((a, v) => a + v.impressions, 0) / recent.length;
  const avgOlder = older.reduce((a, v) => a + v.impressions, 0) / older.length;
  if (avgOlder === 0) return 5;
  const change = (avgRecent - avgOlder) / avgOlder;
  if (change > 0.2) return 10;
  if (change >= -0.1) return 7;
  if (change >= -0.3) return 4;
  return 1;
}

function calcFrequency(sorted) {
  if (sorted.length < 2) return 5;
  const now = new Date();
  const lastPublished = new Date(sorted[0].published);
  const daysSinceLast = (now - lastPublished) / (1000 * 60 * 60 * 24);
  if (daysSinceLast > 14) return 0; // inactive

  // Calculate average videos per week over last 30 days
  const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
  const recentVideos = sorted.filter(v => new Date(v.published) >= thirtyDaysAgo);
  const weeks = Math.max(1, (now - thirtyDaysAgo) / (7 * 24 * 60 * 60 * 1000));
  const perWeek = recentVideos.length / weeks;

  if (perWeek >= 2 && perWeek <= 3) return 10;
  if (perWeek >= 4 && perWeek <= 5) return 7;
  if (perWeek === 1 || (perWeek > 0 && perWeek < 2)) return 4;
  if (perWeek >= 6 && perWeek <= 7) return 2;
  if (perWeek > 7) return 1;
  return 4;
}

export function calcSaturation(videos) {
  if (!videos || videos.length === 0) return { score: 0, dominant: null, consecutive: 0 };

  const sorted = [...videos].sort((a, b) => new Date(b.published) - new Date(a.published));
  const structures = sorted.map(v => v.structure).filter(Boolean);

  // Count consecutive same structure from most recent
  let consecutive = 1;
  for (let i = 1; i < structures.length; i++) {
    if (structures[i] === structures[0]) consecutive++;
    else break;
  }

  // Count frequency
  const freq = {};
  for (const s of structures) freq[s] = (freq[s] || 0) + 1;
  const dominant = Object.entries(freq).sort((a, b) => b[1] - a[1])[0];
  const total = structures.length;
  const dominantPct = dominant ? dominant[1] / total : 0;

  return {
    score: Math.round((1 - dominantPct) * 100) / 100,
    dominant: dominant ? dominant[0] : null,
    dominant_count: dominant ? dominant[1] : 0,
    consecutive,
    unique_structures: Object.keys(freq).length,
    total_analyzed: total,
  };
}

export function recommendMethod(videos, concorrentes = []) {
  const sorted = [...videos].sort((a, b) => new Date(b.published) - new Date(a.published));
  const recent5 = sorted.slice(0, 5);
  const saturation = calcSaturation(videos);

  // Priority 1: CTR dropping >20%
  const ctrs = recent5.map(v => v.ctr).filter(v => v != null);
  if (ctrs.length >= 3) {
    const firstHalf = ctrs.slice(0, Math.floor(ctrs.length / 2));
    const secondHalf = ctrs.slice(Math.floor(ctrs.length / 2));
    const avgFirst = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const avgSecond = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
    if (avgSecond > 0 && (avgFirst - avgSecond) / avgSecond < -0.2) {
      return { method: 3, reason: `CTR caiu ${Math.round(((avgSecond - avgFirst) / avgSecond) * 100)}% nos últimos vídeos`, priority: 1 };
    }
  }

  // Priority 2: Structure used 5+ times consecutively
  if (saturation.consecutive >= 5) {
    return { method: 3, reason: `Estrutura '${saturation.dominant}' usada ${saturation.consecutive}x seguidas`, priority: 2 };
  }

  // Priority 3: External saturation (30+ channels)
  // This would require concorrentes data — simplified check
  if (concorrentes.length >= 30) {
    return { method: 2, reason: `${concorrentes.length} canais concorrentes no subnicho — subnichar pra se diferenciar`, priority: 3 };
  }

  // Priority 4: New channel
  if (videos.length < 10) {
    return { method: 1, reason: `Canal novo (${videos.length} vídeos) — testar variações`, priority: 4 };
  }

  // Priority 5: CTR stable >8%
  const avgCtr = ctrs.length > 0 ? ctrs.reduce((a, b) => a + b, 0) / ctrs.length : 0;
  if (avgCtr >= 8) {
    return { method: 1, reason: `CTR estável em ${avgCtr.toFixed(1)}% — manter variações`, priority: 5 };
  }

  // Default
  return { method: 2, reason: 'Subnichar é o método mais seguro como default', priority: 6 };
}
```

- [ ] **Step 2: Commit**

```bash
git add scripts/miro/lib/score.mjs
git commit -m "feat(miro): health score calculator + method recommendation engine"
```

---

## Task 5: miro-scanner.mjs (main script)

**Files:**
- Create: `scripts/miro/miro-scanner.mjs`

- [ ] **Step 1: Write miro-scanner.mjs**

CLI interface for YouTube API scanning. Three modes:
- `--channel ID --canal X --tipo concorrente|proprio` → scan single channel
- `--nicho "term" --subnicho "term" --terms "expanded,terms"` → niche scan

```javascript
// scripts/miro/miro-scanner.mjs
import { init, getChannel, getChannelVideos, searchVideos, searchChannels, getVideos } from './lib/youtube-api.mjs';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { parseArgs } from 'util';

const VAULT = '/Users/jaci/Documents/Obsidian Vault/MiroYouTube';

const { values: args } = parseArgs({
  options: {
    channel: { type: 'string' },
    canal: { type: 'string' },
    tipo: { type: 'string', default: 'concorrente' },
    nicho: { type: 'string' },
    subnicho: { type: 'string' },
    terms: { type: 'string' },
    'min-views': { type: 'string', default: '100000' },
    'max-age': { type: 'string', default: '90' },
  },
});

await init();

if (args.channel && args.canal) {
  await scanChannel(args.channel, args.canal, args.tipo);
} else if (args.nicho) {
  await scanNiche(args.nicho, args.subnicho, args.terms);
} else {
  console.error('Usage:\n  --channel ID --canal X [--tipo concorrente|proprio]\n  --nicho "term" [--subnicho "term"] [--terms "a,b,c"]');
  process.exit(1);
}

async function scanChannel(channelId, canal, tipo) {
  console.log(`Scanning channel ${channelId} for canal ${canal} (${tipo})...`);

  const channelData = await getChannel(channelId);
  if (!channelData) { console.error('Channel not found'); process.exit(1); }

  const videos = await getChannelVideos(channelId, 50);
  console.log(`Found ${videos.length} videos`);

  const channelInfo = {
    id: channelId,
    name: channelData.snippet.title,
    handle: channelData.snippet.customUrl || '',
    subs: parseInt(channelData.statistics.subscriberCount) || 0,
    total_views: parseInt(channelData.statistics.viewCount) || 0,
    created: channelData.snippet.publishedAt?.split('T')[0] || '',
    country: channelData.snippet.country || '',
    videos: videos.map(v => ({
      id: v.id,
      title: v.snippet.title,
      published: v.snippet.publishedAt?.split('T')[0] || '',
      views: parseInt(v.statistics.viewCount) || 0,
      likes: parseInt(v.statistics.likeCount) || 0,
      comments: parseInt(v.statistics.commentCount) || 0,
      duration: v.contentDetails.duration,
      structure: null,
      framework: null,
    })),
  };

  const canalDir = join(VAULT, 'Canais', canal);
  await mkdir(canalDir, { recursive: true });

  if (tipo === 'proprio') {
    // Merge into dados.json
    const dadosPath = join(canalDir, 'dados.json');
    let dados = { channel_id: channelId, last_updated: '', videos: [], csv_imports: [] };
    try { dados = JSON.parse(await readFile(dadosPath, 'utf-8')); } catch {}

    dados.channel_id = channelId;
    dados.last_updated = new Date().toISOString().split('T')[0];

    // Merge: update existing, add new
    for (const v of channelInfo.videos) {
      const existing = dados.videos.find(e => e.id === v.id);
      if (existing) {
        existing.views = v.views;
        existing.likes = v.likes;
        existing.comments = v.comments;
      } else {
        dados.videos.push({ ...v, ctr: null, impressions: null, avg_view_duration: null, subs_gained: null, method_used: null, has_branding: null, source: 'api' });
      }
    }

    await writeFile(dadosPath, JSON.stringify(dados, null, 2));
    console.log(`Saved to ${dadosPath} (${dados.videos.length} videos total)`);
  } else {
    // Append to concorrentes.json
    const concPath = join(canalDir, 'concorrentes.json');
    let conc = { last_updated: '', channels: [] };
    try { conc = JSON.parse(await readFile(concPath, 'utf-8')); } catch {}

    conc.last_updated = new Date().toISOString().split('T')[0];

    // Replace if channel already exists, otherwise append
    const idx = conc.channels.findIndex(c => c.id === channelId);
    if (idx >= 0) conc.channels[idx] = channelInfo;
    else conc.channels.push(channelInfo);

    await writeFile(concPath, JSON.stringify(conc, null, 2));
    console.log(`Saved to ${concPath} (${conc.channels.length} channels total)`);
  }

  console.log(JSON.stringify(channelInfo, null, 2));
}

async function scanNiche(nicho, subnicho, termsStr) {
  console.log(`Scanning niche: ${nicho} | sub-niche: ${subnicho || 'none'}`);

  const nichoTerms = nicho.split(',').map(t => t.trim());
  const subTerms = termsStr ? termsStr.split(',').map(t => t.trim()) : (subnicho ? subnicho.split(' ') : []);

  // Layer 1: Niche scan
  const allChannelIds = new Set();
  const channelMap = new Map();

  for (const term of nichoTerms) {
    console.log(`  Searching niche: "${term}"`);
    const results = await searchChannels(term, 50);
    for (const r of results) {
      const id = r.snippet.channelId;
      if (!allChannelIds.has(id)) {
        allChannelIds.add(id);
        channelMap.set(id, { id, title: r.snippet.channelTitle, matchedTerms: [term] });
      } else {
        channelMap.get(id).matchedTerms.push(term);
      }
    }
  }

  console.log(`  Layer 1: ${allChannelIds.size} channels found`);

  // Layer 2: Sub-niche filter via video search
  const subNicheChannels = new Set();
  if (subTerms.length > 0) {
    // Generate cross-queries
    const queries = [];
    for (const t of subTerms) {
      queries.push(t);
      for (const n of nichoTerms.slice(0, 2)) {
        queries.push(`${t} ${n}`);
      }
    }
    const uniqueQueries = [...new Set(queries)].slice(0, 10); // max 10 queries to conserve quota

    for (const q of uniqueQueries) {
      console.log(`  Searching sub-niche: "${q}"`);
      const videos = await searchVideos(q, 50);
      for (const v of videos) {
        const chId = v.snippet.channelId;
        subNicheChannels.add(chId);
        if (!channelMap.has(chId)) {
          channelMap.set(chId, { id: chId, title: v.snippet.channelTitle, matchedTerms: [q] });
        }
      }
    }
  }

  console.log(`  Layer 2: ${subNicheChannels.size} sub-niche channels found`);

  // Enrich top channels with stats
  const topIds = [...channelMap.keys()].slice(0, 50);
  const enriched = [];
  for (let i = 0; i < topIds.length; i += 50) {
    const batch = topIds.slice(i, i + 50);
    for (const id of batch) {
      try {
        const ch = await getChannel(id);
        if (ch) {
          const info = channelMap.get(id);
          enriched.push({
            id,
            name: ch.snippet.title,
            handle: ch.snippet.customUrl || '',
            subs: parseInt(ch.statistics.subscriberCount) || 0,
            total_views: parseInt(ch.statistics.viewCount) || 0,
            video_count: parseInt(ch.statistics.videoCount) || 0,
            created: ch.snippet.publishedAt?.split('T')[0] || '',
            is_subniche: subNicheChannels.has(id),
            matched_terms: info.matchedTerms,
          });
        }
      } catch (e) {
        console.error(`  Error enriching ${id}: ${e.message}`);
      }
    }
  }

  // Classify
  const minViews = parseInt(args['min-views']);
  const maxAge = parseInt(args['max-age']);
  const now = new Date();

  for (const ch of enriched) {
    const ageInDays = (now - new Date(ch.created)) / (1000 * 60 * 60 * 24);
    ch.age_days = Math.round(ageInDays);
    ch.has_traction = ch.total_views >= minViews && ageInDays <= maxAge;
    ch.category = ch.is_subniche ? 'direct' : 'adjacent';
    if (ch.has_traction) ch.category = 'new_with_traction';
  }

  const output = {
    date: new Date().toISOString().split('T')[0],
    nicho,
    subnicho: subnicho || null,
    terms_used: [...new Set([...nichoTerms, ...subTerms])],
    total_channels: enriched.length,
    subniche_channels: enriched.filter(c => c.is_subniche).length,
    new_with_traction: enriched.filter(c => c.has_traction).length,
    channels: enriched.sort((a, b) => b.total_views - a.total_views),
  };

  // Save to Varreduras/
  const varDir = join(VAULT, 'Varreduras');
  await mkdir(varDir, { recursive: true });
  const filename = `${output.date} - ${nicho.replace(/[^a-zA-Z0-9áéíóúñ ]/g, '')}.json`;
  await writeFile(join(varDir, filename), JSON.stringify(output, null, 2));

  console.log(`\nResults saved to ${join(varDir, filename)}`);
  console.log(`Total: ${output.total_channels} | Sub-niche: ${output.subniche_channels} | New w/ traction: ${output.new_with_traction}`);
  console.log(JSON.stringify(output, null, 2));
}
```

- [ ] **Step 2: Test Mode 1 (channel scan)**

```bash
node scripts/miro/miro-scanner.mjs --channel UCsJ63lzgJ-qbqIX-2yVPyUA --canal F --tipo proprio
```

Expected: Creates/updates `MiroYouTube/Canais/F/dados.json` with Abuela Recuerda data

- [ ] **Step 3: Commit**

```bash
git add scripts/miro/miro-scanner.mjs
git commit -m "feat(miro): YouTube scanner with channel + niche/sub-niche modes"
```

---

## Task 6: miro-analyzer.mjs (main script)

**Files:**
- Create: `scripts/miro/miro-analyzer.mjs`

- [ ] **Step 1: Write miro-analyzer.mjs**

Three modes: `--import`, `--concorrentes`, `--recomendar`

```javascript
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
  console.log(`Importing CSV: ${csvPath} for canal ${canal}`);

  const videos = await parseCSV(csvPath);
  console.log(`Parsed ${videos.length} videos from CSV`);

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
  console.log(`Analyzing competitors for canal ${canal}`);

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
  console.log(`Generating recommendation for canal ${canal}`);

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
```

- [ ] **Step 2: Commit**

```bash
git add scripts/miro/miro-analyzer.mjs
git commit -m "feat(miro): analyzer with CSV import, competitor analysis, method recommendation"
```

---

## Task 7: miro-report.mjs (main script)

**Files:**
- Create: `scripts/miro/miro-report.mjs`

- [ ] **Step 1: Write miro-report.mjs**

Generates Obsidian-formatted `.md` reports from analyzer JSON output. Reads JSON from stdin (piped from analyzer) or from file.

```javascript
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

  const h = data.health || {};
  const s = data.saturation || {};
  const emoji = h.emoji || '❓';
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
```

- [ ] **Step 2: Commit**

```bash
git add scripts/miro/miro-report.mjs
git commit -m "feat(miro): Obsidian report generator with health, competitor, and niche reports"
```

---

## Task 8: Obsidian vault structure for Canal E and F

**Files:**
- Create: Multiple `.md` and `.json` files in Obsidian vault

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p "/Users/jaci/Documents/Obsidian Vault/MiroYouTube/Canais/E/Reports"
mkdir -p "/Users/jaci/Documents/Obsidian Vault/MiroYouTube/Canais/F/Reports"
mkdir -p "/Users/jaci/Documents/Obsidian Vault/MiroYouTube/Varreduras"
```

- [ ] **Step 2: Create Canal E files**

Create all `.md` template files for Canal E based on existing data in `Projetos/Confesiones de las Abuelas/Contexto Canal E.md`. Copy key info into:
- `Perfil.md` — channel ID, handle, nicho (storytime urbano), subnicho, branding
- `Referências.md` — empty, user fills
- `Histórico.md` — header only
- `Metodologia.md` — rules from existing gerenteE (urban vocab, zona dourada)
- `Estruturas.md` — header only
- `Vocabulário.md` — urban words allowed, rural words prohibited
- `dados.json` — `{ "channel_id": "", "last_updated": "", "videos": [], "csv_imports": [] }`
- `concorrentes.json` — `{ "last_updated": "", "channels": [] }`

- [ ] **Step 3: Create Canal F files**

Same structure for Canal F, pulling data from `Contexto Canal F.md`:
- Rural vocabulary, "NUNCA LO CONTÉ" branding, different persona rules
- Prohibited words: plomero, doctor, fisioterapeuta, masajista

- [ ] **Step 4: Create Dashboard.md**

Initial dashboard with both channels, empty scores.

- [ ] **Step 5: Commit**

```bash
# These are Obsidian vault files, not in the git repo
# No git commit needed for vault files
```

---

## Task 9: Skill /miro (O Diretor)

**Files:**
- Create: `skills/miro.md`
- Create: `~/.claude/commands/miro.md` (symlink)

- [ ] **Step 1: Write skills/miro.md**

The skill prompt instructs Claude to:
1. Parse the user's command (saúde, varrer, concorrentes, criar)
2. Call the appropriate scripts via Bash
3. Read the JSON output
4. Write reports to Obsidian via miro-report.mjs
5. Present summary to user

Key paths:
- Scripts: `/Users/jaci/Documents/LoopX-Local/scripts/miro/`
- Vault: `/Users/jaci/Documents/Obsidian Vault/MiroYouTube/`

- [ ] **Step 2: Create symlink**

```bash
ln -sf /Users/jaci/Documents/LoopX-Local/skills/miro.md /Users/jaci/.claude/commands/miro.md
```

- [ ] **Step 3: Commit**

```bash
git add skills/miro.md
git commit -m "feat(miro): /miro skill — O Diretor (Skill Mãe)"
```

---

## Task 10: Skill /miro-E (O Estrategista do Canal E)

**Files:**
- Create: `skills/miro-E.md`
- Create: `~/.claude/commands/miro-E.md` (symlink)

- [ ] **Step 1: Write skills/miro-E.md**

Isolated skill that:
- ONLY reads `MiroYouTube/Canais/E/*`
- Reads dados.json, Estruturas.md, Vocabulário.md, Metodologia.md
- Calls `miro-analyzer.mjs --recomendar --canal E`
- Recommends ONE method with reason
- Generates titles using ONLY the chosen method
- Applies filters: urban vocabulary, zona dourada
- Saves report to Obsidian
- NEVER references Canal F or any other channel

- [ ] **Step 2: Create symlink**

```bash
ln -sf /Users/jaci/Documents/LoopX-Local/skills/miro-E.md /Users/jaci/.claude/commands/miro-E.md
```

- [ ] **Step 3: Commit**

```bash
git add skills/miro-E.md
git commit -m "feat(miro): /miro-E skill — O Estrategista do Canal E (isolated)"
```

---

## Task 11: Skill /miro-F (O Estrategista do Canal F)

**Files:**
- Create: `skills/miro-F.md`
- Create: `~/.claude/commands/miro-F.md` (symlink)

- [ ] **Step 1: Write skills/miro-F.md**

Same structure as miro-E.md but:
- ONLY reads `MiroYouTube/Canais/F/*`
- Rural vocabulary (cuerno, ubre, riendas, surco, establo)
- Prohibited: plomero, doctor, fisioterapeuta, masajista, electricista
- "NUNCA LO CONTÉ" required in 100% of titles
- Fixed persona (same abuela)
- NEVER references Canal E or any other channel

- [ ] **Step 2: Create symlink**

```bash
ln -sf /Users/jaci/Documents/LoopX-Local/skills/miro-F.md /Users/jaci/.claude/commands/miro-F.md
```

- [ ] **Step 3: Commit**

```bash
git add skills/miro-F.md
git commit -m "feat(miro): /miro-F skill — O Estrategista do Canal F (isolated)"
```

---

## Task 12: Integration test — full flow

- [ ] **Step 1: Run self-scan on Canal F**

```bash
cd /Users/jaci/Documents/LoopX-Local
node scripts/miro/miro-scanner.mjs --channel UCsJ63lzgJ-qbqIX-2yVPyUA --canal F --tipo proprio
```

Verify: `MiroYouTube/Canais/F/dados.json` has video data

- [ ] **Step 2: Run health analysis**

```bash
node scripts/miro/miro-analyzer.mjs --recomendar --canal F | node scripts/miro/miro-report.mjs --tipo saude --canal F
```

Verify: Report created in `MiroYouTube/Canais/F/Reports/`

- [ ] **Step 3: Test /miro skill**

```
/miro saúde F
```

Verify: Claude runs scripts, generates report, presents summary

- [ ] **Step 4: Test /miro-F skill**

```
/miro-F títulos
```

Verify: Reads Canal F data, recommends method, generates titles, saves to Obsidian

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat(miro): MiroYouTube v1 complete — intelligence system for YouTube channels"
```
