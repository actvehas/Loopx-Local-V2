const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const { updatePhase, appendLog } = require('./db');
const ollama = require('./ollama');

const PROJECT_DIR = path.join(__dirname, '..');
const SCRIPTS_DIR = path.join(PROJECT_DIR, 'scripts');
const CONFIG_DIR = path.join(PROJECT_DIR, 'config');
const OBSIDIAN_BASE = path.join(process.env.HOME, 'Documents', 'Obsidian Vault', 'Projetos');

function loadChannels() {
  return JSON.parse(fs.readFileSync(path.join(CONFIG_DIR, 'channels.json'), 'utf-8'));
}

function loadConfig() {
  return JSON.parse(fs.readFileSync(path.join(CONFIG_DIR, 'default.json'), 'utf-8'));
}

function getEpisodeDir(canal, episode) {
  const channels = loadChannels();
  const channelName = channels[canal]?.name;
  if (!channelName) throw new Error(`Canal ${canal} not found`);

  const channelDir = path.join(OBSIDIAN_BASE, channelName);
  if (!fs.existsSync(channelDir)) throw new Error(`Channel dir not found: ${channelDir}`);

  // Find existing episode dir
  const dirs = fs.readdirSync(channelDir).filter(d => d.startsWith(`${episode} - `));
  if (dirs.length > 0) return path.join(channelDir, dirs[0]);
  return null;
}

function createEpisodeDir(canal, episode, title) {
  const channels = loadChannels();
  const channelName = channels[canal]?.name;
  const channelDir = path.join(OBSIDIAN_BASE, channelName);
  const epDir = path.join(channelDir, `${episode} - ${title}`);
  fs.mkdirSync(epDir, { recursive: true });
  return epDir;
}

// Helper: run shell command and stream output
function runCommand(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, {
      cwd: opts.cwd || PROJECT_DIR,
      shell: true,
      env: { ...process.env, ...opts.env },
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      const text = data.toString();
      stdout += text;
      if (opts.onLog) opts.onLog(text);
    });

    proc.stderr.on('data', (data) => {
      const text = data.toString();
      stderr += text;
      if (opts.onLog) opts.onLog(text);
    });

    proc.on('close', (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`Command failed (${code}): ${stderr || stdout}`));
    });

    proc.on('error', reject);

    if (opts.timeout) {
      setTimeout(() => { proc.kill(); reject(new Error('Command timeout')); }, opts.timeout);
    }
  });
}

// Run Claude CLI for creative phases (0, 1)
function runClaude(prompt, maxTurns = 80) {
  return runCommand('claude', ['-p', '--dangerously-skip-permissions', `"${prompt.replace(/"/g, '\\"')}"`, '--max-turns', maxTurns], {
    timeout: 600000, // 10 min
  });
}

// ═══════════════════════════════════════
// PHASE EXECUTORS
// ═══════════════════════════════════════

async function executePhase(jobId, phase, canal, episode, title, broadcast) {
  const emit = (type, data) => {
    if (broadcast) broadcast({ jobId, phase, type, ...data });
  };

  const log = (text) => {
    appendLog(jobId, phase, text);
    emit('log', { text });
  };

  updatePhase(jobId, phase, { status: 'running', started_at: new Date().toISOString() });
  emit('status', { status: 'running' });

  try {
    switch (phase) {
      case 0: await phaseZero(jobId, canal, episode, title, log, emit); break;
      case 1: await phaseOne(jobId, canal, episode, title, log, emit); break;
      case 2: await phaseTwo(jobId, canal, episode, log, emit); break;
      case 3: await phaseThree(jobId, canal, episode, log, emit); break;
      case 4: await phaseFour(jobId, canal, episode, log, emit); break;
      case 5: await phaseFive(jobId, canal, episode, log, emit); break;
      case 6: await phaseSix(jobId, canal, episode, log, emit); break;
    }

    updatePhase(jobId, phase, { status: 'done', progress: 100, finished_at: new Date().toISOString() });
    emit('status', { status: 'done', progress: 100 });
  } catch (err) {
    updatePhase(jobId, phase, { status: 'error' });
    log(`ERROR: ${err.message}`);
    emit('status', { status: 'error', error: err.message });
    throw err;
  }
}

