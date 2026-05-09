#!/usr/bin/env node
/**
 * flow-download.js — Download all media from Google Labs Flow
 * Uses tRPC API to get project data + correct media URLs.
 * Falls back to DOM scroll only if API fails.
 *
 * Fixes:
 * - Uses content-type header to detect video vs image (not DOM heuristics)
 * - Downloads video source URL, not thumbnail JPG
 * - Matches scenes by prompt text in API data, not scroll position
 *
 * Usage:
 *   node scripts/flow-download.js <prompts-file> --output <dir> [--start N] [--end N]
 */

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function parseArgs() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log('Uso: node flow-download.js <prompts-file> --output <dir> [--start N] [--end N]');
    process.exit(0);
  }
  const config = { promptsFile: args[0], outputDir: './Cenas', start: 1, end: 9999, port: 9222 };
  for (let i = 1; i < args.length; i++) {
    switch (args[i]) {
      case '--output': config.outputDir = args[++i]; break;
      case '--start': config.start = parseInt(args[++i]); break;
      case '--end': config.end = parseInt(args[++i]); break;
      case '--port': config.port = parseInt(args[++i]); break;
    }
  }
  return config;
}

function extractPromptNums(file, start, end) {
  const content = fs.readFileSync(file, 'utf-8');
  const nums = [];
  for (const line of content.split('\n')) {
    const match = line.match(/^\(Cena[_ ]?(\d+)\)/i);
    if (match) {
      const n = parseInt(match[1]);
      if (n >= start && n <= end) nums.push(n);
    }
  }
  return nums;
}

/**
 * Extract project ID from the Flow tab URL
 */
function extractProjectId(url) {
  const match = url.match(/project\/([a-f0-9-]+)/);
  return match ? match[1] : null;
}

/**
 * Use tRPC API to get all items in the project with their media URLs
 * This is the reliable method — no scroll needed
 */
async function getProjectItems(page, projectId) {
  return await page.evaluate(async (pid) => {
    try {
      // Flow uses tRPC internally — we call the same endpoint
      const response = await fetch(`https://labs.google/fx/api/trpc/flow.projectInitialData?input=${encodeURIComponent(JSON.stringify({ json: { projectId: pid } }))}`);
      if (!response.ok) return { error: `HTTP ${response.status}` };
      const data = await response.json();

      const items = [];
      const results = data?.result?.data?.json?.results || data?.result?.data?.json?.items || [];

      // Try different data structures (Flow API changes)
      let allItems = results;
      if (!Array.isArray(allItems) || allItems.length === 0) {
        // Try nested structure
        const project = data?.result?.data?.json;
        if (project?.results) allItems = project.results;
        else if (project?.items) allItems = project.items;
        else if (project?.media) allItems = project.media;
        else if (project?.workflows) allItems = project.workflows.flatMap(w => w.results || w.items || []);
      }

      // Debug: if still empty, expose response shape so we can adapt
      if (!Array.isArray(allItems) || allItems.length === 0) {
        const project = data?.result?.data?.json;
        return {
          items: [],
          total: 0,
          debug: {
            topKeys: data ? Object.keys(data) : [],
            projectKeys: project ? Object.keys(project) : [],
            sample: project ? JSON.stringify(project).substring(0, 800) : null
          }
        };
      }

      for (const item of allItems) {
        const prompt = item.prompt || item.text || item.input || '';
        const sceneMatch = prompt.match(/\(Cena[_ ]?(\d+)\)/i);
        if (!sceneMatch) continue;

        const sceneNum = parseInt(sceneMatch[1]);
        const mediaUrl = item.mediaUrl || item.url || item.outputUrl || item.resultUrl || '';
        const mediaType = item.mediaType || item.type || item.outputType || '';
        const isVideo = mediaType.includes('video') || mediaUrl.includes('.mp4') || item.isVideo === true;

        items.push({
          sceneNum,
          url: mediaUrl,
          type: isVideo ? 'video' : 'image',
          prompt: prompt.substring(0, 80)
        });
      }

      return { items, total: allItems.length };
    } catch (err) {
      return { error: err.message };
    }
  }, projectId);
}

/**
 * Fallback: scroll DOM and collect media, but with improved matching
 * Uses content-type detection and checks for video elements first
 */
