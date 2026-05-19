// Pipeline runner — gerencia fila + worker que executa pipeline-full.sh.
// Stateful em memória, persiste em /tmp/loopx-pipeline-state.json.
// 1 job de cada vez (sequencial).

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const STATE_FILE = '/tmp/loopx-pipeline-state.json';
const LOG_DIR = '/tmp/loopx-pipeline-logs';
const SCRIPT = path.join(__dirname, 'pipeline-full.sh');
const CHANNELS_JSON = path.join(__dirname, '../config/channels.json');

fs.mkdirSync(LOG_DIR, { recursive: true });

let state = {
  // running: array de jobs ativos. Regra: 1 por canal, sem limite global.
  running: [],   // [{ id, channel, letter, ep, titulo, startedAt, pid, logFile, stopAfterPhase? }]
  queue: [],     // [{ id, channel, letter, ep, titulo, queuedAt }]
  history: [],   // últimos 50 jobs terminados

  // Modo PIPELINED — assembly line de 3 fases (worker por fase, paralelo)
  workers: { 1: null, 2: null, 3: null }, // { jobId, pid, startedAt, logFile, phase }
  pipelineJobs: [], // [{ id, channel, letter, ep, titulo, currentPhase, targetPhase, queuedAt, startedAt? }]
};

function persist() {
  try { fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2)); } catch (e) { console.error('persist:', e.message); }
}
function restore() {
  try {
    const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    // Migração: legacy `running` era objeto único ou null.
    let runningArr;
    if (Array.isArray(data.running)) runningArr = data.running;
    else if (data.running && typeof data.running === 'object') runningArr = [data.running];
    else runningArr = [];
    // Reaper: remove jobs cujo PID morreu enquanto o server estava off.
    runningArr = runningArr.filter(j => {
      try { process.kill(j.pid, 0); return true; }
      catch { data.history = data.history || []; data.history.unshift({ ...j, finishedAt: new Date().toISOString(), status: 'orphaned' }); return false; }
    });
    // restore pipelined workers — check PIDs
    const workers = data.workers || { 1: null, 2: null, 3: null };
    for (const ph of [1, 2, 3]) {
      const w = workers[ph];
      if (w) {
        try { process.kill(w.pid, 0); }
        catch { workers[ph] = null; /* worker morto, será re-tickado */ }
      }
    }
    state = {
      running: runningArr,
      queue: data.queue || [],
      history: (data.history || []).slice(0, 50),
      workers,
      pipelineJobs: data.pipelineJobs || [],
    };
  } catch {}
}
restore();

function channelLetter(channelName) {
  try {
    const cfg = JSON.parse(fs.readFileSync(CHANNELS_JSON, 'utf8'));
    for (const [letter, info] of Object.entries(cfg)) {
      if (letter.startsWith('_')) continue;
      if (info.name === channelName) return letter;
    }
  } catch {}
  return null;
}

function enqueue(channel, ep, titulo, opts = {}) {
  const letter = channelLetter(channel);
  if (!letter) throw new Error(`canal sem letra em channels.json: ${channel}`);
  const runningSame = state.running.find(j => j.channel === channel && j.ep === ep);
  if (runningSame) return runningSame.id;
  const inQueue = state.queue.find((j) => j.channel === channel && j.ep === ep);
  if (inQueue) return inQueue.id;
  const id = `${letter}${ep}-${Date.now().toString(36)}`;
  state.queue.push({
    id, channel, letter, ep, titulo: titulo || '',
    stopAfterPhase: opts.stopAfterPhase || null, // 3 = para após Fase 3 (sem Flow)
    queuedAt: new Date().toISOString()
  });
  persist();
  tick();
  return id;
}

function killGroup(pid, signal) {
  try { process.kill(-pid, signal); return true; } catch (e) {
    // fallback se -pid falhar (não tinha process group), mata só o pai
    try { process.kill(pid, signal); return true; } catch { return false; }
  }
}

function cancel(id) {
  const before = state.queue.length;
  state.queue = state.queue.filter((j) => j.id !== id);
  let cancelled = state.queue.length < before;
  const runIdx = state.running.findIndex(j => j.id === id);
  if (runIdx >= 0) {
    const pid = state.running[runIdx].pid;
    killGroup(pid, 'SIGTERM');
    cancelled = true;
    setTimeout(() => {
      if (state.running.find(j => j.pid === pid)) killGroup(pid, 'SIGKILL');
    }, 5000);
  }
  persist();
  return cancelled;
}

let listeners = new Set();
function emit(event) {
  for (const fn of listeners) try { fn(event); } catch {}
}
function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

