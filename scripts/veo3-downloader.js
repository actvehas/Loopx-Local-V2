#!/usr/bin/env node
/**
 * veo3-downloader.js — Download de vídeos VEO3 via scroll do container interno do Flow
 *
 * O Flow usa overflow:auto num div interno (não no body). Este script:
 * 1. Encontra o container scrollável (29k+ px)
 * 2. Scrolla devagar, 400px por vez
 * 3. A cada posição, extrai cenas visíveis no DOM (Cena NNN → video/img URL)
 * 4. Baixa cada uma imediatamente
 *
 * Uso: node scripts/veo3-downloader.js
 */

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const args = process.argv.slice(2);
const OUTPUT_DIR = args[0] || '';
const TOTAL_SCENES = parseInt(args[1] || '0');
if (!OUTPUT_DIR || !TOTAL_SCENES) {
  console.error('Uso: node veo3-downloader.js <output_dir> <total_scenes> [--suffix <suffix>]');
  process.exit(1);
}
const suffixIdx = args.indexOf('--suffix');
const FILENAME_SUFFIX = suffixIdx >= 0 ? args[suffixIdx + 1] : '';

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Check existing
  const existing = new Set();
  for (const f of fs.readdirSync(OUTPUT_DIR)) {
    const m = f.match(/Cena[_\s]*(\d+)/i);
    if (m) existing.add(parseInt(m[1]));
  }
  const missing = [];
  for (let i = 1; i <= TOTAL_SCENES; i++) {
    if (!existing.has(i)) missing.push(i);
  }
  console.log(`📁 ${existing.size}/50 baixadas | ❌ ${missing.length} faltando: ${missing.join(', ')}`);

  if (missing.length === 0) {
    console.log('✅ Todas as cenas já foram baixadas!');
    return;
  }

  // Connect
  const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222', defaultViewport: null });
  const pages = await browser.pages();
  const page = pages.find(p => p.url().includes('labs.google/fx'));
  if (!page) { console.error('❌ Tab do Flow não encontrada'); browser.disconnect(); return; }
  await page.bringToFront();
  console.log('✅ Conectado à tab do Flow');

  // Enable CDP network monitoring
  const cdp = await page.target().createCDPSession();
  await cdp.send('Network.enable');

  // Find the scrollable container
  const containerInfo = await page.evaluate(() => {
    const divs = [...document.querySelectorAll('div')];
    const scrollable = divs
      .filter(d => {
        const style = getComputedStyle(d);
        return (style.overflow === 'auto' || style.overflow === 'scroll' ||
                style.overflowY === 'auto' || style.overflowY === 'scroll') &&
               d.scrollHeight > 1000;
      })
      .map(d => ({
        scrollHeight: d.scrollHeight,
        clientHeight: d.clientHeight,
        className: d.className?.substring(0, 80),
      }))
      .sort((a, b) => b.scrollHeight - a.scrollHeight);
    return scrollable[0] || null;
  });

  if (!containerInfo) {
    console.error('❌ Container scrollável não encontrado');
    browser.disconnect();
    return;
  }
  console.log(`📜 Container: ${containerInfo.scrollHeight}px scroll, ${containerInfo.clientHeight}px visível`);

  // Scroll through the container slowly, extracting scenes at each position
  const SCROLL_STEP = 300;
  const SCROLL_PAUSE = 800;
  let downloaded = 0;
  let lastLoggedScroll = -1;

  const totalPositions = Math.ceil(containerInfo.scrollHeight / SCROLL_STEP);
  console.log(`🔄 ${totalPositions} posições de scroll (${SCROLL_STEP}px cada, ${SCROLL_PAUSE}ms pausa)\n`);

  // First scroll to top
  await page.evaluate(() => {
    const divs = [...document.querySelectorAll('div')];
    const container = divs
      .filter(d => {
        const style = getComputedStyle(d);
        return (style.overflow === 'auto' || style.overflowY === 'auto') && d.scrollHeight > 1000;
      })
      .sort((a, b) => b.scrollHeight - a.scrollHeight)[0];
    if (container) container.scrollTop = 0;
  });
  await sleep(1000);

  for (let pos = 0; pos <= containerInfo.scrollHeight; pos += SCROLL_STEP) {
    // Scroll to position
    await page.evaluate((scrollPos) => {
      const divs = [...document.querySelectorAll('div')];
      const container = divs
        .filter(d => {
          const style = getComputedStyle(d);
          return (style.overflow === 'auto' || style.overflowY === 'auto') && d.scrollHeight > 1000;
        })
        .sort((a, b) => b.scrollHeight - a.scrollHeight)[0];
      if (container) container.scrollTop = scrollPos;
    }, pos);
    await sleep(SCROLL_PAUSE);

    // Extract visible scenes with media
    const scenes = await page.evaluate(() => {
      const results = [];

      // Find all scene prompt text nodes
      const allDivs = document.querySelectorAll('div');
      for (const div of allDivs) {
        // Only leaf-ish divs with scene text
        if (div.children.length > 3) continue;
        const text = (div.textContent || '').trim();
        const match = text.match(/^\(Cena[_ ]?(\d+)\)/i);
        if (!match) continue;

        const num = parseInt(match[1]);
        const rect = div.getBoundingClientRect();

        // Must be in viewport
        if (rect.top > window.innerHeight + 200 || rect.bottom < -200) continue;

        // Walk up to find the card container with media
        let parent = div.parentElement;
        for (let i = 0; i < 12; i++) {
          if (!parent) break;

          // Check for video
          const vid = parent.querySelector('video');
          if (vid) {
            const src = vid.src || vid.currentSrc || vid.querySelector('source')?.src;
            if (src && src.length > 10) {
              results.push({ num, url: src, type: 'video' });
              break;
            }
          }

          // Check for image (high-res, not icon)
          const imgs = parent.querySelectorAll('img');
          for (const img of imgs) {
            if (img.naturalWidth > 200 && img.src &&
                (img.src.includes('getMediaUrlRedirect') || img.src.includes('storage.googleapis.com'))) {
              results.push({ num, url: img.src, type: 'image' });
              break;
            }
          }
          if (results.length > 0 && results[results.length - 1].num === num) break;

          parent = parent.parentElement;
        }
      }

      return results;
    });

    // Download new scenes
    for (const scene of scenes) {
      if (existing.has(scene.num)) continue;

      // Skip blob URLs — we can't fetch those directly
      if (scene.url.startsWith('blob:')) {
        // Try to get the actual video src via the video element
        const actualUrl = await page.evaluate((sceneNum) => {
          const allDivs = document.querySelectorAll('div');
          for (const div of allDivs) {
            if (div.children.length > 3) continue;
            const text = (div.textContent || '').trim();
            if (!text.match(new RegExp(`^\\(Cena[_ ]?0*${sceneNum}\\)`, 'i'))) continue;

            let parent = div.parentElement;
            for (let i = 0; i < 12; i++) {
              if (!parent) break;
              const vid = parent.querySelector('video');
              if (vid) {
                // Check poster, source tags, etc
                const source = vid.querySelector('source');
                if (source?.src && !source.src.startsWith('blob:')) return source.src;
                if (vid.poster && !vid.poster.startsWith('blob:')) return vid.poster;
                // Check data attributes
                for (const attr of vid.attributes) {
                  if (attr.value.includes('getMediaUrlRedirect') || attr.value.includes('storage.googleapis.com')) {
                    return attr.value;
                  }
                }
              }
              parent = parent.parentElement;
            }
          }
          return null;
        }, scene.num);

        if (actualUrl) {
          scene.url = actualUrl;
        } else {
          continue; // Skip blob URLs we can't resolve
        }
      }

      const ext = scene.type === 'video' ? '.mp4' : '.jpg';
      const filename = FILENAME_SUFFIX ? `(Cena_${String(scene.num).padStart(3, '0')})[${FILENAME_SUFFIX}${ext}` : `(Cena_${String(scene.num).padStart(3, '0')})${ext}`;
      const filepath = path.join(OUTPUT_DIR, filename);

      try {
        const buffer = await page.evaluate(async (url) => {
          const response = await fetch(url);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const blob = await response.blob();
          const ab = await blob.arrayBuffer();
          return Array.from(new Uint8Array(ab));
        }, scene.url);

        fs.writeFileSync(filepath, Buffer.from(buffer));
        existing.add(scene.num);
        downloaded++;
        const sizeMB = (buffer.length / 1024 / 1024).toFixed(1);
        console.log(`  ✅ Cena ${String(scene.num).padStart(3, '0')} — ${sizeMB}MB [${scene.type}] (${existing.size}/${TOTAL_SCENES})`);
      } catch (err) {
        console.error(`  ❌ Cena ${scene.num}: ${err.message.substring(0, 80)}`);
      }
    }

    // Progress log every ~3000px
    const scrollPct = Math.round(pos / containerInfo.scrollHeight * 100);
    if (scrollPct - lastLoggedScroll >= 10) {
      lastLoggedScroll = scrollPct;
      console.log(`📜 Scroll: ${scrollPct}% | Baixadas: ${existing.size}/${TOTAL_SCENES} | Novas: ${downloaded}`);
    }
  }

  // Final status
  const finalMissing = [];
  for (let i = 1; i <= TOTAL_SCENES; i++) {
    if (!existing.has(i)) finalMissing.push(i);
  }

  console.log(`\n════════════════════════════════════════`);
  console.log(`✅ ${existing.size}/${TOTAL_SCENES} cenas baixadas (${downloaded} novas)`);
  if (finalMissing.length > 0) {
    console.log(`❌ Faltando: ${finalMissing.join(', ')}`);
  } else {
    console.log(`🎉 TODAS AS CENAS BAIXADAS!`);
  }
  console.log(`📁 ${OUTPUT_DIR}`);

  await cdp.send('Network.disable');
  browser.disconnect();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

main().catch(err => {
  console.error('💥 Erro fatal:', err);
  process.exit(1);
});