// Phase 0: Títulos/SEO (Claude)
async function phaseZero(jobId, canal, episode, title, log, emit) {
  const epDir = getEpisodeDir(canal, episode);
  if (!epDir) {
    log('Creating episode directory...');
    createEpisodeDir(canal, episode, title);
  }
  // Phase 0 is typically done before pipeline — titles already exist
  // If title is provided, we're good
  log(`Title: ${title}`);
  updatePhase(jobId, 0, { progress: 100 });
  emit('progress', { progress: 100 });
}

// Phase 1: Roteiro (Claude CLI)
async function phaseOne(jobId, canal, episode, title, log, emit) {
  const epDir = getEpisodeDir(canal, episode) || createEpisodeDir(canal, episode, title);
  const roteiroPath = path.join(epDir, 'roteiro.md');

  if (fs.existsSync(roteiroPath)) {
    const wc = fs.readFileSync(roteiroPath, 'utf-8').split(/\s+/).length;
    log(`roteiro.md already exists (${wc} words) — skipping`);
    return;
  }

  const channels = loadChannels();
  const channelName = channels[canal]?.name;
  const channelDir = path.join(OBSIDIAN_BASE, channelName);
  const language = channels[canal]?.language || 'es';
  const frameworkPath = path.join(channelDir, 'Framework Roteiros.md');
  const nomesPath = path.join(channelDir, 'Nomes e Locais Usados.md');

  log('Generating roteiro via Claude CLI...');
  updatePhase(jobId, 1, { progress: 10 });

  const prompt = language === 'en'
    ? `You are the screenplay writer for Canal ${canal} (${channelName}).
Read: ${frameworkPath} and ${nomesPath}
Title: ${path.basename(epDir)}
Write a complete documentary script in ENGLISH, 5000-7000 words, TTS-ready.
Write to: ${roteiroPath}`
    : `You are the screenplay writer for Canal ${canal} (${channelName}).
Read: ${frameworkPath} and ${nomesPath}
Title: ${path.basename(epDir)}
Write a complete screenplay in SPANISH (castellano mexicano urbano).
10 blocks, ~1700 words each, ~17000 total. 1st person, TTS-ready.
Do NOT reuse names from Nomes e Locais file.
Write to: ${roteiroPath}`;

  await runCommand('claude', ['-p', '--dangerously-skip-permissions', JSON.stringify(prompt), '--max-turns', '80'], {
    timeout: 900000,
    onLog: (text) => log(text.slice(0, 200)),
  });

  updatePhase(jobId, 1, { progress: 70 });

  // Generate desc.md + README.md
  if (!fs.existsSync(path.join(epDir, 'desc.md'))) {
    log('Generating desc.md...');
    await runCommand('claude', ['-p', '--dangerously-skip-permissions',
      JSON.stringify(`Read ${roteiroPath}. Write a YouTube description in SPANISH (3-5 lines + hashtags). Write to: ${path.join(epDir, 'desc.md')}`),
      '--max-turns', '10'], { timeout: 120000 });
  }

  if (!fs.existsSync(path.join(epDir, 'README.md'))) {
    log('Generating README.md...');
    await runCommand('claude', ['-p', '--dangerously-skip-permissions',
      JSON.stringify(`Read ${roteiroPath}. Create README.md with title, characters, locations, arc, checklist. Write to: ${path.join(epDir, 'README.md')}`),
      '--max-turns', '10'], { timeout: 120000 });
  }

  // Update names
  log('Updating Nomes e Locais...');
  await runCommand('claude', ['-p', '--dangerously-skip-permissions',
    JSON.stringify(`Read ${roteiroPath}. Read ${nomesPath}. Extract new names/locations. APPEND to ${nomesPath}.`),
    '--max-turns', '10'], { timeout: 120000 });

  updatePhase(jobId, 1, { progress: 100 });
}

