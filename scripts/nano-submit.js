#!/usr/bin/env node
/**
 * nano-submit.js — Submit batch de prompts Nano Banana no Flow
 *
 * Fork parametrizado de veo3-submit-images.js (que tinha paths hardcoded).
 * Usa Puppeteer conectado ao Chrome em localhost:9222.
 *
 * Pré-req:
 *   1. Chrome aberto com --remote-debugging-port=9222 e logado em activedaring3@gmail.com
 *   2. Tab aberta em labs.google/fx/tools/flow
 *   3. Dentro de um projeto do Flow, modo Nano Banana (imagem) ATIVO
 *
 * Launch Chrome (one-liner):
 *   killall "Google Chrome"; mkdir -p /tmp/chrome-debug-profile; \
 *     cp -r "$HOME/Library/Application Support/Google/Chrome/Profile 4" /tmp/chrome-debug-profile/ 2>/dev/null; \
 *     nohup "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
 *       --user-data-dir=/tmp/chrome-debug-profile \
 *       --remote-debugging-port=9222 --no-first-run \
 *       "https://labs.google/fx/tools/flow" >/dev/null 2>&1 &
 *
 * Uso:
 *   node scripts/nano-submit.js <prompts-file> --output <dir> [--start N] [--end N] [--delay MS]
 */

const fs = require('fs');
const puppeteer = require('puppeteer-core');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function parseArgs() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0] === '--help') {
    console.log(`
nano-submit.js — submete prompts Nano Banana no Flow

Uso:
  node scripts/nano-submit.js <prompts-file> --output <dir> [opções]

Opções:
  --start N      Cena inicial (default: 1)
  --end N        Cena final (default: 9999)
  --delay MS     Delay entre submissões (default: 10000)
  --output DIR   Pasta de output (usada só pra detectar cenas já baixadas)

Exemplo:
  node scripts/nano-submit.js \\
    "/Users/jaci/Documents/Obsidian Vault/Projetos/When You Get Old/01 - The Rule Medicare Doesnt Tell You About Long-Term Care/prompts-nano.md" \\
    --output "/Users/jaci/Documents/Obsidian Vault/Projetos/When You Get Old/01 - The Rule Medicare Doesnt Tell You About Long-Term Care/Cenas" \\
    --start 1 --end 5
`);
    process.exit(0);
  }

  const config = {
    promptsFile: args[0],
    outputDir: null,
    start: 1,
    end: 9999,
    delay: 10000,
  };
  for (let i = 1; i < args.length; i++) {
    switch (args[i]) {
      case '--output': config.outputDir = args[++i]; break;
      case '--start':  config.start = parseInt(args[++i]); break;
      case '--end':    config.end = parseInt(args[++i]); break;
      case '--delay':  config.delay = parseInt(args[++i]); break;
    }
  }
  if (!config.outputDir) {
    console.error('❌ --output <dir> é obrigatório');
    process.exit(1);
  }
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

    await page.keyboard.down('Meta');
    await page.keyboard.press('a');
    await page.keyboard.up('Meta');
    await page.keyboard.press('Backspace');
    await sleep(300);

    await page.keyboard.type(prompt.text, { delay: 3 });
    await sleep(500);

    const textLen = await page.evaluate(() => {
      const ed = document.querySelector('div[data-slate-editor="true"]');
      return ed ? ed.textContent.length : 0;
    });
    if (textLen < 10) { console.error('    ❌ Texto não apareceu'); return false; }

    const clicked = await page.evaluate(() => {
      const buttons = document.querySelectorAll('button');
      for (const btn of buttons) {
        if (btn.textContent.includes('arrow_forward') && btn.textContent.includes('Criar') && !btn.disabled && btn.offsetParent) {
          btn.click();
          return true;
        }
      }
      for (const btn of buttons) {
        if (btn.textContent.includes('Criar') && !btn.disabled && btn.offsetParent && !btn.textContent.includes('add_2')) {
          btn.click();
          return true;
        }
      }
      return false;
    });

    if (clicked) process.stdout.write(`  ✅ Cena ${String(prompt.num).padStart(3, '0')} (${textLen} chars)\n`);
    return clicked;
  } catch (err) {
    console.error(`    ❌ Erro: ${err.message.substring(0, 80)}`);
    return false;
  }
}

async function main() {
  const config = parseArgs();

  const prompts = extractPrompts(config.promptsFile, config.start, config.end);
  console.log(`📋 ${prompts.length} prompts (Cenas ${config.start}-${config.end})`);
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

  const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222', defaultViewport: null });
  const pages = await browser.pages();
  const page = pages.find(p => p.url().includes('labs.google/fx'));
  if (!page) {
    console.error('❌ Tab do Flow não encontrada. Abra https://labs.google/fx/tools/flow no Chrome debug.');
    browser.disconnect();
    return;
  }
  await page.bringToFront();

  const mode = await page.evaluate(() => {
    const btns = document.querySelectorAll('button');
    for (const b of btns) {
      const t = (b.textContent || '').trim();
      if (t.includes('Banana') && b.offsetParent) return 'nano-banana';
      if ((t.includes('Vídeo') || t.includes('Video')) && b.offsetParent) return 'video';
    }
    return 'unknown';
  });
  console.log(`📷 Modo detectado: ${mode}`);
  if (mode !== 'nano-banana') {
    console.error('⚠️  Flow NÃO está em Nano Banana. Troque o modo manual antes de seguir.');
    console.error('   (se prosseguir, vai gerar vídeo em vez de imagem)');
  }
  console.log('✅ Conectado ao Flow');

  const t0 = Date.now();
  let submitted = 0;
  const failed = [];

  for (const prompt of pending) {
    const ok = await submitPrompt(page, prompt);
    if (ok) {
      submitted++;
      if (submitted % 10 === 0 || submitted === 1) {
        const mins = ((Date.now() - t0) / 60000).toFixed(1);
        const rate = (submitted / (Date.now() - t0) * 60000).toFixed(1);
        const eta = ((pending.length - submitted) / rate).toFixed(0);
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
  if (failed.length > 0) console.log(`❌ Falhas: Cenas ${failed.map(p => p.num).join(', ')}`);
  console.log(`\n📥 Pra baixar:`);
  console.log(`   node scripts/flow-download.js "${config.promptsFile}" --output "${config.outputDir}"`);

  browser.disconnect();
}

main().catch(err => { console.error('💥 Erro fatal:', err); process.exit(1); });