async function collectViaScroll(page) {
  console.log('🔄 Usando fallback DOM scroll...');

  // First, scroll entire page to load all virtual items
  const scrollInfo = await page.evaluate(() => {
    let container = null;
    document.querySelectorAll('*').forEach(el => {
      const style = getComputedStyle(el);
      if ((style.overflow === 'auto' || style.overflow === 'scroll' ||
           style.overflowY === 'auto' || style.overflowY === 'scroll') &&
          el.scrollHeight > el.clientHeight + 100) {
        if (!container || el.scrollHeight > container.scrollHeight) {
          container = el;
        }
      }
    });
    if (!container) return null;
    return { scrollH: container.scrollHeight, clientH: container.clientHeight };
  });

  if (!scrollInfo) {
    console.error('❌ Container scrollável não encontrado');
    return [];
  }

  console.log(`📏 Container: ${scrollInfo.scrollH}px total, ${scrollInfo.clientH}px viewport`);

  // Collect all items by scrolling slowly
  const allItems = new Map(); // sceneNum -> item
  const step = Math.floor(scrollInfo.clientH * 0.4); // smaller steps = more overlap = better detection
  const totalSteps = Math.ceil(scrollInfo.scrollH / step);
  console.log(`🔍 Scrolling ${totalSteps} passos (step=${step}px)...`);

  for (let y = 0; y <= scrollInfo.scrollH; y += step) {
    await page.evaluate((scrollPos) => {
      const containers = document.querySelectorAll('*');
      for (const el of containers) {
        const style = getComputedStyle(el);
        if ((style.overflow === 'auto' || style.overflow === 'scroll' ||
             style.overflowY === 'auto' || style.overflowY === 'scroll') &&
            el.scrollHeight > el.clientHeight + 100) {
          el.scrollTop = scrollPos;
          break;
        }
      }
    }, y);

    await sleep(600); // longer wait for DOM to update

    // Collect visible items at this scroll position
    const visible = await page.evaluate(() => {
      const items = [];
      // Find all prompt text elements with Cena numbers
      const allElements = document.querySelectorAll('div, span, p');
      for (const el of allElements) {
        if (el.children.length > 5) continue;
        const text = (el.textContent || '').trim();
        const match = text.match(/^\(Cena[_ ]?(\d+)\)/i);
        if (!match) continue;
        const sceneNum = parseInt(match[1]);

        // Get the card container — walk up to find media
        let card = el;
        for (let i = 0; i < 12; i++) {
          card = card.parentElement;
          if (!card) break;

          // Check for video FIRST (videos show as <video> elements)
          const vid = card.querySelector('video[src]');
          if (vid && vid.src && vid.src.length > 50) {
            items.push({
              sceneNum,
              url: vid.src,
              type: 'video',
              rect: el.getBoundingClientRect().top // for dedup by position
            });
            break;
          }

          // Check for image with getMediaUrlRedirect (actual generated content)
          const img = card.querySelector('img[src*="getMediaUrlRedirect"]');
          if (img && img.naturalWidth > 100) {
            items.push({
              sceneNum,
              url: img.src,
              type: 'image',
              rect: el.getBoundingClientRect().top
            });
            break;
          }
        }
      }
      return items;
    });

    for (const item of visible) {
      // Only update if we don't have this scene yet, or if we found a video version
      const existing = allItems.get(item.sceneNum);
      if (!existing || (existing.type === 'image' && item.type === 'video')) {
        allItems.set(item.sceneNum, item);
      }
    }
  }

  // Dedup: a mesma URL não pode acabar em duas cenas (bug repro: 3 cenas
  // recebiam o mesmo placeholder JPG bit-a-bit idêntico). Mantém só a
  // associação com sceneNum mais próximo (o primeiro que reivindicou a URL).
  const urlOwner = new Map(); // url -> sceneNum
  for (const [sceneNum, item] of allItems) {
    if (!urlOwner.has(item.url)) urlOwner.set(item.url, sceneNum);
  }
  for (const [sceneNum, item] of [...allItems]) {
    if (urlOwner.get(item.url) !== sceneNum) {
      console.log(`  ⚠️  Cena ${sceneNum}: URL duplicada (já é da cena ${urlOwner.get(item.url)}) — ignorada`);
      allItems.delete(sceneNum);
    }
  }

  return [...allItems.values()];
}

/**
 * Download a single item, detecting actual content type from HTTP response
 */