function startNext() {
  // Regra: 1 job por canal. Procura próximo job da fila cujo canal não tem job rodando.
  if (state.queue.length === 0) { persist(); return false; }
  const busyChannels = new Set(state.running.map(j => j.channel));
  const idx = state.queue.findIndex(j => !busyChannels.has(j.channel));
  if (idx < 0) return false; // todos os canais da fila já têm job rodando
  const job = state.queue.splice(idx, 1)[0];
  const logFile = path.join(LOG_DIR, `${job.id}.log`);
  const out = fs.openSync(logFile, 'a');
  fs.writeSync(out, `\n[${new Date().toISOString()}] starting ${job.letter}${job.ep} — ${job.titulo}\n`);
  const args = [job.letter, job.ep];
  if (job.titulo) args.push(job.titulo);
  const env = { ...process.env };
  if (job.stopAfterPhase) env.STOP_AFTER_PHASE = String(job.stopAfterPhase);
  const child = spawn(SCRIPT, args, { cwd: path.dirname(SCRIPT), stdio: ['ignore', out, out], detached: true, env });
  child.unref();
  const runJob = { ...job, startedAt: new Date().toISOString(), pid: child.pid, logFile };
  state.running.push(runJob);
  persist();
  emit({ type: 'started', job: runJob });
  child.on('exit', (code, sig) => {
    fs.closeSync(out);
    const finished = { ...runJob, finishedAt: new Date().toISOString(), status: code === 0 ? 'success' : (sig ? 'cancelled' : 'failed'), exitCode: code };
    state.history.unshift(finished);
    state.history = state.history.slice(0, 50);
    state.running = state.running.filter(j => j.id !== runJob.id);
    persist();
    emit({ type: 'finished', job: finished });
    setTimeout(tick, 500);
  });
  child.on('error', (e) => {
    fs.writeSync(out, `\n[ERROR spawn] ${e.message}\n`);
    fs.closeSync(out);
    state.running = state.running.filter(j => j.id !== runJob.id);
    persist();
    emit({ type: 'error', error: e.message });
  });
  return true;
}

function tick() {
  // Tenta iniciar quantos jobs forem possíveis (1 por canal disponível).
  while (startNext()) { /* loop até não conseguir mais startar */ }
}

// ─── MODO PIPELINED — 3 workers paralelos (1 por fase) ────────────
function enqueuePipelined(items, targetPhase = 3) {
  const enqueued = [];
  for (const item of items) {
    const letter = channelLetter(item.channel);
    if (!letter) continue;
    // dedupe
    if (state.pipelineJobs.find(j => j.channel === item.channel && j.ep === item.ep)) continue;
    const id = `${letter}${item.ep}-pip-${Date.now().toString(36)}-${enqueued.length}`;
    state.pipelineJobs.push({
      id, channel: item.channel, letter, ep: item.ep, titulo: item.titulo || '',
      currentPhase: 0, // 0 = não iniciado, 1 = fase 1 terminou, etc
      targetPhase: Math.min(targetPhase, 3),
      queuedAt: new Date().toISOString(),
    });
    enqueued.push({ id, channel: item.channel, ep: item.ep });
  }
  persist();
  tickPipeline();
  return enqueued;
}

function startPhase(job, phase) {
  const logFile = path.join(LOG_DIR, `${job.id}-p${phase}.log`);
  const out = fs.openSync(logFile, 'a');
  fs.writeSync(out, `\n[${new Date().toISOString()}] ${job.letter}${job.ep} — Fase ${phase}: ${job.titulo}\n`);
  const args = [job.letter, job.ep];
  if (job.titulo) args.push(job.titulo);
  const env = { ...process.env, STOP_AFTER_PHASE: String(phase) };
  const child = spawn(SCRIPT, args, { cwd: path.dirname(SCRIPT), stdio: ['ignore', out, out], detached: true, env });
  child.unref();
  state.workers[phase] = { jobId: job.id, pid: child.pid, startedAt: new Date().toISOString(), logFile, phase };
  job.startedAt = job.startedAt || new Date().toISOString();
  persist();
  emit({ type: 'phase-started', job, phase });

  child.on('exit', (code, sig) => {
    fs.closeSync(out);
    state.workers[phase] = null;
    if (code === 0) {
      job.currentPhase = phase;
      if (job.currentPhase >= job.targetPhase) {
        // Job completo
        state.pipelineJobs = state.pipelineJobs.filter(j => j.id !== job.id);
        state.history.unshift({ ...job, finishedAt: new Date().toISOString(), status: 'success' });
        state.history = state.history.slice(0, 50);
        emit({ type: 'pipelined-finished', job });
      }
    } else {
      // Falhou nessa fase
      state.pipelineJobs = state.pipelineJobs.filter(j => j.id !== job.id);
      state.history.unshift({ ...job, finishedAt: new Date().toISOString(), status: 'failed', failedAtPhase: phase, exitCode: code });
      state.history = state.history.slice(0, 50);
      emit({ type: 'pipelined-failed', job, phase, code });
    }
    persist();
    setTimeout(tickPipeline, 500);
  });
  child.on('error', (e) => {
    fs.writeSync(out, `\n[ERROR spawn] ${e.message}\n`);
    fs.closeSync(out);
    state.workers[phase] = null;
    state.pipelineJobs = state.pipelineJobs.filter(j => j.id !== job.id);
    state.history.unshift({ ...job, finishedAt: new Date().toISOString(), status: 'spawn-error', failedAtPhase: phase });
    persist();
  });
}

