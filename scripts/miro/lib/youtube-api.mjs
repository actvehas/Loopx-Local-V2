import { google } from 'googleapis';
import { readFile, writeFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const KEYS_PATH = join(__dirname, '..', 'keys.json');

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
  if (!keysData) throw new Error('Call init() first');
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
    if (err.code === 403 || (err.response?.status === 403)) {
      console.log('API quota exceeded, rotating key...');
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
  const videoIds = (res.data.items || []).map(i => i.id.videoId).filter(Boolean);
  if (videoIds.length === 0) return [];
  return getVideos(videoIds);
}

export async function getChannelTopVideos(channelId, maxResults = 50) {
  const yt = getYouTube();
  const res = await withRetry(() =>
    yt.search.list({ part: 'snippet', channelId, type: 'video', maxResults, order: 'viewCount' })
  );
  await trackUsage('search.list');
  const videoIds = (res.data.items || []).map(i => i.id.videoId).filter(Boolean);
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
