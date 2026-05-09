#!/usr/bin/env node
/**
 * veo3-generator.js — Gerador autônomo de vídeos VEO 3.1 via Puppeteer
 * Gerador autônomo — roda sozinho, zero interação manual.
 *
 * Uso:
 *   node scripts/veo3-generator.js <prompts-file> [--start N] [--end N] [--batch N] [--output dir]
 *
 * Exemplos:
 *   node scripts/veo3-generator.js prompts-veo3.md
 *   node scripts/veo3-generator.js prompts-veo3.md --start 1 --end 100 --output ./Cenas
 *   node scripts/veo3-generator.js prompts-veo3.md --batch 4
 *
 * Requer:
 *   npm install puppeteer-core (usa Chrome instalado, não baixa Chromium)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ============================================================
// CONFIG
// ============================================================
const FLOW_URL_DEFAULT = 'https://labs.google/fx/tools/flow';
const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CHROME_PROFILE = 'Profile 4'; // activedaring3@gmail.com — conta que comanda o Flow
const CHROME_USER_DATA = path.join(process.env.HOME, 'Library/Application Support/Google/Chrome');

const DEFAULTS = {
  batchSize: 4,         // prompts simultâneos
  pollInterval: 10000,  // check a cada 10s se vídeo ficou pronto
  maxWaitTime: 300000,  // 5 min max por vídeo
  retryLimit: 2,        // retries por prompt falhado
  delayBetween: 3000,   // delay entre submissões
  outputDir: './Cenas',
};

// ============================================================
// PARSE ARGS
// ============================================================
function parseArgs() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0] === '--help') {
    console.log(`
Uso: node veo3-generator.js <prompts-file> [opções]

Opções:
  --start N      Cena inicial (default: 1)
  --end N        Cena final (default: 9999)
  --batch N      Prompts simultâneos (default: 4)
  --output DIR   Pasta de saída (default: ./Cenas)
  --headless     Rodar sem janela visível
  --dry-run      Só mostra os prompts, não gera
`);
    process.exit(0);
  }

  const config = { ...DEFAULTS, promptsFile: args[0], start: 1, end: 9999, headless: false, dryRun: false, downloadOnly: false, flowUrl: FLOW_URL_DEFAULT };

  for (let i = 1; i < args.length; i++) {
    switch (args[i]) {
      case '--start': config.start = parseInt(args[++i]); break;
      case '--end': config.end = parseInt(args[++i]); break;
      case '--batch': config.batchSize = parseInt(args[++i]); break;
      case '--output': config.outputDir = args[++i]; break;
      case '--headless': config.headless = true; break;
      case '--dry-run': config.dryRun = true; break;
      case '--download-only': config.downloadOnly = true; break;
      case '--url': config.flowUrl = args[++i]; break;
    }
  }
  return config;
}

// ============================================================
// EXTRACT PROMPTS
// ============================================================
function extractPrompts(file, start, end) {
  const content = fs.readFileSync(file, 'utf-8');
  const prompts = [];
  for (const line of content.split('\n')) {
    const match = line.match(/^\(Cena (\d+)\)/);
    if (match) {
      const num = parseInt(match[1]);
      if (num >= start && num <= end) {
        prompts.push({ num, text: line.trim() });
      }
    }
  }
  return prompts;
}

// ============================================================
// MAIN
// ============================================================
async function main() {
  const config = parseArgs();

  // Extract prompts
  const prompts = extractPrompts(config.promptsFile, config.start, config.end);
  console.log(`📋 ${prompts.length} prompts (Cenas ${config.start}-${config.end})`);

  if (prompts.length === 0) {
    console.error('❌ Nenhum prompt encontrado no range');
    process.exit(1);
  }

  if (config.dryRun) {
    prompts.forEach(p => console.log(`  Cena ${p.num}: ${p.text.substring(0, 80)}...`));
    console.log(`\n✅ Dry run — ${prompts.length} prompts seriam processados`);
    process.exit(0);
  }

  // Create output dir
  fs.mkdirSync(config.outputDir, { recursive: true });

  // Check which scenes already exist
  const existing = new Set();
  if (fs.existsSync(config.outputDir)) {
    for (const file of fs.readdirSync(config.outputDir)) {
      const m = file.match(/Cena[_\s]*(\d+)/i);
      if (m) existing.add(parseInt(m[1]));
    }
  }
  const pending = prompts.filter(p => !existing.has(p.num));
  console.log(`⏭️  ${existing.size} cenas já existem, ${pending.length} pendentes`);

  if (pending.length === 0) {
    console.log('✅ Todas as cenas já foram geradas!');
    process.exit(0);
  }

  // Load puppeteer
  let puppeteer;
  try {
    puppeteer = require('puppeteer-core');
  } catch {
    console.log('📦 Instalando puppeteer-core...');
    execSync('npm install puppeteer-core', { stdio: 'inherit' });
    puppeteer = require('puppeteer-core');
  }

  // Connect to Chrome on debug port (9222)
  // Launch Chrome first: killall "Google Chrome"; cp -r ~/Library/Application\ Support/Google/Chrome/Profile\ 4 /tmp/chrome-debug-profile/; /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --user-data-dir=/tmp/chrome-debug-profile --remote-debugging-port=9222 --no-first-run "https://labs.google/fx/tools/flow" &
  console.log('🔌 Conectando ao Chrome (localhost:9222)...');
  let browser;
  try {
    browser = await puppeteer.connect({
      browserURL: 'http://localhost:9222',
      defaultViewport: null,
    });
  } catch (err) {
    console.error('❌ Chrome não acessível na 9222. Lance com:');
    console.error('   killall "Google Chrome"; mkdir -p /tmp/chrome-debug-profile; cp -r ~/Library/Application\\ Support/Google/Chrome/Profile\\ 4 /tmp/chrome-debug-profile/ 2>/dev/null; nohup /Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --user-data-dir=/tmp/chrome-debug-profile --remote-debugging-port=9222 --no-first-run "https://labs.google/fx/tools/flow" &');
    process.exit(1);
  }

  // Find existing Flow tab or open new one
  const pages = await browser.pages();
  let page = pages.find(p => p.url().includes('labs.google/fx'));
  if (page) {
    console.log('✅ Tab do Flow encontrada — usando existente');
    await page.bringToFront();
  } else {
    page = await browser.newPage();
    console.log(`🌐 Navegando para ${config.flowUrl}...`);
    await page.goto(config.flowUrl, { waitUntil: 'networkidle2', timeout: 30000 });
  }
  await sleep(3000);

  // If we're on the project gallery (no editor visible), click the first project
  const hasEditor = await page.$('div[data-slate-editor="true"]');
  if (!hasEditor) {
    console.log('📂 Na galeria de projetos — entrando no primeiro projeto...');
    // Find first project thumbnail image
    const firstProject = await page.evaluate(() => {
      const images = document.querySelectorAll('img');
      for (const img of images) {
        if (img.src.includes('getMediaUrlRedirect') && img.offsetParent) {
          const rect = img.getBoundingClientRect();
          return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
        }
      }
      return null;
    });
    if (firstProject) {
      await page.mouse.click(firstProject.x, firstProject.y);
      await sleep(5000);
      console.log('✅ Dentro do projeto');
    } else {
      console.error('❌ Nenhum projeto encontrado na galeria');
      process.exit(1);
    }
  }

  // Log current mode
  const modelCheck = await page.evaluate(() => {
    const btns = document.querySelectorAll('button');
    for (const b of btns) {
      const t = b.textContent.trim();
      if ((t.includes('Vídeo') || t.includes('Video')) && b.offsetParent) return 'video';
      if (t.includes('Banana') && b.offsetParent) return 'image';
    }
    return 'unknown';
  });
  console.log(`📷 Modo: ${modelCheck}`);

  console.log('✅ Conectado ao Google Labs Flow');

  // === DOWNLOAD-ONLY MODE ===
  if (config.downloadOnly) {
    console.log(`\n📥 Modo download-only — baixando ${pending.length} cenas do Flow...`);
    let totalDl = 0;
    let staleRounds = 0;
    const MAX_ROUNDS = 120; // 120 * 5s = 10 min max

    while (totalDl < pending.length && staleRounds < MAX_ROUNDS) {
      // Aggressive scroll to load virtual scroll items
      const scrollHeight = await page.evaluate(() => document.body.scrollHeight);
      const viewportH = await page.evaluate(() => window.innerHeight);
      for (let y = 0; y < scrollHeight; y += Math.floor(viewportH * 0.7)) {
        await page.evaluate((pos) => window.scrollTo(0, pos), y);
        await sleep(500);
      }
      await page.evaluate(() => window.scrollTo(0, 0));
      await sleep(1000);

      const dl = await downloadAllReady(page, pending, config);
      if (dl > 0) {
        totalDl += dl;
        staleRounds = 0;
        console.log(`  📥 +${dl} (total: ${totalDl}/${pending.length})`);
      } else {
        staleRounds++;
        if (staleRounds % 12 === 0) {
          console.log(`  ⏳ ${totalDl}/${pending.length} prontas (${staleRounds * 5}s sem novas)`);
        }
      }
      await sleep(5000);
    }
    console.log(`\n════════════════════════════════════════`);
    console.log(`✅ ${totalDl} baixadas de ${pending.length} esperadas`);
    console.log(`📁 Output: ${config.outputDir}`);
    browser.disconnect();
    return;
  }

  // === PHASE 1: Submit all prompts rapidly (10-15s between each) ===
  let submitted = 0;
  let downloaded = 0;
  let failed = [];
  const submittedNums = [];

  console.log(`\n🚀 ${pending.length} cenas pendentes — submissão rápida (10-15s)`);

  for (const prompt of pending) {
    const success = await submitPrompt(page, prompt, config);
    if (success) {
      submitted++;
      submittedNums.push(prompt.num);
      console.log(`  ✅ Cena ${prompt.num} (${submitted}/${pending.length})`);
    } else {
      failed.push(prompt);
      console.log(`  ❌ Cena ${prompt.num} falhou`);
    }
    // 12s between submissions
    await sleep(12000);
  }

  console.log(`\n📋 ${submitted} submetidas, ${failed.length} falharam`);

  // === PHASE 2: Download all generated images ===
  console.log(`\n📥 Baixando imagens geradas...`);
  let staleRounds = 0;
  const MAX_STALE = 60; // 60 rounds * 10s = 10 min max wait

  while (downloaded < submitted && staleRounds < MAX_STALE) {
    await sleep(config.pollInterval);
    const dl = await downloadAllReady(page, pending, config);
    if (dl > 0) {
      downloaded += dl;
      staleRounds = 0;
      console.log(`  📥 +${dl} (total: ${downloaded}/${submitted})`);
    } else {
      staleRounds++;
      if (staleRounds % 6 === 0) {
        // Scroll to trigger lazy loading
        await page.evaluate(() => { window.scrollTo(0, document.body.scrollHeight); });
        await sleep(1000);
        await page.evaluate(() => { window.scrollTo(0, 0); });
        console.log(`  ⏳ ${downloaded}/${submitted} prontas (${staleRounds * 10}s sem novas)`);
      }
    }
  }

  // === PHASE 3: Retry failed ===
  if (failed.length > 0) {
    console.log(`\n🔄 Retentando ${failed.length} falhados...`);
    for (const prompt of failed) {
      const success = await submitPrompt(page, prompt, config);
      if (success) {
        submitted++;
        await sleep(12000);
      }
    }
    for (let i = 0; i < 30; i++) {
      await sleep(config.pollInterval);
      const dl = await downloadAllReady(page, pending, config);
      if (dl > 0) { downloaded += dl; console.log(`  📥 +${dl} (retry)`); }
    }
  }

  console.log(`\n════════════════════════════════════════`);
  console.log(`✅ ${downloaded} baixadas de ${submitted} submetidas`);
  console.log(`📁 Output: ${config.outputDir}`);
  if (failed.length > 0) {
    console.log(`⚠️  ${failed.length} falharam: Cenas ${failed.map(p => p.num).join(', ')}`);
  }

  // Não fecha o browser — é o Chrome do usuário
  browser.disconnect();
}

// ============================================================
// SUBMIT PROMPT
// ============================================================
async function submitPrompt(page, prompt, config) {
  try {
    // Click on the Slate editor to focus it (like a human clicking)
    const editor = await page.$('div[data-slate-editor="true"]');
    if (!editor) {
      console.error('    ❌ Editor Slate não encontrado');
      return false;
    }

    await editor.click();
    await sleep(300);

    // Select all and delete (Cmd+A, Backspace)
    await page.keyboard.down('Meta');
    await page.keyboard.press('a');
    await page.keyboard.up('Meta');
    await page.keyboard.press('Backspace');
    await sleep(300);

    // Type the prompt like a human (character by character)
    await page.keyboard.type(prompt.text, { delay: 5 });
    await sleep(800);

    // Verify text was entered
    const editorText = await page.evaluate(() => {
      const ed = document.querySelector('div[data-slate-editor="true"]');
      return ed ? ed.textContent.length : 0;
    });
    if (editorText < 10) {
      console.error('    ❌ Texto não apareceu no editor');
      return false;
    }

    // Click the submit button (arrow_forward + "Criar")
    const clicked = await page.evaluate(() => {
      const buttons = document.querySelectorAll('button');
      // Find the "arrow_forward Criar" button (NOT the "add_2 Criar")
      for (const btn of buttons) {
        if (btn.textContent.includes('arrow_forward') && btn.textContent.includes('Criar') && !btn.disabled && btn.offsetParent) {
          btn.click();
          return true;
        }
      }
      return false;
    });

    return clicked;
  } catch (err) {
    console.error(`    ❌ Erro ao submeter: ${err.message}`);
    return false;
  }
}

// ============================================================
// WAIT FOR GENERATION
// ============================================================
async function waitForGeneration(page, expectedCount, config) {
  const startTime = Date.now();
  let lastVideoCount = 0;

  while (Date.now() - startTime < config.maxWaitTime * expectedCount) {
    await sleep(config.pollInterval);

    const videoCount = await page.evaluate(() => {
      return document.querySelectorAll('video[src*="storage.googleapis.com"], video[src*="getMediaUrlRedirect"]').length;
    });

    if (videoCount > lastVideoCount) {
      console.log(`    🎬 ${videoCount} vídeos detectados...`);
      lastVideoCount = videoCount;
    }

    // Check for errors
    const hasError = await page.evaluate(() => {
      const errorTexts = ['não pode ser criado', 'cannot be created', 'policy', 'violates', 'error'];
      const elements = document.querySelectorAll('div, span, p');
      for (const el of elements) {
        const text = (el.textContent || '').toLowerCase();
        if (errorTexts.some(e => text.includes(e)) && text.length < 200) {
          return text;
        }
      }
      return null;
    });

    if (hasError) {
      console.log(`    ⚠️ Possível erro: ${hasError.substring(0, 80)}`);
    }

    // Check if all are done (no spinners/loading)
    const isLoading = await page.evaluate(() => {
      return !!document.querySelector('[role="progressbar"], .loading, [aria-busy="true"]');
    });

    if (!isLoading && videoCount >= expectedCount) {
      console.log(`    ✅ Batch completo — ${videoCount} vídeos prontos`);
      return;
    }
  }

  console.log(`    ⏰ Timeout atingido após ${Math.round((Date.now() - startTime) / 1000)}s`);
}

// ============================================================
// DOWNLOAD ALL READY — scans page for new media and downloads
// ============================================================
async function downloadAllReady(page, prompts, config) {
  let downloaded = 0;

  // FAST SCROLL: scroll all containers to bottom + back to top, single pass
  console.log(`    🔄 scrolling...`);
  const scrollDiag = await page.evaluate(async () => {
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const scrollables = [document.scrollingElement, ...document.querySelectorAll('*')]
      .filter(el => {
        if (!el) return false;
        const cs = el === document.scrollingElement ? null : window.getComputedStyle(el);
        const overflowable = !cs || /(auto|scroll)/.test(cs.overflowY);
        return overflowable && el.scrollHeight > el.clientHeight + 100;
      })
      .slice(0, 3); // limit to 3 containers max
    let scrolledCount = 0;
    for (const el of scrollables) {
      const h = el.scrollHeight;
      const step = Math.max(400, el.clientHeight * 0.8);
      for (let y = 0; y <= h; y += step) {
        el.scrollTop = y;
        await sleep(150);
      }
      el.scrollTop = 0;
      scrolledCount++;
    }
    return { scrolledCount, totalCandidates: scrollables.length };
  });
  console.log(`    🔄 scrolled ${scrollDiag.scrolledCount} containers`);
  await sleep(800);

  // Extract all cards — INVERTED logic: media-first, then look for OWN prompt text downward in same card.
  // This prevents the "all prompts pointing to the same video" bug from walking up too far.
  const cards = await page.evaluate(() => {
    const results = [];
    const seenUrl = new Set();
    const diag = { totalVideos: 0, totalImgs: 0, validVideoSrcs: 0, matchedScene: 0, multiSceneRejected: 0, noSceneFound: 0 };

    // Helper: check if container has its own (Cena XXX) prompt text — return cena number or null
    const findCenaInContainer = (container) => {
      const txt = container.textContent || '';
      // Find ALL cena matches inside this container — should be exactly 1 if it's a real card
      const matches = [...txt.matchAll(/\(Cena[_ ]?(\d+)\)/gi)];
      if (matches.length === 0) return null;
      // If multiple, the container is too big (it's a parent of many cards) — skip
      if (matches.length > 1) return null;
      return parseInt(matches[0][1]);
    };

    // Find all media elements
    const mediaSelector = 'video[src], img[src*="getMediaUrlRedirect"]';
    const mediaEls = document.querySelectorAll(mediaSelector);

    for (const media of mediaEls) {
      // Validate media URL
      let url = null;
      let type = null;
      if (media.tagName === 'VIDEO') {
        const src = media.src || media.querySelector('source')?.src;
        if (!src) continue;
        if (!src.includes('getMediaUrlRedirect') && !src.includes('storage.googleapis.com') && !src.includes('blob:') && !src.includes('.mp4')) continue;
        url = src;
        type = 'video';
      } else if (media.tagName === 'IMG') {
        if (media.naturalWidth < 200) continue;
        url = media.src;
        type = 'image';
      }
      if (!url || seenUrl.has(url)) continue;

      // Walk up MAX 4 levels to find the smallest container that has the prompt text inside
      let container = media.parentElement;
      let sceneNum = null;
      for (let i = 0; i < 4 && container && !sceneNum; i++) {
        sceneNum = findCenaInContainer(container);
        container = container.parentElement;
      }
      if (sceneNum) {
        results.push({ sceneNum, url, type });
        seenUrl.add(url);
        diag.matchedScene++;
      } else {
        diag.noSceneFound++;
      }
    }

    // Count totals
    diag.totalVideos = document.querySelectorAll('video').length;
    diag.totalImgs = document.querySelectorAll('img[src*="getMediaUrlRedirect"]').length;
    diag.validVideoSrcs = Array.from(document.querySelectorAll('video[src]')).filter(v => {
      const s = v.src || '';
      return s.includes('getMediaUrlRedirect') || s.includes('storage.googleapis.com') || s.includes('blob:') || s.includes('.mp4');
    }).length;

    // Dedup: keep first per sceneNum (in DOM order)
    const seenScene = new Set();
    const dedup = results.filter(r => {
      if (seenScene.has(r.sceneNum)) return false;
      seenScene.add(r.sceneNum);
      return true;
    });
    return { cards: dedup, diag };
  });
  console.log(`    🔍 DIAG: videos=${cards.diag.totalVideos} valid_video_src=${cards.diag.validVideoSrcs} imgs=${cards.diag.totalImgs} matched=${cards.diag.matchedScene} no_scene_in_walkup=${cards.diag.noSceneFound}`);
  const cardsArr = cards.cards;
  // Backwards compat: rest of code expects iterable of cards
  const _origCards = cards;
  // (use cardsArr below)

  // Filter to only scenes we care about and haven't downloaded yet
  const existingFiles = new Set(fs.readdirSync(config.outputDir));

  for (const card of cardsArr) {
    if (!prompts.some(p => p.num === card.sceneNum)) continue;

    const baseName = `(Cena_${String(card.sceneNum).padStart(3, '0')})`;
    const alreadyExists = [...existingFiles].some(f => f.includes(baseName));
    if (alreadyExists) continue;

    try {
      const ext = card.type === 'video' ? '.mp4' : '.jpg';
      // Naming convention: simplified to keep canal-agnostic. Removed hardcoded "Cinematic_Realism..." suffix
      // (which only fits Canal E/F). Pattern now: (Cena_NNN).mp4 — sufficient for all canals.
      const filename = `${baseName}${ext}`;
      const filepath = path.join(config.outputDir, filename);

      const buffer = await page.evaluate(async (url) => {
        const response = await fetch(url);
        const blob = await response.blob();
        const ab = await blob.arrayBuffer();
        return Array.from(new Uint8Array(ab));
      }, card.url);

      fs.writeFileSync(filepath, Buffer.from(buffer));
      existingFiles.add(filename);
      console.log(`    📥 Cena ${card.sceneNum} (${(buffer.length / 1024 / 1024).toFixed(1)}MB) [${card.type}]`);
      downloaded++;
    } catch (err) {
      console.error(`    ❌ Download Cena ${card.sceneNum} falhou: ${err.message}`);
    }
  }

  return downloaded;
}

// ============================================================
// DOWNLOAD VIDEOS (legacy)
// ============================================================
async function downloadVideos(page, prompts, config) {
  let downloaded = 0;

  // Collect both video and image URLs from the page
  const mediaUrls = await page.evaluate(() => {
    const results = [];
    // Videos
    const videos = document.querySelectorAll('video[src*="storage.googleapis.com"], video[src*="getMediaUrlRedirect"]');
    for (const v of videos) {
      if (v.src) results.push({ url: v.src, type: 'video' });
    }
    // Images (from getMediaUrlRedirect, skip icons and small images)
    const imgs = document.querySelectorAll('img[src*="getMediaUrlRedirect"]');
    for (const img of imgs) {
      if (img.naturalWidth > 200 && img.src) results.push({ url: img.src, type: 'image' });
    }
    return results;
  });

  for (const media of mediaUrls) {
    try {
      const promptIdx = downloaded;
      if (promptIdx >= prompts.length) break;

      const prompt = prompts[promptIdx];
      const ext = media.type === 'video' ? '.mp4' : '.jpg';
      const filename = `(Cena_${String(prompt.num).padStart(3, '0')})${ext}`;
      const filepath = path.join(config.outputDir, filename);

      // Skip if any version already exists (mp4 or jpg)
      const baseName = `(Cena_${String(prompt.num).padStart(3, '0')})`;
      const existing = fs.readdirSync(config.outputDir).find(f => f.startsWith(baseName));
      if (existing) {
        console.log(`    ⏭️  ${existing} já existe`);
        downloaded++;
        continue;
      }

      // Download via fetch in browser context
      const buffer = await page.evaluate(async (mediaUrl) => {
        const response = await fetch(mediaUrl);
        const blob = await response.blob();
        const arrayBuffer = await blob.arrayBuffer();
        return Array.from(new Uint8Array(arrayBuffer));
      }, media.url);

      fs.writeFileSync(filepath, Buffer.from(buffer));
      console.log(`    📥 ${filename} (${(buffer.length / 1024 / 1024).toFixed(1)}MB) [${media.type}]`);
      downloaded++;
    } catch (err) {
      console.error(`    ❌ Download falhou: ${err.message}`);
    }
  }

  return downloaded;
}

// ============================================================
// UTILS
// ============================================================
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================
// RUN
// ============================================================
main().catch(err => {
  console.error('💥 Erro fatal:', err);
  process.exit(1);
});
