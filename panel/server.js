const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');
const { createJob, getJob, listJobs, updatePhase, getJobByCanal } = require('./db');
const { executePhase, runPipeline, getEpisodeDir, loadChannels, loadConfig } = require('./pipeline');
const ollama = require('./ollama');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3333;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ═══════════════════════════════════════
// WebSocket — real-time updates
// ═══════════════════════════════════════
const clients = new Set();

wss.on('connection', (ws) => {
  clients.add(ws);
  ws.on('close', () => clients.delete(ws));
});

function broadcast(data) {
  const msg = JSON.stringify(data);
  for (const ws of clients) {
    if (ws.readyState === 1) ws.send(msg);
  }
}

// ═══════════════════════════════════════
// API Routes
// ═══════════════════════════════════════

// List channels from config
app.get('/api/channels', (req, res) => {
  try {
    const channels = loadChannels();
    const result = {};
    for (const [key, val] of Object.entries(channels)) {
      if (key.startsWith('_')) continue;
      result[key] = val;
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// List jobs (optionally filter by canal)
app.get('/api/jobs', (req, res) => {
  try {
    const jobs = listJobs(req.query.canal);
    res.json(jobs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single job
app.get('/api/jobs/:id', (req, res) => {
  try {
    const job = getJob(parseInt(req.params.id));
    if (!job) return res.status(404).json({ error: 'Job not found' });
    res.json(job);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create job
app.post('/api/jobs', (req, res) => {
  try {
    const { canal, episode, title } = req.body;
    if (!canal || !episode) return res.status(400).json({ error: 'canal and episode required' });
    const jobId = createJob(canal, parseInt(episode), title);
    const job = getJob(jobId);
    broadcast({ type: 'job_created', job });
    res.json(job);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Run full pipeline
app.post('/api/jobs/:id/run', (req, res) => {
  try {
    const job = getJob(parseInt(req.params.id));
    if (!job) return res.status(404).json({ error: 'Job not found' });

    const startPhase = req.body.startPhase || 0;
    res.json({ status: 'started', jobId: job.id, startPhase });

    // Run async
    runPipeline(job.id, job.canal, job.episode, job.title, broadcast, startPhase)
      .then(() => broadcast({ type: 'pipeline_done', jobId: job.id }))
      .catch((err) => broadcast({ type: 'pipeline_error', jobId: job.id, error: err.message }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Run single phase
app.post('/api/jobs/:id/phase/:phase', (req, res) => {
  try {
    const job = getJob(parseInt(req.params.id));
    if (!job) return res.status(404).json({ error: 'Job not found' });

    const phase = parseInt(req.params.phase);
    res.json({ status: 'started', jobId: job.id, phase });

    executePhase(job.id, phase, job.canal, job.episode, job.title, broadcast)
      .then(() => broadcast({ type: 'phase_done', jobId: job.id, phase }))
      .catch((err) => broadcast({ type: 'phase_error', jobId: job.id, phase, error: err.message }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Ollama status
app.get('/api/ollama/status', async (req, res) => {
  try {
    const status = await ollama.checkOllama();
    const models = status.online ? await ollama.listModels() : [];
    res.json({ ...status, models, activeModel: ollama.MODELS.mechanical });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Check episode files
app.get('/api/episodes/:canal/:episode/files', (req, res) => {
  try {
    const epDir = getEpisodeDir(req.params.canal, parseInt(req.params.episode));
    if (!epDir) return res.json({ exists: false, files: [] });

    const fs = require('fs');
    const files = fs.readdirSync(epDir).map(f => {
      const stat = fs.statSync(path.join(epDir, f));
      return { name: f, size: stat.size, isDir: stat.isDirectory() };
    });
    res.json({ exists: true, path: epDir, files });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Read episode file content
app.get('/api/episodes/:canal/:episode/file/:filename', (req, res) => {
  try {
    const epDir = getEpisodeDir(req.params.canal, parseInt(req.params.episode));
    if (!epDir) return res.status(404).json({ error: 'Episode not found' });

    const filePath = path.join(epDir, req.params.filename);
    const fs = require('fs');
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });

    const content = fs.readFileSync(filePath, 'utf-8');
    res.json({ content, path: filePath });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// System info
app.get('/api/system', async (req, res) => {
  const ollamaStatus = await ollama.checkOllama();
  const config = loadConfig();
  res.json({
    ollama: ollamaStatus,
    hetzner: config.hetzner,
    tts: config.tts,
    platform: process.platform,
    nodeVersion: process.version,
  });
});

// ═══════════════════════════════════════
// Start
// ═══════════════════════════════════════
server.listen(PORT, () => {
  console.log(`\n  LoopX Command Center`);
  console.log(`  http://localhost:${PORT}\n`);
  console.log(`  Channels: config/channels.json`);
  console.log(`  Ollama:   ${ollama.MODELS.mechanical}`);
  console.log(`  DB:       panel/loopx.db\n`);
});
