#!/usr/bin/env node
/**
 * veo3-submit-images.js — Submissão em batch de prompts de imagem no Flow (Nano Banana)
 *
 * Submete cenas 51-543 como imagens, verificando quais já existem na pasta de saída.
 * Roda conectado ao Chrome via remote debugging (port 9222).
 *
 * Uso: node scripts/veo3-submit-images.js [--start N] [--end N]
 */

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const PROMPTS_FILE = '/Users/jaci/Documents/Obsidian Vault/Projetos/Abuela Recuerda/01 - EL CURANDERO DEL PUEBLO ME DIJO QUÍTESE TODO/prompts-veo3.md';
const OUTPUT_DIR = '/Users/jaci/Documents/Obsidian Vault/Projetos/Abuela Recuerda/01 - EL CURANDERO DEL PUEBLO ME DIJO QUÍTESE TODO/Cenas';

// Parse args
let START = 51, END = 543;
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--start') START = parseInt(args[++i]);
  if (args[i] === '--end') END = parseInt(args[++i]);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  // Extract prompts
  const content = fs.readFileSync(PROMPTS_FILE, 'utf-8');
  const prompts = [];
  for (const line of content.split('\n')) {
    const match = line.match(/^\(Cena (\d+)\)/);
    if (match) {
      const num = parseInt(match[1]);
      if (num >= START && num <= END) {
        prompts.push({ num, text: line.trim() });
      }
    }
  }
  console.log(`📋 ${prompts.length} prompts (Cenas ${START}-${END})`);

  // Check existing
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const existing = new Set();
  for (const f of fs.readdirSync(OUTPUT_DIR)) {
    const m = f.match(/Cena[_\s]*(\d+)/i);
    if (m) existing.add(parseInt(m[1]));
  }

  const pending = prompts.filter(p => !existing.has(p.num));
  console.log(`⏭️  ${prompts.length - pending.length} já existem, ${pending.length} pendentes`);

  if (pending.length === 0) {
    console.log('✅ Todas as cenas já foram submetidas/baixadas!');
    return;
  }

  // Connect
  const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222', defaultViewport: null });
  const pages = await browser.pages();
  const page = pages.find(p => p.url().includes('labs.google/fx'));
  if (!page) { console.error('❌ Tab do Flow não encontrada'); browser.disconnect(); return; }
  await page.bringToFront();
  console.log('✅ Conectado ao Flow');

  let submitted = 0;
  let failed = [];
  const startTime = Date.now();

  for (const prompt of pending) {
    const success = await submitPrompt(page, prompt);
    if (success) {
      submitted++;
      if (submitted % 10 === 0 || submitted === 1) {
        const elapsed = ((Date.now() - startTime) / 60000).toFixed(1);
        const rate = (submitted / (Date.now() - startTime) * 60000).toFixed(1);
        const eta = ((pending.length - submitted) / rate).toFixed(0);
        console.log(`📊 ${submitted}/${pending.length} submetidas | ${elapsed}min | ~${rate}/min | ETA ~${eta}min`);
      }
    } else {
      failed.push(prompt);
      console.log(`  ❌ Cena ${prompt.num} falhou`);
    }

    // 10s between submissions
    await sleep(10000);
  }

  console.log(`\n════════════════════════════════════════`);
  console.log(`✅ ${submitted} submetidas, ${failed.length} falharam`);
  if (failed.length > 0) {
    console.log(`❌ Falharam: ${failed.map(p => p.num).join(', ')}`);
  }
  console.log(`\n📥 Rode o downloader pra baixar:`);
  console.log(`   node scripts/veo3-downloader.js`);

  browser.disconnect();
}

async function submitPrompt(page, prompt) {
  try {
    const editor = await page.$('div[data-slate-editor="true"]');
    if (!editor) { console.error('    ❌ Editor não encontrado'); return false; }

    await editor.click();
    await sleep(300);

    // Select all + delete
    await page.keyboard.down('Meta');
    await page.keyboard.press('a');
    await page.keyboard.up('Meta');
    await page.keyboard.press('Backspace');
    await sleep(300);

    // Type prompt
    await page.keyboard.type(prompt.text, { delay: 3 });
    await sleep(500);

    // Verify
    const textLen = await page.evaluate(() => {
      const ed = document.querySelector('div[data-slate-editor="true"]');
      return ed ? ed.textContent.length : 0;
    });
    if (textLen < 10) { console.error('    ❌ Texto não apareceu'); return false; }

    // Click submit
    const clicked = await page.evaluate(() => {
      const buttons = document.querySelectorAll('button');
      for (const btn of buttons) {
        if (btn.textContent.includes('arrow_forward') && btn.textContent.includes('Criar') && !btn.disabled && btn.offsetParent) {
          btn.click();
          return true;
        }
      }
      // Fallback: any Criar button that's not disabled
      for (const btn of buttons) {
        if (btn.textContent.includes('Criar') && !btn.disabled && btn.offsetParent && !btn.textContent.includes('add_2')) {
          btn.click();
          return true;
        }
      }
      return false;
    });

    if (clicked) {
      process.stdout.write(`  ✅ Cena ${String(prompt.num).padStart(3, '0')} (${textLen} chars)\n`);
    }
    return clicked;
  } catch (err) {
    console.error(`    ❌ Erro: ${err.message.substring(0, 60)}`);
    return false;
  }
}

main().catch(err => {
  console.error('💥 Erro fatal:', err);
  process.exit(1);
});