// Phase 2: TTS + Whisper (local Python)
async function phaseTwo(jobId, canal, episode, log, emit) {
  const epDir = getEpisodeDir(canal, episode);
  if (!epDir) throw new Error('Episode dir not found');

  if (fs.existsSync(path.join(epDir, 'audio.wav'))) {
    log('audio.wav already exists — skipping TTS');
    return;
  }

  log('Running TTS + Whisper...');
  updatePhase(jobId, 2, { progress: 10 });

  await runCommand('python3', ['tts-full.py', '--num', episode, '--canal', canal], {
    cwd: SCRIPTS_DIR,
    timeout: 1800000, // 30 min
    onLog: (text) => {
      log(text.slice(0, 200));
      // Try to parse progress from TTS output
      const match = text.match(/(\d+)%/);
      if (match) {
        const pct = parseInt(match[1]);
        updatePhase(jobId, 2, { progress: Math.min(pct, 95) });
        emit('progress', { progress: pct });
      }
    },
  });

  // Verify outputs
  const audioOk = fs.existsSync(path.join(epDir, 'audio.wav'));
  const srtOk = fs.existsSync(path.join(epDir, 'audio.srt'));
  const cenasOk = fs.existsSync(path.join(epDir, 'cenas-minutagem.md'));

  if (!audioOk || !srtOk || !cenasOk) {
    throw new Error('TTS output incomplete — missing audio.wav, audio.srt, or cenas-minutagem.md');
  }

  log('TTS + Whisper complete');
}

// Phase 3: Sincronizador (Ollama/LLaMA)
async function phaseThree(jobId, canal, episode, log, emit) {
  const epDir = getEpisodeDir(canal, episode);
  if (!epDir) throw new Error('Episode dir not found');

  const promptsPath = path.join(epDir, 'prompts-veo3.md');
  if (fs.existsSync(promptsPath)) {
    const count = fs.readFileSync(promptsPath, 'utf-8').split('\n').filter(l => l.startsWith('(Cena')).length;
    log(`prompts-veo3.md already exists (${count} prompts) — skipping`);
    return;
  }

  const channels = loadChannels();
  const estilo = channels[canal]?.style || 'Cinematic Realism, warm Latin American tones';

  log(`Generating VEO3 prompts via Ollama (${ollama.MODELS.mechanical})...`);
  updatePhase(jobId, 3, { progress: 10 });

  let tokenCount = 0;
  const result = await ollama.runSincronizador(epDir, canal, estilo, (token) => {
    tokenCount++;
    if (tokenCount % 100 === 0) {
      const pct = Math.min(90, Math.floor(tokenCount / 50));
      updatePhase(jobId, 3, { progress: pct });
      emit('progress', { progress: pct });
    }
  });

  fs.writeFileSync(promptsPath, result, 'utf-8');
  const promptCount = result.split('\n').filter(l => l.startsWith('(Cena')).length;
  log(`Generated ${promptCount} VEO3 prompts`);
}

// Phase 4: Visual VEO3 (Puppeteer)
async function phaseFour(jobId, canal, episode, log, emit) {
  const epDir = getEpisodeDir(canal, episode);
  if (!epDir) throw new Error('Episode dir not found');

  const promptsPath = path.join(epDir, 'prompts-veo3.md');
  if (!fs.existsSync(promptsPath)) throw new Error('prompts-veo3.md not found — run Phase 3 first');

  const cenasDir = path.join(epDir, 'Cenas');
  fs.mkdirSync(cenasDir, { recursive: true });

  const totalCenas = fs.readFileSync(promptsPath, 'utf-8').split('\n').filter(l => l.startsWith('(Cena')).length;
  const existing = fs.existsSync(cenasDir) ? fs.readdirSync(cenasDir).filter(f => f.endsWith('.mp4')).length : 0;

  if (existing >= totalCenas) {
    log(`${existing} scenes already exist — skipping`);
    return;
  }

  log(`Generating ${totalCenas} scenes via VEO3 Puppeteer...`);
  log('Make sure Chrome is open with Google Labs Flow at localhost:9222');
  updatePhase(jobId, 4, { progress: 5 });

  await runCommand('node', [
    'scripts/veo3-generator.js', promptsPath,
    '--start', '1', '--end', totalCenas,
    '--batch', '1', '--output', cenasDir,
  ], {
    cwd: PROJECT_DIR,
    timeout: 7200000, // 2h
    onLog: (text) => {
      log(text.slice(0, 200));
      const match = text.match(/(\d+)\/(\d+)/);
      if (match) {
        const pct = Math.floor((parseInt(match[1]) / parseInt(match[2])) * 100);
        updatePhase(jobId, 4, { progress: Math.min(pct, 95) });
        emit('progress', { progress: pct });
      }
    },
  });

  const finalCount = fs.readdirSync(cenasDir).filter(f => f.endsWith('.mp4')).length;
  log(`${finalCount}/${totalCenas} scenes generated`);
}

