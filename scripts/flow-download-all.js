#!/usr/bin/env node
// Standalone downloader: scrolls the actual scrollable container in Flow,
// extracts all (Cena NNN) cards with video src, downloads to outputDir.
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const OUT = process.argv[2];
if (!OUT) { console.error('usage: node flow-download-all.js <outputDir>'); process.exit(1); }
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222', defaultViewport: null });
  const pages = await browser.pages();
  const page = pages.find(p => p.url().includes('flow'));
  if (!page) { console.error('Flow tab not found'); process.exit(1); }
  console.log('Tab:', page.url());

  // Find the scrollable container and scroll it fully
  console.log('Scrolling inner container to load all cards...');
  let lastH = 0;
  for (let i = 0; i < 80; i++) {
    const h = await page.evaluate(() => {
      const els = [...document.querySelectorAll('*')].filter(el => {
        const cs = getComputedStyle(el);
        return (cs.overflowY === 'auto' || cs.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 50;
      });
      if (!els.length) return 0;
      const c = els[0];
      c.scrollTop = c.scrollHeight;
      return c.scrollHeight;
    });
    if (h === lastH) { await sleep(1500); const h2 = await page.evaluate(() => { const els = [...document.querySelectorAll('*')].filter(el => { const cs = getComputedStyle(el); return (cs.overflowY === 'auto' || cs.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 50; }); return els[0]?.scrollHeight || 0; }); if (h2 === lastH) break; lastH = h2; continue; }
    lastH = h;
    await sleep(1200);
  }
  console.log('Final scrollHeight:', lastH);

  // Scroll back to top, then walk down collecting all cards
  await page.evaluate(() => {
    const els = [...document.querySelectorAll('*')].filter(el => { const cs = getComputedStyle(el); return (cs.overflowY === 'auto' || cs.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 50; });
    if (els[0]) els[0].scrollTop = 0;
  });
  await sleep(800);

  // Walk through container in steps, collecting cards as they materialize
  const collected = new Map(); // sceneNum -> url
  let pos = 0;
  const STEP = 800;
  while (pos <= lastH + STEP) {
    await page.evaluate((p) => {
      const els = [...document.querySelectorAll('*')].filter(el => { const cs = getComputedStyle(el); return (cs.overflowY === 'auto' || cs.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 50; });
      if (els[0]) els[0].scrollTop = p;
    }, pos);
    await sleep(700);
    const cards = await page.evaluate(() => {
      const out = [];
      const seen = new Set();
      document.querySelectorAll('div').forEach(div => {
        if (div.children.length > 3) return;
        const t = div.textContent || '';
        const m = t.match(/\(Cena[ _]?(\d+)\)/i);
        if (!m) return;
        const n = parseInt(m[1]);
        if (seen.has(n)) return;
        let c = div.parentElement;
        for (let i = 0; i < 8 && c; i++) {
          const v = c.querySelector('video[src*="getMediaUrlRedirect"], video[src*="storage.googleapis.com"]');
          if (v && v.src) { out.push({ n, url: v.src }); seen.add(n); break; }
          c = c.parentElement;
        }
      });
      return out;
    });
    for (const c of cards) if (!collected.has(c.n)) { collected.set(c.n, c.url); console.log(`  found Cena ${c.n}`); }
    pos += STEP;
  }
  console.log(`Total found: ${collected.size}`);

  // Download all not yet on disk
  const existing = new Set(fs.readdirSync(OUT));
  let downloaded = 0;
  for (const [n, url] of [...collected.entries()].sort((a, b) => a[0] - b[0])) {
    const fname = `(Cena_${String(n).padStart(3, '0')}).mp4`;
    if ([...existing].some(f => f.includes(`(Cena_${String(n).padStart(3, '0')})`))) continue;
    try {
      const buf = await page.evaluate(async (u) => {
        const r = await fetch(u);
        const ab = await (await r.blob()).arrayBuffer();
        return Array.from(new Uint8Array(ab));
      }, url);
      fs.writeFileSync(path.join(OUT, fname), Buffer.from(buf));
      console.log(`  📥 Cena ${n} (${(buf.length / 1024 / 1024).toFixed(1)}MB)`);
      downloaded++;
    } catch (e) { console.error(`  ❌ Cena ${n}: ${e.message}`); }
  }
  console.log(`\n✅ ${downloaded} novos baixados. Total no disco: ${fs.readdirSync(OUT).length}`);
  browser.disconnect();
})().catch(e => { console.error(e); process.exit(1); });