async function downloadItem(page, item, config) {
  const baseName = `(Cena_${String(item.sceneNum).padStart(3, '0')})`;

  const result = await page.evaluate(async (url) => {
    try {
      const response = await fetch(url, { redirect: 'follow' });
      const contentType = response.headers.get('content-type') || '';
      const blob = await response.blob();
      const ab = await blob.arrayBuffer();
      return {
        data: Array.from(new Uint8Array(ab)),
        contentType,
        finalUrl: response.url,
        ok: true
      };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }, item.url);

  if (!result.ok) throw new Error(result.error);

  // Determine REAL type from content-type header, not DOM
  const isVideo = result.contentType.includes('video') || result.contentType.includes('mp4');
  const ext = isVideo ? '.mp4' : '.jpg';
  const tag = `[Cinematic_Realism]`;
  const filename = `${baseName}${tag}${ext}`;
  const filepath = path.join(config.outputDir, filename);

  // Check if file already exists with different extension (video saved as jpg before)
  const otherExt = isVideo ? '.jpg' : '.mp4';
  const otherFile = path.join(config.outputDir, `${baseName}${tag}${otherExt}`);
  if (fs.existsSync(otherFile)) {
    fs.unlinkSync(otherFile); // remove wrong-extension file
  }

  fs.writeFileSync(filepath, Buffer.from(result.data));
  return {
    filename,
    size: result.data.length,
    type: isVideo ? 'video' : 'image',
    contentType: result.contentType
  };
}

async function main() {
  const config = parseArgs();
  const wantedNums = extractPromptNums(config.promptsFile, config.start, config.end);
  console.log(`📋 ${wantedNums.length} cenas desejadas (${config.start}-${config.end})`);

  if (!fs.existsSync(config.outputDir)) fs.mkdirSync(config.outputDir, { recursive: true });

  // Check existing — match by (Cena_NNN) prefix only
  const existingFiles = fs.readdirSync(config.outputDir);
  const existingNums = new Set();
  for (const f of existingFiles) {
    const m = f.match(/\(Cena_(\d+)\)/);
    if (m) existingNums.add(parseInt(m[1]));
  }
  const pendingNums = wantedNums.filter(n => !existingNums.has(n));
  const pendingSet = new Set(pendingNums);
  console.log(`⏭️  ${existingNums.size} já existem, ${pendingSet.size} pendentes`);
  if (pendingSet.size === 0) { console.log('✅ Tudo já baixado!'); return; }

  // Connect to Chrome
  console.log(`🔌 Conectando ao Chrome (localhost:${config.port})...`);
  const browser = await puppeteer.connect({ browserURL: `http://localhost:${config.port}` });
  const pages = await browser.pages();
  const page = pages.find(p => p.url().includes('labs.google/fx'));
  if (!page) { console.error('❌ Tab do Flow não encontrada'); process.exit(1); }
  const flowUrl = page.url();
  console.log('✅ Conectado ao Flow:', flowUrl.substring(0, 80));

  let items = [];

  // Method 1: Try tRPC API
  const projectId = extractProjectId(flowUrl);
  if (projectId) {
    console.log(`🔑 Project ID: ${projectId}`);
    console.log('📡 Tentando API tRPC...');
    const apiResult = await getProjectItems(page, projectId);
    if (apiResult.error) {
      console.log(`⚠️  API falhou: ${apiResult.error} — usando DOM scroll`);
    } else if (apiResult.items && apiResult.items.length > 0) {
      console.log(`✅ API retornou ${apiResult.items.length} itens (de ${apiResult.total} total)`);
      items = apiResult.items.filter(i => pendingSet.has(i.sceneNum) && i.url);
      console.log(`📥 ${items.length} cenas pendentes com URL`);
    } else {
      console.log('⚠️  API sem itens — usando DOM scroll');
      if (apiResult.debug) {
        console.log('   🔍 tRPC shape:');
        console.log('      topKeys:    ', apiResult.debug.topKeys);
        console.log('      projectKeys:', apiResult.debug.projectKeys);
        if (apiResult.debug.sample) console.log('      sample:', apiResult.debug.sample);
      }
    }
  }

  // Method 2: Fallback to DOM scroll
  if (items.length === 0) {
    const scrollItems = await collectViaScroll(page);
    items = scrollItems.filter(i => pendingSet.has(i.sceneNum));
    console.log(`📥 ${items.length} cenas encontradas via scroll`);
  }

  // Sort by scene number
  items.sort((a, b) => a.sceneNum - b.sceneNum);

  // Download
  let dlCount = 0;
  let videoCount = 0;
  let imageCount = 0;
  const downloadedNums = new Set(); // rastreia explicitamente — não assume "falhas no fim"

  for (const item of items) {
    try {
      const result = await downloadItem(page, item, config);
      dlCount++;
      downloadedNums.add(item.sceneNum);
      if (result.type === 'video') videoCount++;
      else imageCount++;

      if (dlCount % 10 === 0 || dlCount <= 5) {
        console.log(`  📥 Cena ${item.sceneNum} (${(result.size / 1024 / 1024).toFixed(1)}MB) [${result.type}] — ${dlCount}/${items.length}`);
      }
    } catch (err) {
      console.error(`  ❌ Cena ${item.sceneNum}: ${err.message}`);
    }
  }

  const totalFiles = fs.readdirSync(config.outputDir).length;
  console.log(`\n════════════════════════════════════════`);
  console.log(`✅ ${dlCount} baixadas (${imageCount} imagens, ${videoCount} vídeos)`);
  console.log(`📊 Total ficheiros: ${totalFiles}`);
  console.log(`📁 Output: ${config.outputDir}`);

  // Check missing — usa downloadedNums real (não posição no array)
  const stillMissing = pendingNums.filter(n => !downloadedNums.has(n) && !existingNums.has(n));
  if (stillMissing.length > 0) {
    if (stillMissing.length <= 20) {
      console.log(`⚠️  Faltam: Cenas ${stillMissing.join(', ')}`);
    } else {
      console.log(`⚠️  Faltam ${stillMissing.length} cenas — rode novamente`);
    }
  } else {
    console.log('🎉 Todas as cenas baixadas!');
  }

  browser.disconnect();
}

main().catch(err => { console.error(err); process.exit(1); });
