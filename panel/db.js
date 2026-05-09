const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'loopx.db');
const db = new Database(DB_PATH);

// WAL mode for concurrent reads
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    canal TEXT NOT NULL,
    episode INTEGER NOT NULL,
    title TEXT,
    status TEXT DEFAULT 'pending',
    current_phase INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(canal, episode)
  );

  CREATE TABLE IF NOT EXISTS phases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id INTEGER NOT NULL REFERENCES jobs(id),
    phase INTEGER NOT NULL,
    name TEXT NOT NULL,
    engine TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    progress INTEGER DEFAULT 0,
    log TEXT DEFAULT '',
    started_at TEXT,
    finished_at TEXT,
    UNIQUE(job_id, phase)
  );
`);

const PHASE_DEFS = [
  { phase: 0, name: 'Títulos/SEO',     engine: 'claude' },
  { phase: 1, name: 'Roteiro',          engine: 'claude' },
  { phase: 2, name: 'TTS + Whisper',    engine: 'local' },
  { phase: 3, name: 'Sincronizador',    engine: 'ollama' },
  { phase: 4, name: 'Visual VEO3',      engine: 'puppeteer' },
  { phase: 5, name: 'Assembly',         engine: 'hetzner' },
  { phase: 6, name: 'Thumbnail',        engine: 'ollama' },
];

function createJob(canal, episode, title) {
  const info = db.prepare(
    'INSERT OR IGNORE INTO jobs (canal, episode, title) VALUES (?, ?, ?)'
  ).run(canal, episode, title || `EP${episode}`);

  let jobId;
  if (info.changes === 0) {
    jobId = db.prepare('SELECT id FROM jobs WHERE canal = ? AND episode = ?').get(canal, episode).id;
  } else {
    jobId = info.lastInsertRowid;
    const insert = db.prepare(
      'INSERT OR IGNORE INTO phases (job_id, phase, name, engine) VALUES (?, ?, ?, ?)'
    );
    for (const def of PHASE_DEFS) {
      insert.run(jobId, def.phase, def.name, def.engine);
    }
  }
  return jobId;
}

function getJob(jobId) {
  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(jobId);
  if (!job) return null;
  job.phases = db.prepare('SELECT * FROM phases WHERE job_id = ? ORDER BY phase').all(jobId);
  return job;
}

function getJobByCanal(canal, episode) {
  const job = db.prepare('SELECT * FROM jobs WHERE canal = ? AND episode = ?').get(canal, episode);
  if (!job) return null;
  job.phases = db.prepare('SELECT * FROM phases WHERE job_id = ? ORDER BY phase').all(job.id);
  return job;
}

function listJobs(canal) {
  const where = canal ? 'WHERE canal = ?' : '';
  const jobs = canal
    ? db.prepare(`SELECT * FROM jobs ${where} ORDER BY episode DESC`).all(canal)
    : db.prepare('SELECT * FROM jobs ORDER BY canal, episode DESC').all();

  for (const job of jobs) {
    job.phases = db.prepare('SELECT * FROM phases WHERE job_id = ? ORDER BY phase').all(job.id);
  }
  return jobs;
}

function updatePhase(jobId, phase, updates) {
  const fields = [];
  const values = [];
  for (const [key, val] of Object.entries(updates)) {
    fields.push(`${key} = ?`);
    values.push(val);
  }
  values.push(jobId, phase);
  db.prepare(`UPDATE phases SET ${fields.join(', ')} WHERE job_id = ? AND phase = ?`).run(...values);

  // Update job's current_phase and status
  if (updates.status === 'running') {
    db.prepare("UPDATE jobs SET current_phase = ?, status = 'running', updated_at = datetime('now') WHERE id = ?").run(phase, jobId);
  } else if (updates.status === 'done') {
    const allDone = db.prepare("SELECT COUNT(*) as c FROM phases WHERE job_id = ? AND status != 'done'").get(jobId);
    if (allDone.c === 0) {
      db.prepare("UPDATE jobs SET status = 'done', updated_at = datetime('now') WHERE id = ?").run(jobId);
    } else {
      db.prepare("UPDATE jobs SET updated_at = datetime('now') WHERE id = ?").run(jobId);
    }
  } else if (updates.status === 'error') {
    db.prepare("UPDATE jobs SET status = 'error', updated_at = datetime('now') WHERE id = ?").run(jobId);
  }
}

function appendLog(jobId, phase, text) {
  db.prepare("UPDATE phases SET log = log || ? WHERE job_id = ? AND phase = ?").run(text + '\n', jobId, phase);
}

module.exports = { db, createJob, getJob, getJobByCanal, listJobs, updatePhase, appendLog, PHASE_DEFS };
