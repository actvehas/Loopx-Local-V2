#!/usr/bin/env node
/**
 * flow-submit.js — Submete prompts no Google Labs Flow (Video/VEO ou Nano Banana)
 *
 * Fork de nano-submit.js com:
 *  - --port (default 9222)
 *  - --mode video|nano-banana (default video, antes era nano-only)
 *
 * Uso:
 *   node scripts/flow-submit.js <prompts-file> --output <dir> [--port 9223] [--mode video] [--start N] [--end N] [--delay MS]
 */

const fs = require('fs');
const puppeteer = require('puppeteer-core');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const SELECT_ALL_KEY = process.platform === 'darwin' ? 'Meta' : 'Control';

function parseArgs() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0] === '--help') {
    console.log(`Uso: node flow-submit.js <prompts-file> --output <dir> [--port 9222] [--mode video|nano-banana] [--start N] [--end N] [--delay MS]`);
    process.exit(0);
  }
  const config = { promptsFile: args[0], outputDir: null, start: 1, end: 9999, delay: 10000, port: 9222, mode: 'video' };
  for (let i = 1; i < args.length; i++) {
    switch (args[i]) {
      case '--output': config.outputDir = args[++i]; break;
      case '--start':  config.start = parseInt(args[++i]); break;
      case '--end':    config.end = parseInt(args[++i]); break;
      case '--delay':  config.delay = parseInt(args[++i]); break;
      case '--port':   config.port = parseInt(args[++i]); break;
      case '--mode':   config.mode = args[++i]; break;
    }
  }
  if (!config.outputDir) { console.error('❌ --output <dir> obrigatório'); process.exit(1); }
  return config;
}

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

async function submitPrompt(page, prompt) {
  try {
    const editor = await page.$('div[data-slate-editor="true"]');
    if (!editor) { console.error('    ❌ Editor Slate não encontrado'); return false; }
    await editor.click();
    await sleep(300);
    await page.keyboard.down(SELECT_ALL_KEY);
    await page.keyboard.press('a');
    await page.keyboard.up(SELECT_ALL_KEY);
    await page.keyboard.press('Backspace');
    await sleep(300);
    await page.keyboard.type(prompt.text, { delay: 3 });
    await sleep(500);
    const textLen = await page.evaluate(() => {
      const ed = document.querySelector('div[data-slate-editor="true"]');
      return ed ? ed.textContent.length : 0;
    });
    if (textLen < 10) { console.error('    ❌ Texto não apareceu'); return false; }
    // Submit by pressing Enter on focused editor (Flow UI now requires this)
    await editor.click();
    await sleep(150);
    await page.keyboard.press('Enter');
    await sleep(400);
    process.stdout.write(`  ✅ Cena ${String(prompt.num).padStart(3,'0')} (${textLen} chars)\n`);
    return true;
  } catch (err) {
    console.error(`    ❌ Erro: ${err.message.substring(0,80)}`);
    return false;
  }
}

async function main() {
  const config = parseArgs();
  const prompts = extractPrompts(config.promptsFile, config.start, config.end);
  console.log(`📋 ${prompts.length} prompts (Cenas ${config.start}-${config.end}) | porta ${config.port} | modo ${config.mode}`);
  if (prompts.length === 0) { console.error('❌ Nenhum prompt no range'); process.exit(1); }

  fs.mkdirSync(config.outputDir, { recursive: true });
  const existing = new Set();
  for (const f of fs.readdirSync(config.outputDir)) {
    const m = f.match(/Cena[_\s]*(\d+)/i);
    if (m) existing.add(parseInt(m[1]));
  }
  const pending = prompts.filter(p => !existing.has(p.num));
  console.log(`⏭️  ${prompts.length - pending.length} já baixadas, ${pending.length} pendentes`);
  if (pending.length === 0) { console.log('✅ Nada a submeter'); return; }

  const browser = await puppeteer.connect({ browserURL: `http://localhost:${config.port}`, defaultViewport: null });
  const pages = await browser.pages();
  // Prefer tab inside a Flow PROJECT (has editor); fallback to any labs.google tab
  const projId = process.env.FLOW_PROJECT_ID;
  let page = projId
          ? pages.find(p => p.url().includes(projId))
          : pages.find(p => /labs\.google.*\/flow\/project\//.test(p.url()))
              || pages.find(p => /labs\.google.*\/tools\/flow\/project\//.test(p.url()))
              || pages.find(p => p.url().includes('/project/'))
              || pages.find(p => p.url().includes('labs.google') && !p.url().includes('/about'));
  if (!page) {
    console.error(`❌ Tab de PROJETO do Flow não encontrada na porta ${config.port}.`);
    console.error('   Abas disponíveis:');
    pages.forEach(p => console.error('   -', p.url().substring(0,120)));
    browser.disconnect();
    return;
  }
  await page.bringToFront();
  console.log(`✅ Conectado: ${page.url().substring(0,90)}`);

  const t0 = Date.now();
  let submitted = 0;
  const failed = [];

  for (const prompt of pending) {
    const ok = await submitPrompt(page, prompt);
    if (ok) {
      submitted++;
      if (submitted % 5 === 0 || submitted === 1) {
        const mins = ((Date.now()-t0)/60000).toFixed(1);
        const rate = (submitted/(Date.now()-t0)*60000).toFixed(1);
        const eta = ((pending.length-submitted)/rate).toFixed(0);
        console.log(`📊 ${submitted}/${pending.length} | ${mins}min | ~${rate}/min | ETA ~${eta}min`);
      }
    } else {
      failed.push(prompt);
      console.log(`  ❌ Cena ${prompt.num} falhou`);
    }
    await sleep(config.delay);
  }

  console.log(`\n════════════════════════════════════════`);
  console.log(`✅ ${submitted} submetidas, ${failed.length} falharam`);
  if (failed.length > 0) console.log(`❌ Falhas: Cenas ${failed.map(p=>p.num).join(', ')}`);
  console.log(`\n📥 Pra baixar quando terminarem de gerar:`);
  console.log(`   node scripts/flow-download.js "${config.promptsFile}" --output "${config.outputDir}" --port ${config.port}`);
  browser.disconnect();
}

main().catch(err => { console.error('💥 Erro fatal:', err); process.exit(1); });
