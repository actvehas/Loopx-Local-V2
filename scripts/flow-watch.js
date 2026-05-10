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
// cookieHeader: string "name=value; name2=value2" pra autenticar no Flow
function downloadUrl(url, cookieHeader = '') {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https:') ? https : http;
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
      'Accept': '*/*',
      'Referer': 'https://labs.google/',
    };
    if (cookieHeader) headers['Cookie'] = cookieHeader;
    const req = lib.get(url, { headers }, (res) => {
      // segue redirect manual (Flow usa 302 frequentemente)
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return downloadUrl(res.headers.location, cookieHeader).then(resolve, reject);
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

  // Cookies de sessão da tab Flow (necessário pro https.get autenticar — Flow retorna 401 sem)
  const cookies = await page.cookies('https://labs.google');
  const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');
  console.log(`🍪 ${cookies.length} cookies extraídos`);

  // CDP: habilita Runtime (necessário pra page.on('console') em tabs connect()'d),
  // desabilita throttling em background.
  let cdp;
  try {
    cdp = await page.target().createCDPSession();
    await cdp.send('Runtime.enable').catch(() => {});
    await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
    await cdp.send('Page.setWebLifecycleState', { state: 'active' }).catch(() => {});
  } catch (e) {
    console.error('CDP setup falhou:', e.message);
  }

  // Stats
  const t0 = Date.now();
  let lastProgress = Date.now();
  let downloaded = 0, failed = 0;
  const inflight = new Set();
  const queue = makeQueue(cfg.concurrency);

  // Bridge page → Node via console.log + Runtime.consoleAPICalled (mais robusto que exposeFunction)
  const PREFIX = '[FLOW-WATCH-EVENT]';
  const handleEvent = async (sceneNum, url, type) => {
    console.log(`[bridge] recv Cena ${sceneNum} ${type} | pending=${pending.has(sceneNum)} inflight=${inflight.has(sceneNum)}`);
    if (!pending.has(sceneNum) || inflight.has(sceneNum)) return;
    inflight.add(sceneNum);
    queue(async () => {
      try {
        const { buffer, contentType } = await downloadUrl(url, cookieHeader);
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
  };

  // Polling drena window.__flowEvents a cada 1s (substitui bridge console)
  const drainEvents = async () => {
    try {
      const events = await page.evaluate(() => {
        const out = window.__flowEvents || [];
        window.__flowEvents = [];
        return out;
      });
      for (const ev of events) {
        if (ev.kind === 'ready') {
          console.log(`🔌 observer pronto — scanAll inicial detectou ${ev.count} cena(s)`);
        } else if (ev.kind === 'media') {
          handleEvent(ev.sceneNum, ev.url, ev.type);
        }
      }
    } catch (e) {
      console.log('[drain err]', e.message);
    }
  };
  const drainTimer = setInterval(drainEvents, 1000);

  // Injeta observer na página
  await page.evaluate((PREFIX) => {
    // limpa qualquer injeção anterior (Node pode ter reiniciado sem reload da página)
    if (window.__flowWatchObserver) try { window.__flowWatchObserver.disconnect(); } catch {}
    if (window.__flowWatchInterval) clearInterval(window.__flowWatchInterval);
    window.__flowEvents = [];
    const emit = (payload) => { window.__flowEvents.push(payload); };
    const seenUrls = new Set();
    const sceneToUrl = new Map();

    // Acha o "card mãe" que contém texto da cena E mídia.
    // Texto "(Cena N)" é IRMÃO do <video> no Flow, não ancestral — então subimos
    // do texto até achar um ancestral que tenha video/img dentro.
    const findMediaInScope = (textEl) => {
      let el = textEl;
      for (let i = 0; i < 15 && el; i++, el = el.parentElement) {
        const v = el.querySelector?.('video[src]');
        const i2 = el.querySelector?.('img[src*="getMediaUrlRedirect"]');
        if ((v && v.src.length > 50) || (i2 && (!i2.naturalWidth || i2.naturalWidth >= 100))) {
          // achou ancestral que tem media — coleta TODOS os media dentro
          const vids = [...el.querySelectorAll('video[src]')].filter(x => x.src.length > 50);
          const imgs = [...el.querySelectorAll('img[src*="getMediaUrlRedirect"]')]
                          .filter(x => !x.naturalWidth || x.naturalWidth >= 100);
          return { vids, imgs };
        }
      }
      return { vids: [], imgs: [] };
    };

    const report = (url, type, sceneNum) => {
      if (!url || sceneNum == null || seenUrls.has(url)) return;
      const prev = sceneToUrl.get(sceneNum);
      if (prev && prev.type === 'video' && type !== 'video') return;
      seenUrls.add(url);
      sceneToUrl.set(sceneNum, { url, type });
      emit({ kind: 'media', sceneNum, url, type });
    };

    const scanAll = () => {
      // 1. Acha todos os "leaf" elements que contêm "(Cena N)" no início do texto
      const nodes = [...document.querySelectorAll('p, span, div')]
        .filter(el => {
          if (el.children.length > 8) return false; // pula containers grandes
          const m = (el.textContent || '').match(/\(Cena[_ ]?(\d+)\)/i);
          return m;
        });
      const seenScenes = new Set();
      for (const textEl of nodes) {
        const m = (textEl.textContent || '').match(/\(Cena[_ ]?(\d+)\)/i);
        if (!m) continue;
        const sceneNum = parseInt(m[1]);
        if (seenScenes.has(sceneNum)) continue; // mesma cena pode aparecer em vários elements (header + variantes)
        seenScenes.add(sceneNum);
        const { vids, imgs } = findMediaInScope(textEl);
        // Prefere a 1ª variante (vídeo se houver, senão imagem)
        if (vids.length > 0) report(vids[0].src, 'video', sceneNum);
        else if (imgs.length > 0) report(imgs[0].src, 'image', sceneNum);
      }
    };

    scanAll();
    const obs = new MutationObserver(() => scanAll());
    obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
    window.__flowWatchObserver = obs;
    window.__flowWatchInterval = setInterval(scanAll, 5000);
    emit({ kind: 'ready', count: sceneToUrl.size });
  }, PREFIX);

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
  clearInterval(drainTimer);
  await browser.disconnect();
  process.exit(pending.size > 0 ? 2 : 0);
}

main().catch(e => { console.error('💥', e); process.exit(1); });