// Phase 5: Assembly (Hetzner)
async function phaseFive(jobId, canal, episode, log, emit) {
  const epDir = getEpisodeDir(canal, episode);
  if (!epDir) throw new Error('Episode dir not found');

  const config = loadConfig();
  const hetzner = `${config.hetzner.user}@${config.hetzner.host}`;
  const remoteDir = `${config.hetzner.remote_dir}/jobs/${canal}/${episode}`;

  if (fs.existsSync(path.join(epDir, 'video-final.mp4'))) {
    log('video-final.mp4 already exists — skipping');
    return;
  }

  // Upload
  log('Uploading to Hetzner...');
  updatePhase(jobId, 5, { progress: 10 });

  await runCommand('ssh', [hetzner, `mkdir -p ${remoteDir}/Cenas ${remoteDir}/Cenas-bounced`]);
  await runCommand('rsync', ['-avz', '--quiet',
    path.join(epDir, 'audio.wav'), path.join(epDir, 'audio.srt'), path.join(epDir, 'cenas-minutagem.md'),
    `${hetzner}:${remoteDir}/`]);
  await runCommand('rsync', ['-avz', '--quiet', path.join(epDir, 'Cenas') + '/', `${hetzner}:${remoteDir}/Cenas/`]);

  updatePhase(jobId, 5, { progress: 30 });
  log('Upload complete. Bouncing videos...');

  // Bounce
  await runCommand('ssh', [hetzner,
    `cd ${remoteDir}/Cenas && for f in *.mp4; do ffmpeg -y -i "$f" -filter_complex '[0:v]split[fwd][rev];[rev]reverse[reversed];[fwd][reversed]concat=n=2:v=1:a=0' -an -c:v libx264 -preset fast -crf 18 "../Cenas-bounced/$f" 2>/dev/null; done`
  ], { timeout: 3600000 });

  updatePhase(jobId, 5, { progress: 50 });
  log('Bounce complete. Linking assets...');

  // Symlink + render
  await runCommand('ssh', [hetzner, `rm -rf /root/loopx-local/remotion/public/assets && ln -s ${remoteDir} /root/loopx-local/remotion/public/assets && rm -f ${remoteDir}/props.json`]);

  log('Starting Remotion render (this takes 3-5h)...');
  updatePhase(jobId, 5, { progress: 55 });

  await runCommand('ssh', [hetzner,
    `cd /root/loopx-local/remotion && node render.mjs --jobs ${remoteDir} --concurrency 2`
  ], {
    timeout: 21600000, // 6h
    onLog: (text) => {
      log(text.slice(0, 200));
      const match = text.match(/Rendered (\d+)/);
      if (match) {
        emit('log', { text: `Rendered ${match[1]} frames` });
      }
    },
  });

  updatePhase(jobId, 5, { progress: 85 });

  // Copy raw → final
  await runCommand('ssh', [hetzner, `cp ${remoteDir}/raw.mp4 ${remoteDir}/final.mp4`]);

  // Download
  log('Downloading final video...');
  await runCommand('scp', [`${hetzner}:${remoteDir}/final.mp4`, path.join(epDir, 'video-final.mp4')], { timeout: 600000 });

  log('Assembly complete');
}

// Phase 6: Thumbnail (Ollama/LLaMA)
async function phaseSix(jobId, canal, episode, log, emit) {
  const epDir = getEpisodeDir(canal, episode);
  if (!epDir) throw new Error('Episode dir not found');

  const thumbPath = path.join(epDir, 'thumb.md');
  if (fs.existsSync(thumbPath)) {
    log('thumb.md already exists — skipping');
    return;
  }

  log(`Generating thumbnail prompt via Ollama (${ollama.MODELS.mechanical})...`);
  updatePhase(jobId, 6, { progress: 20 });

  const result = await ollama.runThumbnail(epDir, canal, (token) => {
    // stream progress
  });

  fs.writeFileSync(thumbPath, result, 'utf-8');
  log('Thumbnail prompt generated');
}

// Run full pipeline sequentially
async function runPipeline(jobId, canal, episode, title, broadcast, startPhase = 0) {
  for (let phase = startPhase; phase <= 6; phase++) {
    await executePhase(jobId, phase, canal, episode, title, broadcast);
  }
}

module.exports = { executePhase, runPipeline, getEpisodeDir, loadChannels, loadConfig };
