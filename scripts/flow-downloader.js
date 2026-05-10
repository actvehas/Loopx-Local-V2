// Flow gallery downloader — chunked scroll + cumulative collection (Flow uses virtual scrolling)
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = process.argv[2];
if (!OUTPUT_DIR) { console.error('Usage: node flow-downloader.js <output_dir>'); process.exit(1); }
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222', defaultViewport: null });
  const pages = await browser.pages();
  const page = pages.find(p => p.url().includes('flow/project/'));
  if (!page) { console.error('No flow project tab'); process.exit(1); }
  console.log(`📡 Conectado: ${page.url()}`);

  const findScroller = `[...document.querySelectorAll('*')].find(el => { const cs = getComputedStyle(el); return (cs.overflowY === 'auto' || cs.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 100; })`;

  const totalH = await page.evaluate(`(() => { const s = ${findScroller}; return s ? s.scrollHeight : 0; })()`);
  const viewH  = await page.evaluate(`(() => { const s = ${findScroller}; return s ? s.clientHeight : 0; })()`);
  console.log(`📐 Galeria: scrollHeight=${totalH}px viewport=${viewH}px`);

  // Cumulative collection: src → cenaNum
  const collected = new Map(); // src → cenaNum
  const STEP = Math.max(200, Math.floor(viewH * 0.4));

  console.log(`\n📜 Scrolando em passos de ${STEP}px e coletando...`);

  // Scroll back to top first
  await page.evaluate(`(() => { const s = ${findScroller}; s.scrollTop = 0; })()`);
  await sleep(800);

  let pos = 0;
  let lastTotal = -1;
  let stableRounds = 0;

  while (pos <= totalH + viewH) {
    await page.evaluate(`(() => { const s = ${findScroller}; s.scrollTop = ${pos}; })()`);
    await sleep(700);

    const found = await page.evaluate(() => {
      const videos = document.querySelectorAll('video');
      const out = [];
      for (const v of videos) {
        if (!v.src) continue;
        // Walk up DOM looking for ancestor text with (Cena NNN)
        let cenaNum = null;
        let node = v;
        for (let i = 0; i < 20 && node; i++) {
          const txt = (node.textContent || '').slice(0, 8000);
          const m = txt.match(/\(Cena[_ ]?(\d+)\)/i);
          if (m) { cenaNum = parseInt(m[1]); break; }
          node = node.parentElement;
        }
        out.push({ src: v.src, cenaNum });
      }
      return out;
    });

    let newCount = 0;
    for (const f of found) {
      if (!collected.has(f.src)) { collected.set(f.src, f.cenaNum); newCount++; }
    }
    if (newCount > 0) {
      const named = [...collected.values()].filter(x => x !== null).length;
      console.log(`   pos=${pos}px: +${newCount} novo (total ${collected.size}, ${named} c/ cena)`);
    }

    if (collected.size === lastTotal) {
      stableRounds++;
      if (stableRounds >= 5 && pos >= totalH) break;
    } else {
      stableRounds = 0;
      lastTotal = collected.size;
    }

    pos += STEP;
  }

  console.log(`\n📊 Coletados: ${collected.size} videos únicos, ${[...collected.values()].filter(x=>x).length} com cena`);

  // Build cena → src (when same cena appears multiple times, keep first)
  const byCena = new Map();
  for (const [src, num] of collected) {
    if (num && !byCena.has(num)) byCena.set(num, src);
  }

  // Also dump unmapped videos (no cena number found) so user can see them
  const unmapped = [...collected.entries()].filter(([_, num]) => !num);
  if (unmapped.length) console.log(`⚠️  ${unmapped.length} vídeos sem cena identificada — serão pulados`);

  console.log(`\n🎯 Cenas únicas a baixar: ${byCena.size}`);
  console.log(`   numeros: ${[...byCena.keys()].sort((a,b)=>a-b).join(', ')}`);

  const existing = new Set(fs.readdirSync(OUTPUT_DIR));
  let downloaded = 0, skipped = 0, failed = 0;

  for (const [num, src] of [...byCena.entries()].sort((a,b)=>a[0]-b[0])) {
    const baseName = `(Cena_${String(num).padStart(3, '0')})`;
    const filename = `${baseName}.mp4`;
    if ([...existing].some(f => f.includes(baseName))) { skipped++; continue; }
    try {
      const buf = await page.evaluate(async (url) => {
        const r = await fetch(url);
        const ab = await (await r.blob()).arrayBuffer();
        return Array.from(new Uint8Array(ab));
      }, src);
      fs.writeFileSync(path.join(OUTPUT_DIR, filename), Buffer.from(buf));
      console.log(`   📥 Cena ${num} (${(buf.length/1024/1024).toFixed(1)}MB)`);
      downloaded++;
      existing.add(filename);
    } catch (err) {
      console.error(`   ❌ Cena ${num}: ${err.message}`);
      failed++;
    }
  }

  console.log(`\n✅ Downloaded: ${downloaded} | Skipped: ${skipped} | Failed: ${failed} | Total disponível no Flow: ${byCena.size}`);
  browser.disconnect();
})();