function tickPipeline() {
  for (const phase of [1, 2, 3]) {
    if (state.workers[phase]) continue; // worker ocupado
    // Acha próximo job que precisa dessa fase (currentPhase === phase - 1) e ainda não chegou ao target
    const job = state.pipelineJobs.find(j =>
      j.currentPhase === phase - 1 &&
      j.currentPhase < j.targetPhase &&
      !Object.values(state.workers).some(w => w && w.jobId === j.id) // não está em outro worker
    );
    if (job) startPhase(job, phase);
  }
}

// Watchdog: checa PIDs dos workers a cada 30s e reapa zombies (cobre caso server restart)
function watchdog() {
  let changed = false;
  for (const ph of [1, 2, 3]) {
    const w = state.workers[ph];
    if (!w) continue;
    try { process.kill(w.pid, 0); /* vivo */ }
    catch {
      // PID morto mas state não atualizou — reapa
      const job = state.pipelineJobs.find(j => j.id === w.jobId);
      if (job) {
        try {
          const log = fs.readFileSync(w.logFile, 'utf8');
          const tail = log.slice(-3000);
          const stoppedClean = /STOP_AFTER_PHASE=\d+ — pipeline parou/.test(tail);
          const hasError = /Error.*max turns|❌|Reached max turns/.test(tail);
          if (stoppedClean && !hasError) {
            job.currentPhase = ph;
            if (job.currentPhase >= job.targetPhase) {
              state.pipelineJobs = state.pipelineJobs.filter(j => j.id !== job.id);
              state.history.unshift({ ...job, finishedAt: new Date().toISOString(), status: 'success' });
            }
            console.log(`[watchdog] reaped F${ph} (${job.letter}${job.ep}) — phase ${ph} OK`);
          } else {
            state.pipelineJobs = state.pipelineJobs.filter(j => j.id !== job.id);
            state.history.unshift({ ...job, finishedAt: new Date().toISOString(), status: 'failed', failedAtPhase: ph, reason: 'reaped' });
            console.log(`[watchdog] reaped F${ph} (${job.letter}${job.ep}) — FAILED`);
          }
        } catch {}
        state.history = state.history.slice(0, 50);
      }
      state.workers[ph] = null;
      changed = true;
    }
  }
  if (changed) { persist(); tickPipeline(); }
}
setTimeout(tickPipeline, 1000);
setInterval(watchdog, 30000);

function tailLog(id, lines = 40) {
  const file = path.join(LOG_DIR, `${id}.log`);
  if (!fs.existsSync(file)) return '';
  const content = fs.readFileSync(file, 'utf8');
  const arr = content.split('\n');
  return arr.slice(Math.max(0, arr.length - lines)).join('\n');
}

function getStatus() {
  // runningLogs: { [jobId]: tail }. Compat: runningLog = tail do primeiro running (UI antiga).
  const runningLogs = {};
  for (const j of state.running) runningLogs[j.id] = tailLog(j.id, 20);
  const runningLog = state.running[0] ? runningLogs[state.running[0].id] : '';
  const workerLogs = {};
  for (const ph of [1, 2, 3]) {
    const w = state.workers[ph];
    if (w) {
      const id = `${w.jobId}-p${w.phase}`;
      workerLogs[ph] = tailLog(id, 15);
    }
  }
  return { ...state, runningLog, runningLogs, workerLogs };
}

function cancelPipelined(id) {
  const job = state.pipelineJobs.find(j => j.id === id);
  if (!job) return false;
  // Mata worker se estiver rodando o job
  for (const ph of [1, 2, 3]) {
    const w = state.workers[ph];
    if (w && w.jobId === id) {
      try { process.kill(-w.pid, 'SIGTERM'); } catch {}
      setTimeout(() => { try { process.kill(-w.pid, 'SIGKILL'); } catch {} }, 5000);
      state.workers[ph] = null;
    }
  }
  state.pipelineJobs = state.pipelineJobs.filter(j => j.id !== id);
  state.history.unshift({ ...job, finishedAt: new Date().toISOString(), status: 'cancelled' });
  persist();
  setTimeout(tickPipeline, 500);
  return true;
}

module.exports = { enqueue, cancel, getStatus, subscribe, tailLog, channelLetter, enqueuePipelined, cancelPipelined };
