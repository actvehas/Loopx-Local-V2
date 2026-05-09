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
