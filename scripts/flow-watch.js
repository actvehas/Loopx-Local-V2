#!/usr/bin/env node
/**
 * flow-watch.js — Download tempo-real de cenas do Flow.
 *
 * Conceito (vindo da extensão Chrome flow-extension):
 *  - Injeta MutationObserver na tab do Flow
 *  - Cada nova cena (vídeo/imagem) dispara callback page→Node via exposeFunction
 *  - Node baixa direto com https.get (concurrency 6) — sem serializar via page.evaluate
 *  - Sai quando todas as cenas pendentes baixaram, ou após --max-wait min sem progresso
 *
 * Uso:
 *   # rodar EM PARALELO ao flow-submit.js (em outro terminal)
 *   node scripts/flow-watch.js prompts.md --output ./Cenas --port 9222
 *
 *   # ou rodar APÓS submit, ele apanha as cenas já submetidas e espera as restantes
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const puppeteer = require('puppeteer-core');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function parseArgs() {
  const args = process.argv.slice(2);
  if (!args[0] || args[0] === '--help') {
    console.log('Uso: node flow-watch.js <prompts-file> --output <dir> [--port 9222] [--start N] [--end N] [--concurrency 6] [--max-idle 600]');
    process.exit(0);
  }
  const cfg = { promptsFile: args[0], outputDir: './Cenas', start: 1, end: 9999, port: 9222, concurrency: 6, maxIdleSec: 600 };
  for (let i = 1; i < args.length; i++) {
    switch (args[i]) {
      case '--output':      cfg.outputDir = args[++i]; break;
      case '--start':       cfg.start = parseInt(args[++i]); break;
      case '--end':         cfg.end = parseInt(args[++i]); break;
      case '--port':        cfg.port = parseInt(args[++i]); break;
      case '--concurrency': cfg.concurrency = parseInt(args[++i]); break;
      case '--max-idle':    cfg.maxIdleSec = parseInt(args[++i]); break;
    }
  }
  return cfg;
}

function extractPromptNums(file, start, end) {
  const out = [];
  for (const line of fs.readFileSync(file, 'utf-8').split('\n')) {
    const m = line.match(/^\s*\(Cena[_ ]?(\d+)\)/i);
    if (m) {
      const n = parseInt(m[1]);
      if (n >= start && n <= end) out.push(n);
    }
  }
  return out;
}

function existingScenes(dir) {
  if (!fs.existsSync(dir)) return new Set();
  const out = new Set();
  for (const f of fs.readdirSync(dir)) {
    const m = f.match(/\(Cena_(\d+)\)/);
    if (m) out.add(parseInt(m[1]));
  }
  return out;
}

// Download direto via Node http(s) — bypassa page.evaluate (3-5x mais rápido)
function downloadUrl(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https:') ? https : http;
    const req = lib.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      // segue redirect manual (Flow usa 302 frequentemente)
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return downloadUrl(res.headers.location).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error('HTTP ' + res.statusCode));
      }
      const ct = res.headers['content-type'] || '';
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ buffer: Buffer.concat(chunks), contentType: ct }));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(120000, () => { req.destroy(new Error('timeout')); });
  });
}

// Concurrency-limited queue
function makeQueue(concurrency) {
  let active = 0;
  const waiting = [];
  const next = () => {
    if (waiting.length === 0 || active >= concurrency) return;
    active++;
    const { fn, resolve, reject } = waiting.shift();
    fn().then((v) => { active--; resolve(v); next(); },
              (e) => { active--; reject(e); next(); });
  };
  return (fn) => new Promise((resolve, reject) => { waiting.push({ fn, resolve, reject }); next(); });
}

async function main() {
  const cfg = parseArgs();
  const wantedNums = extractPromptNums(cfg.promptsFile, cfg.start, cfg.end);
  if (!wantedNums.length) { console.error('❌ Nenhum prompt no range'); process.exit(1); }

  fs.mkdirSync(cfg.outputDir, { recursive: true });
  const already = existingScenes(cfg.outputDir);
  const pending = new Set(wantedNums.filter(n => !already.has(n)));
  console.log(`📋 ${wantedNums.length} cenas | ${already.size} já existem | ${pending.size} pendentes`);
  if (!pending.size) { console.log('✅ Tudo já baixado'); return; }

  // Conecta Chrome
  const browser = await puppeteer.connect({ browserURL: `http://localhost:${cfg.port}`, defaultViewport: null });
  const pages = await browser.pages();
  const page = pages.find(p => /labs\.google.*\/flow\/project\//.test(p.url()))
            || pages.find(p => p.url().includes('labs.google'));
  if (!page) { console.error(`❌ Tab Flow não encontrada na :${cfg.port}`); process.exit(1); }
  await page.bringToFront();
  console.log(`✅ Conectado: ${page.url().substring(0,80)}`);

  // CDP: desabilita throttling em background pra observer não congelar
  try {
    const cdp = await page.target().createCDPSession();
    await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true });
    await cdp.send('Page.setWebLifecycleState', { state: 'active' }).catch(() => {});
  } catch (_) {}

  // Stats
  const t0 = Date.now();
  let lastProgress = Date.now();
  let downloaded = 0, failed = 0;
  const inflight = new Set();
  const queue = makeQueue(cfg.concurrency);

  // Bridge page → Node
  await page.exposeFunction('__onMediaReady', async (sceneNum, url, type) => {
    if (!pending.has(sceneNum) || inflight.has(sceneNum)) return;
    inflight.add(sceneNum);
    queue(async () => {
      try {
        const { buffer, contentType } = await downloadUrl(url);
        const isVideo = contentType.includes('video') || contentType.includes('mp4');
        const ext = isVideo ? '.mp4' : '.jpg';
        const baseName = `(Cena_${String(sceneNum).padStart(3,'0')})[Cinematic_Realism]`;
        const otherExt = isVideo ? '.jpg' : '.mp4';
        const otherFile = path.join(cfg.outputDir, baseName + otherExt);
        if (fs.existsSync(otherFile)) fs.unlinkSync(otherFile);
        const target = path.join(cfg.outputDir, baseName + ext);
        fs.writeFileSync(target, buffer);
        downloaded++; pending.delete(sceneNum); lastProgress = Date.now();
        const mb = (buffer.length/1024/1024).toFixed(1);
        const left = pending.size;
        console.log(`📥 Cena ${String(sceneNum).padStart(3,'0')} ${mb}MB [${isVideo?'video':'img'}] · ${downloaded} ok, ${left} restam`);
      } catch (e) {
        failed++;
        inflight.delete(sceneNum);
        console.error(`❌ Cena ${sceneNum}: ${e.message}`);
      }
    });
  });

  // Injeta observer na página
  await page.evaluate(() => {
    if (window.__flowWatchInjected) return;
    window.__flowWatchInjected = true;
    const seen = new Set();
    const sceneToUrl = new Map();
    const findSceneNumNear = (node) => {
      let el = node;
      for (let i = 0; i < 12 && el; i++, el = el.parentElement) {
        const m = (el.textContent || '').match(/\(Cena[_ ]?(\d+)\)/i);
        if (m) return parseInt(m[1]);
      }
      return null;
    };
    const report = (url, type, sceneNum) => {
      if (!url || sceneNum == null || seen.has(url)) return;
      // Se já temos uma URL pra essa cena e a nova é vídeo, prefere vídeo (sobrescreve imagem)
      const prev = sceneToUrl.get(sceneNum);
      if (prev && prev.type === 'video' && type !== 'video') return;
      seen.add(url);
      sceneToUrl.set(sceneNum, { url, type });
      window.__onMediaReady(sceneNum, url, type);
    };
    const scan = (node) => {
      if (!(node instanceof HTMLElement)) return;
      const vids = node.matches?.('video[src]') ? [node] : node.querySelectorAll?.('video[src]') || [];
      for (const v of vids) {
        if (!v.src || v.src.length < 50) continue;
        const n = findSceneNumNear(v);
        report(v.src, 'video', n);
      }
      const imgs = node.matches?.('img[src*="getMediaUrlRedirect"]') ? [node] : node.querySelectorAll?.('img[src*="getMediaUrlRedirect"]') || [];
      for (const img of imgs) {
        if (img.naturalWidth && img.naturalWidth < 100) continue;
        const n = findSceneNumNear(img);
        report(img.src, 'image', n);
      }
    };
    scan(document.body);
    new MutationObserver((muts) => {
      for (const m of muts) {
        m.addedNodes.forEach(scan);
        if (m.type === 'attributes' && m.target instanceof HTMLElement) scan(m.target);
      }
    }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
    console.log('[flow-watch] observer ativo');
  });

  console.log('👀 Observer ativo — esperando cenas (max-idle ' + cfg.maxIdleSec + 's)');

  // Loop principal: espera todas terminarem ou idle timeout
  while (pending.size > 0) {
    await sleep(2000);
    const idleSec = (Date.now() - lastProgress) / 1000;
    if (idleSec > cfg.maxIdleSec) {
      console.log(`⏰ Idle ${idleSec.toFixed(0)}s sem progresso — saindo. Faltam: ${[...pending].slice(0,30).join(',')}${pending.size>30?'...':''}`);
      break;
    }
    // Re-scan periódico (caso observer perca alguma)
    if (Math.floor(idleSec) % 30 === 0 && idleSec > 0) {
      await page.evaluate(() => {
        document.querySelectorAll('video[src],img[src*="getMediaUrlRedirect"]').forEach(el => {
          el.dispatchEvent(new Event('src-rescan'));
        });
      }).catch(() => {});
    }
  }

  const elapsed = ((Date.now() - t0) / 60000).toFixed(1);
  console.log(`\n════════════════════════════════════════`);
  console.log(`✅ ${downloaded} baixadas | ${failed} falhas | ${pending.size} pendentes | ${elapsed}min`);
  console.log(`📁 ${cfg.outputDir}`);
  await browser.disconnect();
  process.exit(pending.size > 0 ? 2 : 0);
}

main().catch(e => { console.error('💥', e); process.exit(1); });
