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
