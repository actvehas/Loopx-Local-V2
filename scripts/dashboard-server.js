#!/usr/bin/env node
// Dashboard server — localhost + LAN, real-time via SSE.
//
// Roda: node scripts/dashboard-server.js
// Acessa local: http://localhost:4444
// Acessa LAN:   http://<IP-do-Mac>:4444  (ver `ipconfig getifaddr en0`)
//
// Zero deps — só Node nativo. Watch do vault re-escaneia + faz push via SSE.

const http = require('http');
const fs = require('fs');
const path = require('path');
const { scanAll, CANAIS_DIR, PHASE_NAMES, PUBLICADO_DIRS, loadCalendarConfig, saveCalendarConfig, buildSchedule, loadScheduleOverrides, saveScheduleOverride, addFilaEntry, removeFilaEntry, updateFilaEntry, writeObsidianDocs, promoteFilaItem } = require('./dashboard-sync');
const pipeline = require('./pipeline-runner');

// F5: Pipeline → chat notifications (diff watcher)
const seenJobs = new Set();
setInterval(() => {
  try {
    const status = pipeline.getStatus ? pipeline.getStatus() : null;
    if (!status || !status.history) return;
    for (const j of status.history) {
      const key = j.id + '|' + j.status;
      if (seenJobs.has(key)) continue;
      seenJobs.add(key);
      // Pula primeira passada (não notifica histórico antigo)
      if (seenJobs.size <= status.history.length) continue;
      const emoji = j.status === 'success' ? '✅' : (j.status === 'cancelled' ? '⏹' : '❌');
      const text = `${emoji} Pipeline ${j.letter}${j.ep} (${j.channel}): ${j.status}` + (j.failedAtPhase ? ` na Fase ${j.failedAtPhase}` : '');
      appendMessage('system', text);
    }
  } catch {}
}, 5000);
const PUBLICADO_DIR_NAME = 'Publicado';

const PORT = process.env.PORT || 4444;
const HOST = '0.0.0.0';

let cachedState = null;
let lastScan = 0;

function getState(force = false) {
  const now = Date.now();
  if (!force && cachedState && now - lastScan < 1000) return cachedState;
  cachedState = scanAll();
  lastScan = now;
  return cachedState;
}

// ─── SSE clients ─────────────────────────────────────────────
const sseClients = new Set();
function broadcast(state) {
  const payload = `data: ${JSON.stringify({ ts: Date.now(), state })}\n\n`;
  for (const res of sseClients) {
    try { res.write(payload); } catch {}
  }
}
// Broadcast genérico (eventos arbitrários — chat msg, kanban update, notif…)
function broadcastEvent(type, data) {
  const payload = `data: ${JSON.stringify({ ts: Date.now(), event: type, data })}\n\n`;
  for (const res of sseClients) {
    try { res.write(payload); } catch {}
  }
}

// ─── Cookie helpers (identidade simples Jaci/Paulo) ──────────
function parseCookies(req) {
  const out = {};
  const h = req.headers.cookie || '';
  h.split(';').forEach(c => {
    const i = c.indexOf('=');
    if (i > 0) out[c.slice(0, i).trim()] = decodeURIComponent(c.slice(i + 1).trim());
  });
  return out;
}
function currentUser(req) {
  const cookies = parseCookies(req);
  const u = (cookies.loopx_user || '').toLowerCase();
  return ['jaci', 'paulo'].includes(u) ? u : null;
}

// ─── F2: Chat persistence ────────────────────────────────────
const CHAT_FILE = path.join(__dirname, '..', 'config', 'chat.json');
function loadChat() {
  try { return JSON.parse(fs.readFileSync(CHAT_FILE, 'utf8')); }
  catch { return { messages: [] }; }
}
function saveChat(data) {
  fs.writeFileSync(CHAT_FILE, JSON.stringify(data, null, 2));
}
function appendMessage(user, text) {
  const data = loadChat();
  const msg = { id: Date.now() + '-' + Math.random().toString(36).slice(2, 8), user, text, ts: new Date().toISOString() };
  data.messages.push(msg);
  // Mantém últimas 500 mensagens
  if (data.messages.length > 500) data.messages = data.messages.slice(-500);
  saveChat(data);
  broadcastEvent('chat:new', msg);
  return msg;
}

// ─── F4: Kanban persistence ──────────────────────────────────
const KANBAN_FILE = path.join(__dirname, '..', 'config', 'kanban.json');
function loadKanban() {
  try { return JSON.parse(fs.readFileSync(KANBAN_FILE, 'utf8')); }
  catch {
    return {
      columns: [
        { id: 'backlog', title: '📥 Backlog' },
        { id: 'doing', title: '🔄 Em progresso' },
        { id: 'review', title: '👀 Review' },
        { id: 'done', title: '✅ Done' },
      ],
      cards: [],
    };
  }
}
function saveKanban(data) {
  fs.writeFileSync(KANBAN_FILE, JSON.stringify(data, null, 2));
}

// ─── Watch vault, debounced rescan + broadcast ───────────────
let rescanTimer = null;
function scheduleRescan() {
  clearTimeout(rescanTimer);
  rescanTimer = setTimeout(() => {
    const state = getState(true);
    broadcast(state);
    try { writeObsidianDocs(state); } catch (e) { console.error('obsidian write error:', e.message); }
    console.log(`[${new Date().toISOString().slice(11, 19)}] rescan → ${sseClients.size} client(s) + Obsidian`);
  }, 500);
}

if (fs.existsSync(CANAIS_DIR)) {
  fs.watch(CANAIS_DIR, { recursive: true }, scheduleRescan);
  console.log(`👀 watching ${CANAIS_DIR}`);
}

// ─── HTML (inline single page) ───────────────────────────────
const HTML = `<!doctype html>
<html lang="pt-br">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>LoopX Dashboard</title>
<style>
  :root {
    --bg: #0d1117; --panel: #161b22; --border: #30363d;
    --text: #e6edf3; --muted: #8b949e; --accent: #58a6ff;
    --green: #3fb950; --yellow: #d29922; --red: #f85149;
  }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, sans-serif;
         background: var(--bg); color: var(--text); }
  header { padding: 16px 24px; border-bottom: 1px solid var(--border);
           display: flex; align-items: center; justify-content: space-between; }
  h1 { margin: 0; font-size: 18px; }
  .pulse { display: inline-block; width: 8px; height: 8px; border-radius: 50%;
           background: var(--green); margin-right: 6px;
           animation: pulse 1.6s infinite; }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.3} }
  nav { display: flex; gap: 4px; padding: 0 24px; border-bottom: 1px solid var(--border); }
  nav button { background: none; border: none; color: var(--muted); padding: 12px 16px;
               cursor: pointer; font-size: 14px; border-bottom: 2px solid transparent; }
  nav button.active { color: var(--accent); border-bottom-color: var(--accent); }
  main { padding: 24px; }
  .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
           gap: 12px; margin-bottom: 24px; }
  .stat { background: var(--panel); border: 1px solid var(--border); border-radius: 8px;
          padding: 16px; }
  .stat-label { font-size: 12px; color: var(--muted); text-transform: uppercase; }
  .stat-value { font-size: 28px; font-weight: 600; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; background: var(--panel);
          border-radius: 8px; overflow: hidden; }
  th, td { padding: 10px 14px; text-align: left; border-bottom: 1px solid var(--border);
           font-size: 13px; }
  th { background: #1c2128; font-weight: 600; color: var(--muted); text-transform: uppercase;
       font-size: 11px; letter-spacing: .5px; }
  tr:last-child td { border-bottom: none; }
  tr:hover td { background: rgba(88,166,255,.05); }
  .phase { padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;
           background: #1c2128; color: var(--accent); white-space: nowrap; }
  .phase-7 { background: rgba(63,185,80,.15); color: var(--green); }
  .phase-6 { background: rgba(88,166,255,.15); color: var(--accent); }
  .phase-0 { background: rgba(139,148,158,.15); color: var(--muted); }
  .channel-section { margin-bottom: 32px; }
  .channel-section h2 { font-size: 16px; margin: 0 0 12px; color: var(--accent); }
  .empty { color: var(--muted); padding: 24px; text-align: center; }
  .filter { background: var(--panel); border: 1px solid var(--border); color: var(--text);
            padding: 8px 12px; border-radius: 6px; font-size: 13px; margin-bottom: 16px; }
  .last-update { font-size: 12px; color: var(--muted); }
  .btn-pub, .btn-undo, .btn-run, .btn-running, .btn-queued { border: none; padding: 5px 10px; border-radius: 5px; font-size: 12px;
                         cursor: pointer; font-weight: 600; transition: opacity .15s; }
  .btn-pub { background: var(--green); color: #0d1117; }
  .btn-undo { background: #1c2128; color: var(--muted); border: 1px solid var(--border); }
  .btn-run { background: var(--accent); color: #0d1117; }
  .btn-running { background: var(--green); color: #0d1117; cursor: default; animation: glow 1.6s ease-in-out infinite; }
  .btn-queued { background: var(--yellow); color: #0d1117; cursor: default; }
  .pulse-dot { display:inline-block; width:8px; height:8px; border-radius:50%; background:#0d1117; margin-right:4px;
               vertical-align: middle; animation: pulse 1s infinite; }
  @keyframes glow { 0%,100% { box-shadow: 0 0 0 0 rgba(63,185,80,.6); } 50% { box-shadow: 0 0 0 6px rgba(63,185,80,0); } }
  .btn-pub:hover, .btn-undo:hover, .btn-run:hover { opacity: .8; }
  .toast { position: fixed; bottom: 24px; right: 24px; background: var(--panel);
           border: 2px solid var(--accent); padding: 14px 22px; border-radius: 10px;
           color: var(--text); font-size: 14px; box-shadow: 0 6px 24px rgba(88,166,255,.4);
           opacity: 0; transition: opacity .25s; pointer-events: none; z-index: 999;
           max-width: 420px; }
  .toast.show { opacity: 1; }
  .toast.error { border-color: var(--red); box-shadow: 0 6px 24px rgba(248,81,73,.4); }
  /* F2 Chat */
  .badge { background: var(--red); color: white; padding: 1px 6px; border-radius: 10px; font-size: 11px; margin-left: 4px; }
  .chat-wrap { display: flex; flex-direction: column; height: calc(100vh - 180px); background: var(--panel); border:1px solid var(--border); border-radius: 8px; overflow: hidden; }
  .chat-list { flex: 1; overflow-y: auto; padding: 14px; display: flex; flex-direction: column; gap: 8px; }
  .chat-msg { padding: 8px 12px; background: #1c2128; border-radius: 8px; max-width: 75%; }
  .chat-msg.own { align-self: flex-end; background: #1f2c40; border: 1px solid #2d4865; }
  .chat-msg.sys { align-self: center; background: transparent; color: var(--muted); font-size: 12px; max-width: 90%; text-align: center; font-style: italic; }
  .chat-meta { font-size: 11px; color: var(--muted); margin-bottom: 4px; }
  .chat-body { font-size: 14px; line-height: 1.4; white-space: pre-wrap; word-wrap: break-word; }
  .chat-body .mention { color: var(--accent); }
  .chat-input-row { display: flex; gap: 8px; padding: 12px; border-top: 1px solid var(--border); background: #0d1117; }
  .chat-input-row input { flex: 1; background: var(--bg); color: var(--text); border: 1px solid var(--border); border-radius: 6px; padding: 8px 12px; font-size: 14px; }
  /* F4 Kanban */
  .kanban-board { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
  .kanban-col { background: var(--panel); border: 1px solid var(--border); border-radius: 8px; padding: 10px; min-height: 400px; }
  .kanban-col h4 { margin: 0 0 10px; font-size: 14px; }
  .kanban-col-body { display: flex; flex-direction: column; gap: 8px; }
  .kanban-card { background: #1c2128; border: 1px solid var(--border); border-radius: 6px; padding: 10px; cursor: grab; }
  .kanban-card:hover { border-color: var(--accent); }
  .kanban-card-title { font-weight: 600; font-size: 13px; margin-bottom: 4px; }
  .kanban-card-desc { font-size: 12px; color: var(--muted); margin-bottom: 6px; }
  .kanban-card-foot { display:flex; justify-content: space-between; align-items: center; gap: 6px; }
  .kanban-assignee { background: var(--accent); color: white; padding: 1px 6px; border-radius: 8px; font-size: 11px; }
  @media (max-width: 900px) { .kanban-board { grid-template-columns: 1fr; } }
  /* Pipelines: phase pills */
  .phases-row { display: inline-flex; gap: 4px; }
  .phase-pill { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: 50%; font-size: 11px; font-weight: 700; border: 1px solid var(--border); }
  .phase-pill.done { background: var(--green); color: #0d1117; border-color: var(--green); }
  .phase-pill.active { background: #f5a623; color: #0d1117; border-color: #f5a623; animation: pulse-active 1.2s infinite; }
  .phase-pill.pending { background: transparent; color: var(--muted); }
  @keyframes pulse-active { 0%,100% { box-shadow: 0 0 0 0 rgba(245,166,35,.7); } 50% { box-shadow: 0 0 0 6px rgba(245,166,35,0); } }
  .pulse-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: var(--green); animation: pulse-dot 1s infinite; vertical-align: middle; }
  @keyframes pulse-dot { 0%,100% { opacity: 1; } 50% { opacity: .3; } }
  /* Operations cards (Pipelines tab) */
  .ops-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(420px, 1fr)); gap: 14px; }
  .ops-card { background: var(--panel); border: 2px solid var(--border); border-radius: 10px; padding: 14px; }
  .ops-head { display: flex; justify-content: space-between; align-items: center; gap: 10px; font-size: 14px; }
  .ops-state { font-size: 12px; font-weight: 600; }
  .ops-progress-bar { height: 8px; background: var(--bg); border-radius: 4px; overflow: hidden; margin: 8px 0 4px; }
  .ops-progress-bar > div { height: 100%; transition: width .4s; }
  .file-chip { display: inline-block; font-size: 11px; padding: 2px 7px; margin: 2px 3px 2px 0; border-radius: 4px; border: 1px solid var(--border); }
  .file-chip.ok { background: rgba(63,185,80,.12); border-color: rgba(63,185,80,.4); color: #5fc56f; }
  .file-chip.pending { color: var(--muted); }
  .cal-nav { display:flex; align-items:center; gap:12px; margin: 16px 0 12px; }
  .cal-nav button { background: var(--panel); border:1px solid var(--border); color: var(--text);
                    width: 32px; height: 32px; border-radius: 6px; cursor: pointer; font-size: 16px; }
  .cal-nav button:hover { background: #1c2128; }
  .cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px;
              background: var(--border); border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
  .cal-h { background: #1c2128; padding: 8px; font-size: 11px; color: var(--muted);
           text-transform: uppercase; letter-spacing: .5px; text-align: center; font-weight: 600; }
  .cal-c { background: var(--panel); min-height: 100px; padding: 6px; display:flex; flex-direction:column; gap: 3px; }
  .cal-c.empty { background: #0d1117; }
  .cal-c.today { background: rgba(88,166,255,.06); }
  .cal-c.today .cal-d { color: var(--accent); font-weight: 700; }
  .cal-d { font-size: 11px; color: var(--muted); }
  .cal-ev { font-size: 11px; padding: 3px 6px; border-radius: 3px; line-height: 1.3;
            overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .cal-ev.published { opacity: .75; }
  .cadence { margin: 12px 0; background: var(--panel); border:1px solid var(--border); border-radius: 8px; padding: 8px 16px; }
  .cadence summary { cursor: pointer; font-size: 13px; color: var(--muted); padding: 4px 0; }
  .cadence table { margin-top: 12px; }
  .dow { display:inline-block; width: 26px; height: 26px; line-height: 26px; text-align:center;
         border-radius: 50%; margin-right: 4px; cursor:pointer; background:#1c2128; color: var(--muted);
         font-size: 11px; font-weight: 600; user-select: none; }
  .dow.on { background: var(--accent); color: #0d1117; }
  .fila-form { background: var(--panel); border:1px solid var(--border); border-radius: 8px;
               padding: 16px; margin: 16px 0; }
  .fila-form-grid { display: grid; grid-template-columns: 200px 1fr 1fr 110px; gap: 8px;
                    margin-bottom: 8px; }
  @media (max-width: 700px) { .fila-form-grid { grid-template-columns: 1fr; } }
  .run-card { background: var(--panel); border:1px solid var(--green); border-radius: 8px; padding: 16px; margin-bottom: 12px; }
  .workers-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 8px; margin-bottom: 8px; }
  @media (max-width: 1400px) { .workers-grid { grid-template-columns: repeat(4, 1fr); } }
  @media (max-width: 900px) { .workers-grid { grid-template-columns: repeat(2, 1fr); } }
  @media (max-width: 600px) { .workers-grid { grid-template-columns: 1fr; } }
  .worker-card { background: var(--panel); border: 1px solid var(--border); border-radius: 8px; padding: 12px; }
  .worker-card.active { border-color: var(--green); box-shadow: 0 0 0 1px rgba(63,185,80,.2); }
  .worker-card.idle { opacity: .55; }
  .worker-card h4 { margin: 0 0 8px; font-size: 13px; color: var(--accent); }
  .bar { display:inline-block; width: 24px; text-align:center; font-weight:bold; }
  .bar.done { color: var(--green); }
  .bar.active { color: var(--accent); animation: pulse 1s infinite; }
  .bar.pending { color: var(--muted); }
  .privacy-btn { background: none; border: 1px solid var(--border); color: var(--text);
                 padding: 4px 10px; border-radius: 6px; cursor: pointer; font-size: 14px;
                 margin-right: 8px; }
  .privacy-btn:hover { background: #1c2128; }
  .privacy-btn.on { background: var(--accent); border-color: var(--accent); color: #0d1117; }
  .censor { transition: filter .15s; }
  body.privacy-on .censor { filter: blur(7px); cursor: pointer; user-select: none; }
  body.privacy-on .censor:hover { filter: blur(0); }
  body.privacy-on input.censor { color: transparent; text-shadow: 0 0 8px rgba(230,237,243,.6); }
  body.privacy-on input.censor:focus { color: var(--text); text-shadow: none; }
  /* Dropdowns de canal: blur quando privacidade ativa */
  body.privacy-on select.filter { filter: blur(5px); }
  body.privacy-on select.filter:hover, body.privacy-on select.filter:focus { filter: blur(0); }
  .log-tail { background: #0d1117; border:1px solid var(--border); border-radius: 4px;
              padding: 10px; font-family: ui-monospace, Menlo, monospace; font-size: 11px;
              max-height: 280px; overflow: auto; white-space: pre-wrap; color: #c9d1d9;
              margin: 8px 0; }
</style>
</head>
<body>
<header>
  <h1>🎛️ LoopX Dashboard</h1>
  <div>
    <button id="privacyBtn" onclick="togglePrivacy()" class="privacy-btn" title="Modo privacidade — oculta canais e títulos">👁</button>
    <span class="pulse"></span><span id="status">conectando...</span> · <span class="last-update" id="lastUpdate"></span>
  </div>
</header>
<nav>
  <button class="active" data-tab="fila">📋 Fila</button>
  <button data-tab="production">🎬 Produção</button>
  <button data-tab="pipelines">⚡ Pipelines</button>
  <button data-tab="accounts">🔑 Contas Flow</button>
  <button data-tab="chat">💬 Chat <span id="chatBadge" class="badge" style="display:none">0</span></button>
  <button data-tab="kanban">📋 Kanban <span id="kanbanBadge" class="badge" style="display:none">0</span></button>
  <button data-tab="calendar">📅 Calendário</button>
  <span style="margin-left:auto;color:var(--muted);font-size:13px" id="whoami">guest</span>
  <button id="notifBtn" title="Notificações" style="margin-left:8px;padding:4px 10px">🔕</button>
</nav>
<main id="main"></main>
<div id="toast" class="toast"></div>

<script>
const PHASES = ${JSON.stringify(PHASE_NAMES)};
let state = [];
let activeTab = 'fila';
let channelFilter = '';
let opsChannelFilter = '';

function fmt(s, n=60) { return (s||'').length > n ? s.slice(0,n-3)+'...' : (s||''); }

function renderStats() {
  const totalProd = state.reduce((s,c)=>s+c.eps.filter(e=>e.phase>=0&&e.phase<=5).length,0);
  const totalProntos = state.reduce((s,c)=>s+c.eps.filter(e=>e.phase===6).length,0);
  const totalPub = state.reduce((s,c)=>s+c.eps.filter(e=>e.phase===7).length,0);
  const totalFila = state.reduce((s,c)=>s+c.queued.length,0);
  return \`<div class="stats">
    <div class="stat"><div class="stat-label">Canais</div><div class="stat-value">\${state.length}</div></div>
    <div class="stat"><div class="stat-label">Em produção</div><div class="stat-value">\${totalProd}</div></div>
    <div class="stat"><div class="stat-label">Prontos</div><div class="stat-value" style="color:var(--green)">\${totalProntos}</div></div>
    <div class="stat"><div class="stat-label">Publicados</div><div class="stat-value">\${totalPub}</div></div>
    <div class="stat"><div class="stat-label">Na fila</div><div class="stat-value">\${totalFila}</div></div>
  </div>\`;
}

function channelOptions() {
  return ['<option value="">todos os canais</option>',
    ...state.map(c=>\`<option \${c.channel===channelFilter?'selected':''}>\${c.channel}</option>\`)].join('');
}

function renderFila() {
  const filtered = channelFilter ? state.filter(c=>c.channel===channelFilter) : state;
  const chOpts = state.map(c=>\`<option \${c.channel===filaFormChannel?'selected':''}>\${c.channel}</option>\`).join('');
  const totalQueued = state.reduce((s,c)=>s+c.queued.length,0);
  let html = renderStats() + \`
    <select class="filter" onchange="channelFilter=this.value;render()">\${channelOptions()}</select>
    <div class="fila-form" style="border-color:var(--accent)">
      <h3 style="margin:0 0 8px">⚡ Batch — Roteiro + TTS + Prompts até Fase 3</h3>
      <p style="margin:0 0 12px;color:var(--muted);font-size:12px">
        Marque os títulos abaixo com <b>☑ checkbox</b> e clique <b>"Rodar selecionados"</b>. Cada EP marcado:
        cria pasta (sai da Fila → entra em Produção) → roda Fases 1, 2, 3 sequencialmente → para antes do Flow.
      </p>
      <button class="btn-run" onclick="runSelected()">▶ Rodar selecionados até Fase 3</button>
      <button class="btn-undo" onclick="selectAllFila(true)" style="margin-left:8px">☑ Marcar todos</button>
      <button class="btn-undo" onclick="selectAllFila(false)" style="margin-left:4px">☐ Desmarcar</button>
      <span id="selCount" style="margin-left:12px;color:var(--muted);font-size:12px">0 selecionados</span>
    </div>
    <div class="fila-form">
      <h3 style="margin:0 0 12px">➕ Adicionar à fila</h3>
      <div class="fila-form-grid">
        <select id="fila-channel" class="filter" style="margin:0">\${chOpts}</select>
        <input id="fila-titulo" class="filter" placeholder="Título do EP" style="margin:0">
        <input id="fila-thumb" class="filter" placeholder="Texto da thumbnail" style="margin:0">
        <button class="btn-pub" onclick="addToFila()">Adicionar</button>
      </div>
      <small style="color:var(--muted)">EP é numerado automaticamente baseado no último existente.</small>
    </div>
  \`;
  let anyContent = false;
  for (const c of filtered) {
    if (!c.queued.length) continue;
    anyContent = true;
    html += \`<div class="channel-section"><h2><span class="censor">\${c.channel}</span> <span style="color:var(--muted);font-size:13px;font-weight:400">— \${c.queued.length} na fila</span></h2>
      <table><thead><tr><th style="width:34px"><input type="checkbox" onclick="selectChannelFila(this,'\${encodeURIComponent(c.channel)}')" title="Selecionar canal inteiro"></th><th style="width:70px">EP</th><th>Título</th><th>Thumb</th><th style="width:60px">Ação</th></tr></thead>
      <tbody>\${c.queued.map(t=>{
        const safeId = (c.channel+t.ep).replace(/[^a-z0-9]/gi,'_');
        const tipo = t.source==='fila' ? '●manual' : '○titulos.md';
        const tipoColor = t.source==='fila' ? 'var(--green)' : 'var(--muted)';
        const safeTitulo = (t.titulo||'').replace(/"/g,'&quot;').replace(/'/g,"&#39;");
        return \`<tr>
          <td><input type="checkbox" class="fila-check" data-channel="\${encodeURIComponent(c.channel)}" data-ep="\${t.ep}" data-titulo="\${safeTitulo}" onchange="updateSelCount()"></td>
          <td><b>EP\${t.ep}</b> <span style="color:\${tipoColor};font-size:9px">\${tipo}</span></td>
          <td><input id="ft-\${safeId}" value="\${safeTitulo}" onchange="updateFila('\${encodeURIComponent(c.channel)}','\${t.ep}','titulo',this.value)" class="filter censor" style="margin:0;padding:4px 6px;width:100%"></td>
          <td><input id="fh-\${safeId}" value="\${(t.thumb||'').replace(/"/g,'&quot;')}" onchange="updateFila('\${encodeURIComponent(c.channel)}','\${t.ep}','thumb',this.value)" class="filter" style="margin:0;padding:4px 6px;width:100%" placeholder="thumb"></td>
          <td><button class="btn-pub" onclick="promoteFila('\${encodeURIComponent(c.channel)}','\${t.ep}','ft-\${safeId}')" title="Cria pasta do EP e move pra Produção">➡ Produção</button>
            <button class="btn-undo" onclick="removeFila('\${encodeURIComponent(c.channel)}','\${t.ep}')" style="margin-left:4px">🗑</button></td>
        </tr>\`;
      }).join('')}</tbody></table>
    </div>\`;
  }
  if (!anyContent) html += '<div class="empty" style="background:var(--panel);border:1px solid var(--border);border-radius:8px;margin-top:16px">nenhum EP na fila ainda</div>';
  return html;
}

function renderProduction() {
  const filtered = channelFilter ? state.filter(c=>c.channel===channelFilter) : state;
  const rows = [];
  const prontos = [];
  for (const c of filtered) for (const e of c.eps) {
    if (e.phase>=0 && e.phase<=5) rows.push({...e, channel: c.channel});
    else if (e.phase===6) prontos.push({...e, channel: c.channel});
  }
  const epNum = (e) => { const n = parseInt(String(e.ep).replace(/[^0-9]/g,''),10); return isNaN(n) ? 9999 : n; };
  const byChannelThenEp = (a,b) => (a.channel||'').localeCompare(b.channel||'') || epNum(a) - epNum(b);
  rows.sort(byChannelThenEp);
  prontos.sort(byChannelThenEp);
  const tbody = rows.length ? rows.map(e=>{
    const key = e.channel + '|' + e.ep;
    const current = scheduleOverrides[key] || '';
    return \`<tr>
      <td class="censor">\${e.channel}</td><td><b>EP\${e.ep}</b></td><td class="censor">\${fmt(e.titulo)}</td>
      <td><span class="phase phase-\${e.phase}">\${e.phaseName}</span></td>
      <td>\${e.mtimeISO}</td>
      <td><input type="date" id="dt-\${key.replace(/[^a-z0-9]/gi,'_')}" value="\${current}" class="filter" style="margin:0;padding:4px 6px;width:135px">
        <button class="btn-pub" onclick="agendar('\${encodeURIComponent(e.channel)}','\${e.ep}','dt-\${key.replace(/[^a-z0-9]/gi,'_')}')">📅 Agendar</button>
        \${current?\`<button class="btn-undo" onclick="agendar('\${encodeURIComponent(e.channel)}','\${e.ep}','',true)" style="margin-left:4px">✕</button>\`:''}
        \${(()=>{
          const runArr = Array.isArray(pipelineStatus.running) ? pipelineStatus.running : (pipelineStatus.running ? [pipelineStatus.running] : []);
          const runJob = runArr.find(j=>j.channel===e.channel && j.ep===e.ep);
          const queuePos = pipelineStatus.queue.findIndex(j=>j.channel===e.channel && j.ep===e.ep);
          if (runJob) return \`<button class="btn-running" onclick="cancelPipeline('\${runJob.id}')" style="margin-left:4px"><span class="pulse-dot"></span> Rodando · ⏹</button>\`;
          if (queuePos>=0) return \`<button class="btn-queued" disabled style="margin-left:4px">⏳ Fila #\${queuePos+1}</button>\`;
          return \`<button class="btn-run" onclick="runPipeline('\${encodeURIComponent(e.channel)}','\${e.ep}','\${(e.titulo||'').replace(/'/g,'').slice(0,80)}')" style="margin-left:4px">▶ Rodar</button>\`;
        })()}
      </td>
    </tr>\`;
  }).join('')
    : '<tr><td colspan="6" class="empty">nenhum EP em produção</td></tr>';
  const prontosTbody = prontos.length ? prontos.map(e=>{
    const key = e.channel + '|' + e.ep;
    const current = scheduleOverrides[key] || '';
    const safeId = ('p_'+key).replace(/[^a-z0-9]/gi,'_');
    return \`<tr>
      <td class="censor">\${e.channel}</td><td><b>EP\${e.ep}</b></td><td class="censor">\${fmt(e.titulo)}</td>
      <td>\${e.mtimeISO}</td>
      <td><input type="date" id="\${safeId}" value="\${current}" class="filter" style="margin:0;padding:4px 6px;width:135px">
        <button class="btn-pub" onclick="agendar('\${encodeURIComponent(e.channel)}','\${e.ep}','\${safeId}')">📅 Agendar</button>
        \${current?\`<button class="btn-undo" onclick="agendar('\${encodeURIComponent(e.channel)}','\${e.ep}','',true)" style="margin-left:4px">✕</button>\`:''}
      </td>
    </tr>\`;
  }).join('') : '';
  const summary = state.map(c=>\`<tr><td class="censor">\${c.channel}</td>
    <td>\${c.eps.filter(e=>e.phase>=0&&e.phase<=5).length}</td>
    <td>\${c.eps.filter(e=>e.phase===6).length}</td>
    <td>\${c.eps.filter(e=>e.phase===7).length}</td>
    <td>\${c.queued.length}</td></tr>\`).join('');
  return renderStats() + \`
    <select class="filter" onchange="channelFilter=this.value;render()">\${channelOptions()}</select>
    <h3>🎬 Em produção</h3>
    <table><thead><tr><th>Canal</th><th>EP</th><th>Título</th><th>Fase</th><th>Atualizado</th><th>Ação</th></tr></thead>
    <tbody>\${tbody}</tbody></table>
    \${prontos.length?\`<h3 style="margin-top:32px">✅ Prontos para publicar <span style="color:var(--muted);font-size:13px;font-weight:400">— \${prontos.length} EP(s) com final.mp4</span></h3>
    <table><thead><tr><th>Canal</th><th>EP</th><th>Título</th><th>Finalizado</th><th>Ação</th></tr></thead>
    <tbody>\${prontosTbody}</tbody></table>\`:''}
    <h3 style="margin-top:32px">Resumo por canal</h3>
    <table><thead><tr><th>Canal</th><th>Em produção</th><th>Prontos</th><th>Publicados</th><th>Na fila</th></tr></thead>
    <tbody>\${summary}</tbody></table>\`;
}

let calMonth = (() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; })();
let calEvents = [];
let calConfig = { channels: {} };
let cadenceOpen = true;
let scheduleOverrides = {};
let filaFormChannel = '';
const CH_COLORS = ['#58a6ff','#3fb950','#d29922','#f778ba','#a371f7','#ff7b72','#79c0ff','#56d4dd'];
function colorFor(channel) {
  const list = state.map(c=>c.channel);
  const i = list.indexOf(channel);
  return CH_COLORS[(i>=0?i:0) % CH_COLORS.length];
}
function monthLabel(y,m){ return new Date(y,m,1).toLocaleDateString('pt-BR',{month:'long',year:'numeric'}); }
function shiftMonth(delta){ let m=calMonth.m+delta, y=calMonth.y; if(m<0){m=11;y--;} if(m>11){m=0;y++;} calMonth={y,m}; render(); }
function dayKeys(y,m){
  const first = new Date(y,m,1);
  const startDow = first.getDay();
  const daysInMonth = new Date(y,m+1,0).getDate();
  const cells = [];
  for (let i=0;i<startDow;i++) cells.push(null);
  for (let d=1;d<=daysInMonth;d++) cells.push(\`\${y}-\${String(m+1).padStart(2,'0')}-\${String(d).padStart(2,'0')}\`);
  while (cells.length%7) cells.push(null);
  return cells;
}
function renderCadenceEditor() {
  const dows = ['D','S','T','Q','Q','S','S'];
  const rows = state.map(c=>{
    const cc = calConfig.channels[c.channel] || { days: [] };
    const chips = dows.map((label,i)=>{
      const active = cc.days.includes(i);
      return \`<span class="dow \${active?'on':''}" onclick="toggleDow('\${encodeURIComponent(c.channel)}',\${i})">\${label}</span>\`;
    }).join('');
    return \`<tr><td class="censor">\${c.channel}</td><td>\${chips}</td>
      <td><input type="date" value="\${cc.startDate||''}" onchange="setStart('\${encodeURIComponent(c.channel)}',this.value)" class="filter" style="margin:0;padding:4px 6px"></td>
      <td>\${cc.days.length} dias/sem</td></tr>\`;
  }).join('');
  return \`<details class="cadence" \${cadenceOpen?'open':''} ontoggle="cadenceOpen=this.open"><summary>⚙️ Cadência por canal</summary>
    <table><thead><tr><th>Canal</th><th>Dias da semana</th><th>Início</th><th>Resumo</th></tr></thead>
    <tbody>\${rows}</tbody></table></details>\`;
}
function renderCalendar() {
  const cells = dayKeys(calMonth.y, calMonth.m);
  const todayISO = new Date().toISOString().slice(0,10);
  const filtered = channelFilter ? calEvents.filter(e=>e.channel===channelFilter) : calEvents;
  const byDate = {};
  for (const e of filtered) (byDate[e.date] = byDate[e.date] || []).push(e);
  const head = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map(d=>\`<div class="cal-h">\${d}</div>\`).join('');
  const grid = cells.map(k=>{
    if (!k) return '<div class="cal-c empty"></div>';
    const ev = byDate[k] || [];
    const day = parseInt(k.slice(-2),10);
    const isToday = k===todayISO;
    return \`<div class="cal-c\${isToday?' today':''}">
      <div class="cal-d">\${day}</div>
      \${ev.map(e=>\`<div class="cal-ev\${e.published?' published':''}" style="background:\${colorFor(e.channel)}\${e.published?'33':'22'};border-left:3px solid \${colorFor(e.channel)}" title="\${e.channel} — EP\${e.ep} — \${e.titulo}\${e.published?' (publicado)':''}">
        \${e.published?'✓ ':''}<b>EP\${e.ep}</b> · <span class="censor">\${fmt(e.titulo,26)}</span>
      </div>\`).join('')}
    </div>\`;
  }).join('');
  return renderStats() + \`
    <select class="filter" onchange="channelFilter=this.value;render()">\${channelOptions()}</select>
    \${renderCadenceEditor()}
    <div class="cal-nav">
      <button onclick="shiftMonth(-1)">‹</button>
      <h3 style="margin:0;text-transform:capitalize">\${monthLabel(calMonth.y,calMonth.m)}</h3>
      <button onclick="shiftMonth(1)">›</button>
      <span style="margin-left:auto;font-size:12px;color:var(--muted)">\${calEvents.length} EPs agendados</span>
    </div>
    <div class="cal-grid">\${head}\${grid}</div>\`;
}
async function loadCalendar() {
  const [cfgR, evR, ovR] = await Promise.all([fetch('/api/calendar-config'), fetch('/api/schedule'), fetch('/api/overrides')]);
  calConfig = await cfgR.json();
  calEvents = await evR.json();
  scheduleOverrides = await ovR.json();
  render();
}
async function toggleDow(channel, dow) {
  channel = decodeURIComponent(channel);
  const cc = calConfig.channels[channel] || { days: [] };
  const days = new Set(cc.days);
  if (days.has(dow)) days.delete(dow); else days.add(dow);
  calConfig.channels[channel] = { ...cc, days: [...days].sort((a,b)=>a-b) };
  await fetch('/api/calendar-config', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(calConfig) });
  await loadCalendar();
}
async function setStart(channel, dateStr) {
  channel = decodeURIComponent(channel);
  const cc = calConfig.channels[channel] || { days: [] };
  if (dateStr) cc.startDate = dateStr; else delete cc.startDate;
  calConfig.channels[channel] = cc;
  await fetch('/api/calendar-config', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(calConfig) });
  await loadCalendar();
}

// Cache de estado operacional por EP (key = channel|ep)
const epStatusCache = {};
const expandedLogs = new Set(); // keys com tail aberto, persiste entre renders
function toggleLogExpand(key, open) {
  if (open) expandedLogs.add(key);
  else expandedLogs.delete(key);
}
async function fetchEpStatus(channel, ep) {
  const key = channel + '|' + ep;
  // marca timestamp pra evitar request paralelo
  epStatusCache[key] = epStatusCache[key] || {};
  epStatusCache[key]._fetchedAt = Date.now();
  try {
    const r = await fetch(\`/api/ep-status?channel=\${encodeURIComponent(channel)}&ep=\${encodeURIComponent(ep)}\`);
    const j = await r.json();
    epStatusCache[key] = { ...j, _fetchedAt: Date.now() };
    if (activeTab === 'pipelines') render();
  } catch {}
}

let pipelineStatus = { running: null, queue: [], history: [], runningLog: '' };
async function loadPipeline() {
  try { pipelineStatus = await (await fetch('/api/pipeline/status')).json(); if (activeTab==='pipelines') render(); } catch {}
}

let flowAccounts = [];
async function loadFlowAccounts() {
  try { flowAccounts = await (await fetch('/api/flow-accounts')).json(); if (activeTab==='accounts') render(); } catch {}
}
function renderAccounts() {
  if (!flowAccounts || !flowAccounts.length) return '<div class="empty" style="background:var(--panel);border:1px solid var(--border);border-radius:8px;padding:20px">Nenhuma conta configurada. Edite <code>config/flow-accounts.json</code>.</div>';
  const rows = flowAccounts.map(a => {
    const palette = {
      free: { c:'var(--green)', i:'⚪' },
      busy: { c:'#f5a623', i:'🟢' },
      in_use_external: { c:'#3b82f6', i:'🔵' },
      cooldown: { c:'var(--red)', i:'🔴' },
    };
    const { c: color, i: icon } = palette[a.status] || palette.cooldown;
    let detail = '';
    if (a.status === 'busy') detail = \`<small style="color:var(--muted)">job: \${a.jobId||'?'} · iniciou \${a.since? new Date(a.since).toLocaleTimeString() : '?'}</small>\`;
    else if (a.status === 'in_use_external') {
      const pid = (a.externalProject||'').split('/').pop();
      detail = \`<small style="color:var(--muted)">Chrome aberto fora da pipeline (projeto \${pid? pid.slice(0,8)+'…' : '?'})</small>\`;
    }
    else if (a.status === 'cooldown') {
      const remainMs = a.blockedUntil ? (new Date(a.blockedUntil).getTime() - Date.now()) : 0;
      const remainMin = Math.max(0, Math.ceil(remainMs/60000));
      detail = \`<small style="color:var(--muted)">razão: \${a.reason||'?'} · libera em \${remainMin}min (\${a.blockedUntil? new Date(a.blockedUntil).toLocaleTimeString() : '?'})</small>\`;
    } else if (a.lastUsed) {
      detail = \`<small style="color:var(--muted)">último uso: \${new Date(a.lastUsed).toLocaleString()}</small>\`;
    }
    return \`<tr>
      <td><b>\${a.id}</b></td>
      <td>\${icon} <span style="color:\${color}">\${a.status}</span></td>
      <td><span class="censor">\${a.email}</span></td>
      <td>\${a.profile}</td>
      <td><code>\${a.port}</code></td>
      <td>\${detail}</td>
      <td>\${a.status !== 'free' ? \`<button class="btn-undo" onclick="resetAccount('\${a.id}')">↻ liberar</button>\` : ''}</td>
    </tr>\`;
  }).join('');
  return \`<h3>🔑 Contas Flow</h3>
    <p style="color:var(--muted);font-size:14px">Pipeline pega automaticamente a primeira conta <b>free</b>. Se nenhuma livre, fica em fila aguardando.</p>
    <table><thead><tr><th>ID</th><th>Status</th><th>Email</th><th>Profile</th><th>Porta</th><th>Detalhes</th><th></th></tr></thead><tbody>\${rows}</tbody></table>\`;
}
async function resetAccount(id) {
  if (!confirm('Liberar conta '+id+' (forçar status=free)?')) return;
  try {
    await fetch('/api/flow-accounts/reset', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id }) });
    toast('✅ Conta '+id+' liberada');
    loadFlowAccounts();
  } catch(e) { toast('Erro: '+e.message, true); }
}
function renderPipelines() {
  const phaseNames = {
    1: 'Roteiro+desc+nomes',
    2: 'TTS (audio.wav)',
    3: 'Sincronizador (prompts)',
    4: 'Visuais Flow',
    5: 'Render Hetzner',
    6: 'Finalizado',
    7: 'Publicado'
  };
  const workers = pipelineStatus.workers || { 1: null, 2: null, 3: null };
  const pipJobs = pipelineStatus.pipelineJobs || [];

  // 7 worker cards: 1-3 são paralelos (pipeline-runner), 4-7 derivados do filesystem
  const workersHTML = \`<div class="workers-grid">\${[1,2,3,4,5,6,7].map(ph=>{
    if (ph <= 3) {
      const w = workers[ph];
      if (!w) return \`<div class="worker-card idle"><h4>Fase \${ph} · \${phaseNames[ph]}</h4><div class="empty" style="padding:14px">idle</div></div>\`;
      const job = pipJobs.find(j => j.id === w.jobId) || { channel:'?', ep:'?', titulo:'' };
      const elapsed = Math.floor((Date.now() - new Date(w.startedAt).getTime())/1000);
      const log = (pipelineStatus.workerLogs?.[ph] || '').replace(/</g,'&lt;');
      return \`<div class="worker-card active">
        <h4>Fase \${ph} · \${phaseNames[ph]}</h4>
        <div><b class="censor">\${job.channel}</b> — EP\${job.ep}</div>
        <small style="color:var(--muted)" class="censor">\${fmt(job.titulo, 50)}</small><small style="color:var(--muted)"> · \${Math.floor(elapsed/60)}m\${elapsed%60}s</small>
        <pre class="log-tail censor" style="max-height:140px">\${log}</pre>
      </div>\`;
    }
    // Fases 4-7: filesystem-driven (todos EPs com phase === ph)
    const epList = (state||[]).flatMap(c => (c.eps||[]).filter(e => e.phase === ph).map(e => ({...e, channel: c.channel})));
    if (!epList.length) return \`<div class="worker-card idle"><h4>Fase \${ph} · \${phaseNames[ph]}</h4><div class="empty" style="padding:14px">vazio</div></div>\`;
    const items = epList.slice(0, 5).map(e => \`<div style="margin-top:4px;font-size:12px"><b class="censor">\${e.channel}</b> EP\${e.ep}<br><small style="color:var(--muted)" class="censor">\${fmt(e.titulo, 38)}</small></div>\`).join('');
    const more = epList.length > 5 ? \`<small style="color:var(--muted);display:block;margin-top:4px">+ \${epList.length-5} EPs</small>\` : '';
    return \`<div class="worker-card active">
      <h4>Fase \${ph} · \${phaseNames[ph]} <span style="color:var(--muted);font-weight:400">(\${epList.length})</span></h4>
      \${items}\${more}
    </div>\`;
  }).join('')}</div>\`;

  // Jobs pipelined em andamento
  const jobsHTML = pipJobs.length ? \`<table><thead><tr><th>Canal</th><th>EP</th><th>Título</th><th>Progresso</th><th>Status</th><th></th></tr></thead><tbody>
    \${pipJobs.map(j=>{
      const cur = j.currentPhase;
      const target = j.targetPhase;
      const bars = [1,2,3].slice(0, target).map(p => {
        if (p <= cur) return '<span class="bar done">✓</span>';
        if (Object.values(workers).some(w => w && w.jobId === j.id && w.phase === p)) return '<span class="bar active">●</span>';
        return '<span class="bar pending">○</span>';
      }).join('');
      const inWorker = Object.entries(workers).find(([_,w]) => w && w.jobId === j.id);
      const statusTxt = inWorker ? \`Fase \${inWorker[0]} rodando\` : (cur >= target ? 'completo' : 'aguardando');
      return \`<tr><td class="censor">\${j.channel}</td><td><b>EP\${j.ep}</b></td><td class="censor">\${fmt(j.titulo,50)}</td><td>\${bars}</td><td><small style="color:var(--muted)">\${statusTxt}</small></td><td><button class="btn-undo" onclick="cancelPipelined('\${j.id}')">✕</button></td></tr>\`;
    }).join('')}</tbody></table>\` : '<div class="empty" style="background:var(--panel);border:1px solid var(--border);border-radius:8px">nenhum job pipelined</div>';

  // Sequencial (singles) — agora array (1 por canal, paralelo entre canais).
  const runArr = Array.isArray(pipelineStatus.running) ? pipelineStatus.running : (pipelineStatus.running ? [pipelineStatus.running] : []);
  const runLogs = pipelineStatus.runningLogs || (pipelineStatus.runningLog && runArr[0] ? {[runArr[0].id]: pipelineStatus.runningLog} : {});
  const runHTML = runArr.map(r => \`<div class="run-card"><div style="display:flex;justify-content:space-between"><div><b>\${r.letter}\${r.ep}</b> · <span class="censor">\${r.channel}</span><br><small style="color:var(--muted)" class="censor">\${r.titulo}</small></div><div><span style="color:var(--green)">● rodando</span></div></div><pre class="log-tail censor">\${((runLogs[r.id]||'')).replace(/</g,'&lt;')}</pre><button class="btn-undo" onclick="cancelPipeline('\${r.id}')">⏹ Cancelar</button></div>\`).join('');
  const queueHTML = (pipelineStatus.queue||[]).length ? \`<table><thead><tr><th>Pos</th><th>Canal</th><th>EP</th><th>Título</th><th></th></tr></thead><tbody>
    \${pipelineStatus.queue.map((j,i)=>\`<tr><td>\${i+1}</td><td class="censor">\${j.channel}</td><td><b>\${j.letter}\${j.ep}</b></td><td class="censor">\${fmt(j.titulo,60)}</td><td><button class="btn-undo" onclick="cancelPipeline('\${j.id}')">✕</button></td></tr>\`).join('')}
    </tbody></table>\` : '';
  const histHTML = pipelineStatus.history.length ? \`<table><thead><tr><th>Canal</th><th>EP</th><th>Status</th><th>Início</th><th>Fim</th></tr></thead><tbody>
    \${pipelineStatus.history.slice(0,15).map(h=>{const ok=h.status==='success';const color=ok?'var(--green)':(h.status==='cancelled'?'var(--muted)':'var(--red)');return \`<tr><td class="censor">\${h.channel}</td><td><b>\${h.letter||''}\${h.ep}</b></td><td><span style="color:\${color}">\${h.status}\${h.failedAtPhase?' (F'+h.failedAtPhase+')':''}</span></td><td>\${new Date(h.startedAt||h.queuedAt).toLocaleString()}</td><td>\${h.finishedAt?new Date(h.finishedAt).toLocaleString():'—'}</td></tr>\`}).join('')}
    </tbody></table>\` : '<div class="empty" style="background:var(--panel);border:1px solid var(--border);border-radius:8px">sem histórico ainda</div>';

  // ── Tabela "EPs em produção" com fases 1-7 (filesystem-driven, igual aba Produção) ──
  // Fases: 1=Roteiro, 2=TTS, 3=Cenas-minutagem, 4=Prompter, 5=Visual (Cenas/*.mp4), 6=Montado (final.mp4), 7=Publicado
  const PHASE_LABELS = ['Roteiro','TTS','Cenas','Prompter','Visual','Montado','Publicado'];
  const allEps = [];
  for (const c of (state||[])) {
    for (const e of (c.eps||[])) {
      // Filtra só EPs não publicados (mostra até finalizar com final.mp4 e ser publicado)
      if (e.phase >= 0 && e.phase <= 7) allEps.push({...e, channel:c.channel});
    }
  }
  // Ordena: rodando primeiro, depois por canal+ep
  const runningJobIds = new Set(Object.values(workers).filter(Boolean).map(w => w.jobId));
  const runningKey = (e) => {
    const id = (pipJobs.find(j => j.channel===e.channel && j.ep===e.ep) || {}).id;
    if (id && runningJobIds.has(id)) return 0;
    if (runArr.some(r => r.channel===e.channel && r.ep===e.ep)) return 0;
    if (e.phase >= 6) return 2; // montados/publicados embaixo
    return 1;
  };
  allEps.sort((a,b) => {
    const d = runningKey(a) - runningKey(b);
    if (d !== 0) return d;
    return (a.channel||'').localeCompare(b.channel||'') || (parseInt(String(a.ep).replace(/\D/g,''))||0) - (parseInt(String(b.ep).replace(/\D/g,''))||0);
  });

  const epRows = allEps.map(e => {
    const cur = e.phase;
    const bars = [1,2,3,4,5,6,7].map(p => {
      const done = p <= cur;
      const isActive = !done && p === cur + 1 && Object.values(workers).some(w => w && w.phase === p);
      const cls = done ? 'phase-pill done' : (isActive ? 'phase-pill active' : 'phase-pill pending');
      return \`<span class="\${cls}" title="Fase \${p}: \${PHASE_LABELS[p-1]}">\${p}</span>\`;
    }).join('');
    let statusBadge;
    if (cur === 7) statusBadge = '<span style="color:var(--green)">✅ Publicado</span>';
    else if (cur === 6) statusBadge = '<span style="color:var(--green)">🎬 Finalizado (aguardando publish)</span>';
    else if (cur >= 5) statusBadge = '<span style="color:#f5a623">⏳ Renderizando</span>';
    else if (cur >= 4) statusBadge = '<span style="color:#f5a623">🎨 Gerando visuais</span>';
    else if (cur >= 1) statusBadge = '<span style="color:#5e9eff">📝 Em preparação</span>';
    else statusBadge = '<span style="color:var(--muted)">— pendente</span>';
    const isRunning = runArr.some(r => r.channel===e.channel && r.ep===e.ep);
    if (isRunning) statusBadge += ' · <span style="color:var(--green)"><span class="pulse-dot"></span> rodando</span>';
    return \`<tr>
      <td class="censor">\${e.channel}</td>
      <td><b>EP\${e.ep}</b></td>
      <td class="censor">\${fmt(e.titulo, 45)}</td>
      <td><div class="phases-row">\${bars}</div></td>
      <td>\${statusBadge}</td>
    </tr>\`;
  }).join('') || '<tr><td colspan="5" class="empty">nenhum EP em pipeline</td></tr>';

  // ── Operations Cards: EPs em produção (fase 0-5). Fase 6 sai pra Produção/Prontos.
  // Inclui fase 0 (folder criado mas vazio) pra match 1:1 com Obsidian.
  const opsEps = allEps.filter(e => e.phase >= 0 && e.phase <= 5)
    .filter(e => !opsChannelFilter || e.channel === opsChannelFilter);
  const opsChannelOpts = ['<option value="">— todos os canais —</option>',
    ...Array.from(new Set((state||[]).map(c=>c.channel))).sort()
      .map(ch => \`<option value="\${ch}" \${ch===opsChannelFilter?'selected':''}>\${ch}</option>\`)
  ].join('');
  // Próxima fase a rodar baseada no estado
  const nextPhaseLabel = (phase) => {
    if (phase === 0) return 'Fase 1 · Roteiro';
    if (phase === 1) return 'Fase 1b · desc + README + Nomes';
    if (phase === 2) return 'Fase 3 · Sincronizador';
    if (phase === 3) return 'Fase 4 · Visuais Flow';
    if (phase === 4) return 'Fase 4 · Visuais Flow';
    if (phase === 5) return 'Fase 5 · Render Hetzner';
    return 'Finalizar';
  };
  // dispara fetch dos detalhes (cache no client)
  opsEps.forEach(e => {
    const key = e.channel + '|' + e.ep;
    if (!epStatusCache[key] || (Date.now() - (epStatusCache[key]._fetchedAt||0)) > 8000) {
      fetchEpStatus(e.channel, e.ep);
    }
  });
  const opsCardsHTML = opsEps.map(e => {
    const key = e.channel + '|' + e.ep;
    const info = epStatusCache[key];
    if (!info) {
      return \`<div class="ops-card"><div class="ops-head"><b class="censor">\${e.channel}</b> · EP\${e.ep}</div><div style="color:var(--muted)">carregando…</div></div>\`;
    }
    const colorMap = { green:'#3fb950', red:'#f85149', orange:'#f5a623', gray:'#8b949e' };
    const borderColor = colorMap[info.color] || '#8b949e';
    const a = info.artifacts || {};
    const progress = a.cenasTotal > 0 ? Math.round((a.cenasCount/a.cenasTotal)*100) : 0;
    const procsHtml = (info.activeProcs||[]).length
      ? info.activeProcs.map(p => \`<div style="font-family:monospace;font-size:11px;color:var(--green)">PID \${p.pid}: \${p.cmd.slice(0,80)}</div>\`).join('')
      : '<span style="color:var(--muted);font-size:12px">nenhum processo ativo</span>';
    const logSummary = info.log
      ? \`<div style="margin-top:8px"><b>Log:</b> <code>\${info.log.file}</code> · \${Math.floor(info.log.ageSec/60)}min atrás\${info.log.hasError?' <span style="color:var(--red)">⚠️ ERRO</span>':''}<br><small style="color:var(--muted)">submetidas: \${info.log.cenasSubmitted}</small></div>\`
      : '<div style="color:var(--muted);font-size:12px;margin-top:8px">sem log no /tmp/loopx-pipeline-logs</div>';
    const fileChecks = [
      ['roteiro.md', a.roteiro],
      ['audio.wav', a.audio],
      ['cenas-minutagem.md', a.cenasMinutagem],
      ['prompts-veo3.md', a.prompts],
      [\`Cenas/ (\${a.cenasCount}/\${a.cenasTotal})\`, a.cenasCount > 0],
      ['final.mp4', a.finalMp4],
      ['thumb.md', a.thumb],
    ].map(([n,ok]) => \`<span class="file-chip \${ok?'ok':'pending'}">\${ok?'✓':'·'} \${n}</span>\`).join('');
    return \`<div class="ops-card" style="border-color:\${borderColor}">
      <div class="ops-head">
        <div><b class="censor">\${e.channel}</b> · <b>EP\${e.ep}</b></div>
        <div class="ops-state" style="color:\${borderColor}">\${info.summary}</div>
      </div>
      <div class="censor" style="color:var(--muted);font-size:13px;margin:4px 0 8px">\${fmt(e.titulo, 80)}</div>
      \${a.cenasTotal > 0 ? \`<div class="ops-progress-bar"><div style="width:\${progress}%;background:\${borderColor}"></div></div><small style="color:var(--muted)">\${a.cenasCount}/\${a.cenasTotal} cenas (\${progress}%)</small>\` : ''}
      <div style="margin-top:10px">\${fileChecks}</div>
      <div style="margin-top:10px"><b>Processos ativos:</b><br>\${procsHtml}</div>
      \${logSummary}
      \${info.log ? \`<details \${expandedLogs.has(key)?'open':''} data-logkey="\${key}" onclick="setTimeout(()=>toggleLogExpand('\${key}',this.open),0)" style="margin-top:8px"><summary style="cursor:pointer;color:var(--accent);font-size:12px">📋 Ver tail do log</summary><pre class="log-tail censor" style="max-height:300px;margin-top:6px;overflow-y:auto;overflow-x:auto;white-space:pre">\${(info.log.tail||'').replace(/</g,'&lt;')}</pre></details>\` : ''}
      <div style="margin-top:10px;display:flex;gap:6px;align-items:center">
        \${(()=>{ const runArr2 = Array.isArray(pipelineStatus.running) ? pipelineStatus.running : (pipelineStatus.running ? [pipelineStatus.running] : []); const myRun = runArr2.find(r => r.channel===e.channel && r.ep===e.ep); return (info.state === 'running' || myRun); })()
          ? \`<button class="btn-undo" onclick="cancelPipeline('\${(()=>{const a=Array.isArray(pipelineStatus.running)?pipelineStatus.running:(pipelineStatus.running?[pipelineStatus.running]:[]);const m=a.find(r=>r.channel===e.channel&&r.ep===e.ep);return m?m.id:'';})()}')" style="font-size:12px">⏹ Cancelar</button>\`
          : \`<button class="btn-run" onclick="runPipeline('\${encodeURIComponent(e.channel)}','\${e.ep}','\${(e.titulo||'').replace(/'/g,'').slice(0,80)}')" style="font-size:12px">▶ Continuar (\${nextPhaseLabel(e.phase)})</button>\`}
        <small style="color:var(--muted);font-size:11px">resume automático — pula etapas já feitas</small>
      </div>
    </div>\`;
  }).join('') || '<div class="empty" style="background:var(--panel);border:1px solid var(--border);border-radius:8px;padding:20px">Nenhum EP em produção</div>';

  return \`<h3>🎬 EPs em produção — estado operacional</h3>
    <div style="font-size:12px;color:var(--muted);margin-bottom:12px">Verde = rodando · Laranja = pausado · Vermelho = erro · Cinza = idle</div>
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
      <label style="font-size:12px;color:var(--muted)">Filtrar por canal:</label>
      <select class="filter" style="margin:0;min-width:240px" onchange="opsChannelFilter=this.value;render()">\${opsChannelOpts}</select>
      <small style="color:var(--muted);font-size:11px">\${opsEps.length} EP\${opsEps.length===1?'':'s'} \${opsChannelFilter?'em '+opsChannelFilter:'no total'}</small>
    </div>
    <div class="ops-grid">\${opsCardsHTML}</div>
    <h3 style="margin-top:32px">⚡ Assembly Line — todas as fases (1-7)</h3>
    <div style="font-size:12px;color:var(--muted);margin-bottom:8px">Fases 1-3 = workers paralelos (pipeline-runner). Fases 4-7 = EPs lidos do filesystem.</div>
    \${workersHTML}
    <h3 style="margin-top:24px">🎬 EPs em produção — fases 1→7</h3>
    <div style="font-size:12px;color:var(--muted);margin-bottom:8px">"Finalizado" = fase 6 (final.mp4 renderizado) · "Publicado" = fase 7</div>
    <table><thead><tr><th>Canal</th><th>EP</th><th>Título</th><th>Fases</th><th>Status</th></tr></thead>
    <tbody>\${epRows}</tbody></table>
    <h3 style="margin-top:24px">📦 Jobs pipelined (\${pipJobs.length})</h3>\${jobsHTML}
    \${runHTML?\`<h3 style="margin-top:24px">▶ Job sequencial</h3>\${runHTML}\`:''}
    \${queueHTML?\`<h3 style="margin-top:24px">📋 Fila sequencial</h3>\${queueHTML}\`:''}
    <h3 style="margin-top:24px">📜 Histórico</h3>\${histHTML}\`;
}
async function cancelPipelined(id) {
  if (!confirm('Cancelar este job pipelined?')) return;
  try {
    const r = await fetch('/api/pipeline/cancel-pipelined', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id }) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'erro');
    toast('⏹ cancelado');
    loadPipeline();
  } catch(e) { toast('Erro: '+e.message, true); }
}
async function cancelPipeline(id) {
  if (!confirm('Cancelar pipeline?')) return;
  try {
    const r = await fetch('/api/pipeline/cancel', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id }) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'erro');
    toast('⏹ cancelado');
    loadPipeline();
  } catch(e) { toast('Erro: '+e.message, true); }
}

function render() {
  const main = document.getElementById('main');
  if (activeTab==='calendar') main.innerHTML = renderCalendar();
  else if (activeTab==='production') main.innerHTML = renderProduction();
  else if (activeTab==='pipelines') main.innerHTML = renderPipelines();
  else if (activeTab==='accounts') main.innerHTML = renderAccounts();
  else if (activeTab==='chat') { main.innerHTML = renderChat(); setTimeout(scrollChatBottom, 50); }
  else if (activeTab==='kanban') main.innerHTML = renderKanban();
  else main.innerHTML = renderFila();
  // Limpa badge ao abrir
  if (activeTab==='chat') { unreadChat = 0; updateBadges(); }
  if (activeTab==='kanban') { unreadKanban = 0; updateBadges(); }
}

// ═══════════════════ F1: Identidade ═══════════════════
let currentUserName = null;
async function loadWhoami() {
  try {
    const r = await fetch('/api/whoami');
    const j = await r.json();
    currentUserName = j.user;
    document.getElementById('whoami').textContent = currentUserName ? '👤 '+currentUserName : '⚠️ identifique-se';
    if (!currentUserName) showIdentityModal();
  } catch {}
}
function showIdentityModal() {
  if (document.getElementById('identityModal')) return;
  const div = document.createElement('div');
  div.id = 'identityModal';
  div.style = 'position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:9999;display:flex;align-items:center;justify-content:center';
  div.innerHTML = \`<div style="background:var(--panel);border:1px solid var(--border);border-radius:12px;padding:32px;max-width:400px;text-align:center">
    <h2 style="margin:0 0 12px">👋 Quem é você?</h2>
    <p style="color:var(--muted);margin:0 0 24px">Selecione pra continuar. Fica salvo neste browser.</p>
    <div style="display:flex;gap:12px;justify-content:center">
      <button class="btn-run" style="padding:14px 28px;font-size:16px" onclick="pickUser('jaci')">👩 Jaci</button>
      <button class="btn-run" style="padding:14px 28px;font-size:16px;background:#5a3fff" onclick="pickUser('paulo')">👨 Paulo</button>
    </div>
  </div>\`;
  document.body.appendChild(div);
}
function pickUser(name) {
  // Cookie via redirect com ?user=
  const url = new URL(window.location.href);
  url.searchParams.set('user', name);
  window.location.href = url.toString();
}

// ═══════════════════ F2: Chat ═══════════════════
let chatMessages = [];
let unreadChat = 0;
async function loadChat() {
  try {
    const r = await fetch('/api/chat');
    const j = await r.json();
    chatMessages = j.messages || [];
    if (activeTab==='chat') render();
  } catch {}
}
function renderChat() {
  const list = chatMessages.map(m => {
    const cls = m.user === currentUserName ? 'chat-msg own' : (m.user === 'system' ? 'chat-msg sys' : 'chat-msg');
    const time = new Date(m.ts).toLocaleTimeString().slice(0,5);
    const txt = m.text.replace(/</g,'&lt;').replace(/@(jaci|paulo)/gi, '<b class="mention">@$1</b>');
    return \`<div class="\${cls}"><div class="chat-meta"><b>\${m.user}</b> · \${time}</div><div class="chat-body">\${txt}</div></div>\`;
  }).join('') || '<div class="empty" style="padding:20px">sem mensagens ainda</div>';
  return \`<div class="chat-wrap">
    <div class="chat-list" id="chatList">\${list}</div>
    <div class="chat-input-row">
      <input id="chatInput" placeholder="Mensagem (Enter pra enviar, @jaci/@paulo pra notificar)" onkeydown="if(event.key==='Enter')sendChat()">
      <button class="btn-run" onclick="sendChat()">Enviar</button>
    </div>
  </div>\`;
}
function scrollChatBottom() {
  const el = document.getElementById('chatList'); if (el) el.scrollTop = el.scrollHeight;
  const inp = document.getElementById('chatInput'); if (inp) inp.focus();
}
async function sendChat() {
  const inp = document.getElementById('chatInput');
  const text = (inp.value||'').trim();
  if (!text) return;
  if (!currentUserName) { toast('Identifique-se primeiro: ?user=jaci ou ?user=paulo na URL', true); return; }
  inp.value = '';
  try {
    await fetch('/api/chat', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ text, user: currentUserName }) });
  } catch(e) { toast('Erro: '+e.message, true); inp.value = text; }
}

// ═══════════════════ F3: Notificações (som + badge + título) ═══════════════════
let notifEnabled = localStorage.getItem('loopx_notif') !== '0'; // default ON
const origTitle = document.title;
let audioCtx = null;
function ensureAudio() {
  if (audioCtx) return audioCtx;
  try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch {}
  return audioCtx;
}
async function playBeep(freq = 880, duration = 0.15, type = 'sine') {
  const ctx = ensureAudio();
  if (!ctx) { console.log('[beep] no audio ctx'); return; }
  if (ctx.state === 'suspended') {
    try { await ctx.resume(); } catch (e) { console.log('[beep] resume fail', e); }
  }
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch (e) { console.log('[beep] play fail', e); }
}
async function chime() {
  // Acorde curto pra notif (3 notas)
  await playBeep(880, 0.12);
  setTimeout(() => playBeep(1175, 0.12), 80);
  setTimeout(() => playBeep(1318, 0.18), 160);
}
function updateNotifBtn() {
  const b = document.getElementById('notifBtn');
  if (b) b.textContent = notifEnabled ? '🔔' : '🔕';
  if (b) b.title = notifEnabled ? 'Som ativo (clique pra mutar)' : 'Mudo (clique pra ativar)';
}
function toggleNotif() {
  notifEnabled = !notifEnabled;
  localStorage.setItem('loopx_notif', notifEnabled ? '1' : '0');
  updateNotifBtn();
  if (notifEnabled) {
    // Toca beep curto pra "destravar" AudioContext (Chrome exige user gesture)
    ensureAudio();
    playBeep(660, 0.1);
    toast('🔔 Som ativado');
  } else {
    toast('🔕 Mudo');
  }
}
function notify(title, body) {
  console.log('[notify]', title, 'enabled?', notifEnabled, 'audio?', audioCtx && audioCtx.state);
  // SEMPRE mostra toast visual (independente de notifEnabled)
  toast(title + ': ' + body.slice(0, 80));
  if (!notifEnabled) return;
  chime();
}
function updateTabTitle() {
  const total = unreadChat + unreadKanban;
  document.title = total > 0 ? '(' + total + ') ' + origTitle : origTitle;
}
function updateBadges() {
  const c = document.getElementById('chatBadge');
  const k = document.getElementById('kanbanBadge');
  if (c) { c.textContent = unreadChat; c.style.display = unreadChat ? 'inline-block' : 'none'; }
  if (k) { k.textContent = unreadKanban; k.style.display = unreadKanban ? 'inline-block' : 'none'; }
  updateTabTitle();
}

// ═══════════════════ F4: Kanban ═══════════════════
let kanban = { columns: [], cards: [] };
let unreadKanban = 0;
async function loadKanban() {
  try {
    const r = await fetch('/api/kanban');
    kanban = await r.json();
    if (activeTab==='kanban') render();
  } catch {}
}
function renderKanban() {
  const cols = kanban.columns.map(col => {
    const cards = kanban.cards.filter(c => c.column === col.id);
    const cardsHTML = cards.map(c => {
      const prio = { low: '🟢', med: '🟡', high: '🔴' }[c.priority] || '🟡';
      const assigneeBadge = c.assignee ? \`<span class="kanban-assignee">@\${c.assignee}</span>\` : '';
      const deadline = c.deadline ? \`<small style="color:var(--muted)">📅 \${c.deadline}</small>\` : '';
      return \`<div class="kanban-card" draggable="true" data-id="\${c.id}" ondragstart="event.dataTransfer.setData('id',this.dataset.id)" onclick="editCard('\${c.id}')">
        <div class="kanban-card-title">\${prio} \${c.title.replace(/</g,'&lt;')}</div>
        \${c.description?\`<div class="kanban-card-desc">\${c.description.slice(0,120).replace(/</g,'&lt;')}\${c.description.length>120?'…':''}</div>\`:''}
        <div class="kanban-card-foot">\${assigneeBadge} \${deadline}</div>
      </div>\`;
    }).join('') || '<div class="empty" style="padding:10px;font-size:12px">vazio</div>';
    return \`<div class="kanban-col" ondragover="event.preventDefault()" ondrop="dropCard(event,'\${col.id}')">
      <h4>\${col.title} <small style="color:var(--muted);font-weight:400">\${cards.length}</small></h4>
      <div class="kanban-col-body">\${cardsHTML}</div>
    </div>\`;
  }).join('');
  return \`<div style="display:flex;gap:10px;margin-bottom:16px">
    <button class="btn-run" onclick="newCard()">+ Novo card</button>
    <input id="kanbanFilter" placeholder="Filtrar…" oninput="render()" style="flex:1;max-width:300px">
  </div>
  <div class="kanban-board">\${cols}</div>\`;
}
async function dropCard(ev, col) {
  ev.preventDefault();
  const id = ev.dataTransfer.getData('id');
  if (!id) return;
  try {
    await fetch('/api/kanban/card', { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id, column: col }) });
  } catch(e) { toast('Erro: '+e.message, true); }
}
async function newCard() {
  const title = prompt('Título do card:');
  if (!title) return;
  const assignee = prompt('Atribuir a (jaci/paulo/vazio):') || null;
  const priority = prompt('Prioridade (low/med/high):', 'med') || 'med';
  await fetch('/api/kanban/card', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ title, assignee, priority }) });
}
async function editCard(id) {
  const card = kanban.cards.find(c => c.id === id);
  if (!card) return;
  const choice = prompt(\`Card: \${card.title}\\n\\n1=Editar título  2=Editar descrição  3=Mudar assignee  4=Mudar prioridade  5=Deletar  (cancelar=enter)\`);
  if (!choice) return;
  if (choice === '5') {
    if (!confirm('Deletar?')) return;
    await fetch('/api/kanban/card', { method:'DELETE', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id }) });
    return;
  }
  const patch = { id };
  if (choice === '1') patch.title = prompt('Novo título:', card.title);
  if (choice === '2') patch.description = prompt('Nova descrição:', card.description||'');
  if (choice === '3') patch.assignee = prompt('jaci/paulo/vazio:', card.assignee||'') || null;
  if (choice === '4') patch.priority = prompt('low/med/high:', card.priority);
  await fetch('/api/kanban/card', { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(patch) });
}

document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>{
  document.querySelectorAll('nav button').forEach(x=>x.classList.remove('active'));
  b.classList.add('active');
  activeTab = b.dataset.tab;
  render();
});

function toast(msg, isErr) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show' + (isErr ? ' error' : '');
  setTimeout(()=>t.className = 'toast', 2400);
}
async function runPipeline(channel, ep, titulo) {
  channel = decodeURIComponent(channel);
  if (!confirm('Rodar pipeline completa do EP'+ep+' ('+channel+')? Pode levar 1-3h.')) return;
  try {
    const r = await fetch('/api/pipeline/run', { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ channel, ep, titulo }) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'erro');
    toast('▶ Pipeline EP'+ep+' enfileirada (id: '+j.id+')');
  } catch(e) { toast('Erro: ' + e.message, true); }
}
function updateSelCount() {
  const n = document.querySelectorAll('.fila-check:checked').length;
  const el = document.getElementById('selCount');
  if (el) el.textContent = n + ' selecionado' + (n===1?'':'s');
}
function selectAllFila(checked) {
  document.querySelectorAll('.fila-check').forEach(cb => { cb.checked = checked; });
  updateSelCount();
}
function selectChannelFila(headerCb, channelEnc) {
  document.querySelectorAll('.fila-check[data-channel="'+channelEnc+'"]').forEach(cb => { cb.checked = headerCb.checked; });
  updateSelCount();
}
async function runSelected() {
  const checked = [...document.querySelectorAll('.fila-check:checked')];
  if (checked.length === 0) { toast('Nenhum título selecionado', true); return; }
  if (!confirm(\`Rodar Fases 1-3 em \${checked.length} EP(s) selecionado(s)? Sequencial, ~10-20min/EP. Eles saem da Fila e vão pra Produção.\`)) return;
  const items = checked.map(cb => ({
    channel: decodeURIComponent(cb.dataset.channel),
    ep: cb.dataset.ep,
    titulo: cb.dataset.titulo
  }));
  try {
    const r = await fetch('/api/pipeline/run-fila-batch', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ stopAfterPhase: 3, items })
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'erro');
    toast('▶ '+j.enqueued+' EPs enfileirados (até Fase 3)');
    activeTab = 'pipelines';
    document.querySelectorAll('nav button').forEach(b => b.classList.toggle('active', b.dataset.tab === 'pipelines'));
    render();
  } catch(e) { toast('Erro: ' + e.message, true); }
}
async function promoteFila(channel, ep, tituloInputId) {
  channel = decodeURIComponent(channel);
  const tituloEl = document.getElementById(tituloInputId);
  const titulo = tituloEl ? tituloEl.value : '';
  if (!confirm('Criar pasta do EP'+ep+' em Produção?\\n\\n'+titulo)) return;
  try {
    const r = await fetch('/api/fila/promote', { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ channel, ep, titulo }) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'erro');
    toast(j.alreadyExisted ? '⚠ Pasta já existia: '+j.folder : '➡ EP'+ep+' criado em Produção');
    activeTab = 'production';
    document.querySelectorAll('nav button').forEach(b => b.classList.toggle('active', b.dataset.tab === 'production'));
    render();
  } catch(e) { toast('Erro: ' + e.message, true); }
}
async function addToFila() {
  const channel = document.getElementById('fila-channel').value;
  const titulo = document.getElementById('fila-titulo').value.trim();
  const thumb = document.getElementById('fila-thumb').value.trim();
  if (!titulo) { toast('Preencha o título', true); return; }
  filaFormChannel = channel;
  try {
    const r = await fetch('/api/fila/add', { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ channel, titulo, thumb }) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'erro');
    toast('✓ EP' + j.ep + ' adicionado à fila');
    document.getElementById('fila-titulo').value = '';
    document.getElementById('fila-thumb').value = '';
  } catch(e) { toast('Erro: ' + e.message, true); }
}
async function removeFila(channel, ep) {
  if (!confirm('Remover EP' + ep + ' da fila?')) return;
  try {
    const r = await fetch('/api/fila/delete', { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ channel: decodeURIComponent(channel), ep }) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'erro');
    toast('🗑 EP' + ep + ' removido');
  } catch(e) { toast('Erro: ' + e.message, true); }
}
async function updateFila(channel, ep, field, value) {
  try {
    const r = await fetch('/api/fila/update', { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ channel: decodeURIComponent(channel), ep, [field]: value }) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'erro');
  } catch(e) { toast('Erro: ' + e.message, true); }
}
async function agendar(channel, ep, inputId, clear) {
  channel = decodeURIComponent(channel);
  let date = '';
  if (!clear) {
    const el = document.getElementById(inputId);
    date = el ? el.value : '';
    if (!date) { toast('Escolha uma data primeiro', true); return; }
  }
  try {
    const r = await fetch('/api/agendar', { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ channel, ep, date }) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'erro');
    toast(date ? (j.publishedNow ? \`✓ EP\${ep} publicado em \${date} (movido para Publicado/)\` : \`📅 EP\${ep} marcado para \${date}\`) : \`✕ Agendamento removido\`);
    await loadCalendar();
    render();
  } catch(e) { toast('Erro: ' + e.message, true); }
}
async function markPublicado(channel, folder) {
  if (!confirm('Mover EP para a pasta Publicado?')) return;
  try {
    const r = await fetch('/api/publish', { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ channel: decodeURIComponent(channel), folder: decodeURIComponent(folder) }) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'erro');
    toast('✓ ' + j.from + ' → Publicado');
  } catch(e) { toast('Erro: ' + e.message, true); }
}
async function unpublicar(channel, folder) {
  if (!confirm('Voltar EP para fora da pasta Publicado?')) return;
  try {
    const r = await fetch('/api/unpublish', { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ channel: decodeURIComponent(channel), folder: decodeURIComponent(folder) }) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'erro');
    toast('↶ EP voltou para produção');
  } catch(e) { toast('Erro: ' + e.message, true); }
}
const evt = new EventSource('/events');
evt.onopen = ()=>document.getElementById('status').textContent = 'ao vivo';
evt.onerror = ()=>document.getElementById('status').textContent = 'reconectando...';
evt.onmessage = (m)=>{
  const data = JSON.parse(m.data);
  // Eventos custom (chat, kanban, etc.)
  if (data.event === 'chat:new') {
    const msg = data.data;
    chatMessages.push(msg);
    if (chatMessages.length > 500) chatMessages = chatMessages.slice(-500);
    if (activeTab === 'chat') { render(); setTimeout(scrollChatBottom, 50); }
    else { unreadChat++; updateBadges(); }
    // F3: SEMPRE notifica se msg não é minha
    if (msg.user !== currentUserName) {
      const label = msg.user === 'system' ? '🤖 sistema' : '💬 ' + msg.user;
      notify(label, msg.text.slice(0,140));
    }
    return;
  }
  if (data.event && data.event.startsWith('kanban:')) {
    loadKanbanState();
    if (activeTab !== 'kanban') { unreadKanban++; updateBadges(); }
    if (data.event === 'kanban:card_new' && data.data && data.data.assignee === currentUserName && data.data.createdBy !== currentUserName) {
      notify('📌 Novo card atribuído', data.data.title);
    }
    return;
  }
  // Default: state update (fila/produção/etc)
  if (data.state) {
    state = data.state;
    document.getElementById('lastUpdate').textContent = 'última atualização: ' + new Date(data.ts).toLocaleTimeString();
    render();
    loadCalendar();
  }
};
async function loadKanbanState() {
  try {
    const r = await fetch('/api/kanban');
    kanban = await r.json();
    if (activeTab === 'kanban') render();
  } catch {}
}
document.getElementById('notifBtn').addEventListener('click', toggleNotif);
updateNotifBtn();
// Prime AudioContext em qualquer interação do usuário (Chrome exige user gesture)
let audioPrimed = false;
document.addEventListener('click', () => {
  if (audioPrimed) return;
  audioPrimed = true;
  const ctx = ensureAudio();
  if (ctx && ctx.state === 'suspended') ctx.resume().catch(()=>{});
}, { once: false });
loadWhoami();
loadChat();
loadKanbanState();
loadCalendar();
loadPipeline();
setInterval(loadPipeline, 3000);
loadFlowAccounts();
setInterval(loadFlowAccounts, 5000);

function togglePrivacy() {
  const on = !document.body.classList.contains('privacy-on');
  document.body.classList.toggle('privacy-on', on);
  document.getElementById('privacyBtn').classList.toggle('on', on);
  document.getElementById('privacyBtn').textContent = on ? '🙈' : '👁';
  try { localStorage.setItem('loopx_privacy', on ? '1' : '0'); } catch {}
}
// Restaura estado ao carregar
(() => {
  try {
    if (localStorage.getItem('loopx_privacy') === '1') {
      document.body.classList.add('privacy-on');
      const btn = document.getElementById('privacyBtn');
      if (btn) { btn.classList.add('on'); btn.textContent = '🙈'; }
    }
  } catch {}
})();
</script>
</body>
</html>`;

// ─── HTTP server ─────────────────────────────────────────────
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 1e5) reject(new Error('payload too large')); });
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}
function isSafeName(n) { return typeof n === 'string' && n && !n.includes('..') && !n.includes('/') && !n.includes('\\'); }

async function handlePublish(req, res, direction) {
  try {
    const body = await readBody(req);
    const { channel, folder } = body;
    if (!isSafeName(channel) || !isSafeName(folder)) throw new Error('parâmetros inválidos');
    const channelDir = path.join(CANAIS_DIR, channel);
    if (!fs.existsSync(channelDir)) throw new Error('canal não encontrado');
    const pubDir = path.join(channelDir, PUBLICADO_DIR_NAME);
    if (direction === 'publish') {
      const src = path.join(channelDir, folder);
      const dst = path.join(pubDir, folder);
      if (!fs.existsSync(src)) throw new Error('pasta do EP não encontrada');
      if (fs.existsSync(dst)) throw new Error('já existe em Publicado');
      fs.mkdirSync(pubDir, { recursive: true });
      fs.renameSync(src, dst);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, from: folder, to: path.join(PUBLICADO_DIR_NAME, folder) }));
    } else {
      // unpublish: search in any of PUBLICADO_DIRS
      let foundSrc = null;
      for (const d of PUBLICADO_DIRS) {
        const candidate = path.join(channelDir, d, folder);
        if (fs.existsSync(candidate)) { foundSrc = candidate; break; }
      }
      if (!foundSrc) throw new Error('EP não está em pasta Publicado');
      const dst = path.join(channelDir, folder);
      if (fs.existsSync(dst)) throw new Error('já existe fora de Publicado');
      fs.renameSync(foundSrc, dst);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, from: folder }));
    }
    scheduleRescan();
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message }));
  }
}

const server = http.createServer((req, res) => {
  // ── F1: Identidade via cookie + query ?user= ────────────────
  const urlObj = new URL(req.url, 'http://x');
  const qUser = (urlObj.searchParams.get('user') || '').toLowerCase();
  if (['jaci', 'paulo'].includes(qUser)) {
    // Sticky cookie de 1 ano
    res.setHeader('Set-Cookie', `loopx_user=${qUser}; Path=/; Max-Age=31536000; SameSite=Lax`);
  }

  // ── F1: Identidade endpoint ─────────────────────────────────
  if (req.url.startsWith('/api/whoami')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ user: currentUser(req) || qUser || null }));
  }

  // ── Detalhe operacional de UM EP (estado real: processo vivo? erro? progresso?) ──
  if (req.url.startsWith('/api/ep-status')) {
    try {
      const channel = urlObj.searchParams.get('channel');
      const ep = urlObj.searchParams.get('ep');
      if (!channel || !ep) throw new Error('channel + ep obrigatórios');
      const { CANAIS_DIR } = require('./dashboard-sync');
      const { execSync } = require('child_process');
      const channelDir = path.join(CANAIS_DIR, channel);
      // Acha EP folder (primeiro que começa com NUM)
      let epDir = null;
      if (fs.existsSync(channelDir)) {
        const match = fs.readdirSync(channelDir).find(d => new RegExp('^' + ep + ' - ').test(d));
        if (match) epDir = path.join(channelDir, match);
      }
      const result = { channel, ep, epDir, exists: !!epDir };
      if (epDir && fs.existsSync(epDir)) {
        // Artefatos por fase
        const has = (f) => fs.existsSync(path.join(epDir, f));
        const cenasDir = path.join(epDir, 'Cenas');
        const cenasCount = fs.existsSync(cenasDir) ? fs.readdirSync(cenasDir).filter(f => /\.(mp4|png|jpg)$/i.test(f)).length : 0;
        // Total esperado de cenas
        let cenasTotal = 0;
        if (has('cenas-minutagem.md')) {
          const t = fs.readFileSync(path.join(epDir, 'cenas-minutagem.md'), 'utf8');
          cenasTotal = (t.match(/^Cena /gm) || []).length;
        }
        result.artifacts = {
          roteiro: has('roteiro.md'),
          desc: has('desc.md'),
          readme: has('README.md'),
          audio: has('audio.wav'),
          srt: has('audio.srt'),
          cenasMinutagem: has('cenas-minutagem.md'),
          prompts: has('prompts-veo3.md'),
          cenasCount,
          cenasTotal,
          finalMp4: has('final.mp4') || has('video-final.mp4'),
          thumb: has('thumb.md'),
          thumbImg: has('thumb-image.png'),
          ytMeta: has('youtube-metadata.json'),
        };
      }
      // Logs do pipeline-runner pra esse EP — escopo por canal (letter de channels.json)
      const letter = pipeline.channelLetter(channel);
      if (!letter) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: `canal sem letra em channels.json: ${channel}` }));
      }
      const logsDir = '/tmp/loopx-pipeline-logs';
      let lastLog = null;
      if (fs.existsSync(logsDir)) {
        const epEsc = String(ep).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const logRe = new RegExp('^' + letter + epEsc + '(?:[-.]|$)');
        const candidates = fs.readdirSync(logsDir)
          .filter(f => logRe.test(f))
          .map(f => ({ name: f, path: path.join(logsDir, f), mtime: fs.statSync(path.join(logsDir, f)).mtimeMs }))
          .sort((a,b) => b.mtime - a.mtime);
        if (candidates.length) lastLog = candidates[0];
      }
      result.log = null;
      if (lastLog) {
        const content = fs.readFileSync(lastLog.path, 'utf8');
        const lines = content.split('\n');
        const tail = lines.slice(-20).join('\n');
        const hasError = /💥 Erro fatal|❌ FASE|GOOGLE BLOQUEOU|Error:/.test(tail);
        const lastSubmitted = (content.match(/✅ Cena (\d+)/g) || []).length;
        result.log = {
          file: lastLog.name,
          ageSec: Math.floor((Date.now() - lastLog.mtime) / 1000),
          tail,
          hasError,
          cenasSubmitted: lastSubmitted,
        };
      }
      // Processos ativos pra este EP — match exato em args (LETTER + EP), não substring em qualquer lugar.
      // Antes: grep -i "${ep}" pegava processos de outros canais com mesmo número de EP.
      try {
        const psOut = execSync(`ps -A -o pid=,command=`, { stdio: ['ignore','pipe','ignore'] }).toString();
        const epStr = String(ep);
        const epDirRe = new RegExp(`/jobs/${letter}/${epStr}(?:[/\\s]|$)`);
        const argRe = new RegExp(`(?:^|\\s)(?:--canal[= ]${letter}\\b|-?-?num[= ]${epStr}\\b)`, 'i');
        // pipeline-full.sh é spawnado como: pipeline-full.sh <LETTER> <EP> [titulo]
        const shellArgRe = new RegExp(`pipeline-full\\.sh\\s+${letter}\\s+${epStr}(?:\\s|$)`);
        const toolRe = /pipeline-full|veo3-generator|flow-download|flow-watch|tts-full|nano-submit/i;
        result.activeProcs = psOut.split('\n').map(l => {
          const m = l.match(/^\s*(\d+)\s+(.+)/);
          if (!m) return null;
          const cmd = m[2];
          if (!toolRe.test(cmd)) return null;
          // Tem que conter ESTE canal + ESTE ep (por path do job OU por args do shell)
          if (!epDirRe.test(cmd) && !shellArgRe.test(cmd) && !argRe.test(cmd)) return null;
          return { pid: parseInt(m[1]), cmd: cmd.slice(0, 200) };
        }).filter(Boolean);
      } catch { result.activeProcs = []; }
      // Estado consolidado
      const a = result.artifacts || {};
      const running = (result.activeProcs || []).length > 0;
      const recentLog = result.log && result.log.ageSec < 300; // <5min
      let state, color, summary;
      if (running) {
        state = 'running'; color = 'green';
        summary = `🟢 Rodando — ${result.activeProcs.length} processo(s) ativo(s)`;
      } else if (result.log && result.log.hasError) {
        state = 'error'; color = 'red';
        summary = `🔴 Erro detectado no log (${Math.floor(result.log.ageSec/60)}min atrás)`;
      } else if (a.finalMp4) {
        state = 'done'; color = 'green';
        summary = `✅ Finalizado (video-final.mp4 presente)`;
      } else if (a.cenasCount > 0 && a.cenasCount < a.cenasTotal) {
        state = 'paused'; color = 'orange';
        summary = `⏸ Pausado em fase 4-5 — ${a.cenasCount}/${a.cenasTotal} cenas (${Math.round(a.cenasCount/a.cenasTotal*100)}%)`;
      } else if (a.prompts && a.cenasCount === 0) {
        state = 'paused'; color = 'orange';
        summary = `⏸ Pronto pra fase 4 (Flow) — 0/${a.cenasTotal} cenas`;
      } else if (a.audio && !a.prompts) {
        state = 'paused'; color = 'orange';
        summary = `⏸ Pronto pra fase 3 (Sincronizador)`;
      } else if (a.roteiro && !a.audio) {
        state = 'paused'; color = 'orange';
        summary = `⏸ Pronto pra fase 2 (TTS)`;
      } else if (a.roteiro) {
        state = 'paused'; color = 'orange';
        summary = `⏸ Roteiro pronto`;
      } else {
        state = 'idle'; color = 'gray';
        summary = `⚪ Nada iniciado`;
      }
      result.state = state;
      result.color = color;
      result.summary = summary;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(result));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: e.message }));
    }
  }

  // ── F2: Chat endpoints ──────────────────────────────────────
  if (req.method === 'GET' && req.url.startsWith('/api/chat')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(loadChat()));
  }
  if (req.method === 'POST' && req.url === '/api/chat') {
    return readBody(req).then((body) => {
      const user = currentUser(req) || body.user;
      if (!user || !['jaci', 'paulo'].includes(user)) throw new Error('user obrigatório (jaci|paulo)');
      const text = String(body.text || '').slice(0, 2000).trim();
      if (!text) throw new Error('text obrigatório');
      const msg = appendMessage(user, text);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, msg }));
    }).catch((e) => { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: e.message })); });
  }

  // ── F4: Kanban endpoints ────────────────────────────────────
  if (req.method === 'GET' && req.url.startsWith('/api/kanban')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(loadKanban()));
  }
  if (req.method === 'POST' && req.url === '/api/kanban/card') {
    return readBody(req).then((body) => {
      const user = currentUser(req) || 'system';
      const data = loadKanban();
      const card = {
        id: 'c-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
        title: String(body.title || '').slice(0, 200).trim() || 'Sem título',
        description: String(body.description || '').slice(0, 2000),
        column: body.column || data.columns[0].id,
        assignee: ['jaci', 'paulo'].includes(body.assignee) ? body.assignee : null,
        priority: ['low', 'med', 'high'].includes(body.priority) ? body.priority : 'med',
        deadline: body.deadline || null,
        createdBy: user,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      data.cards.push(card);
      saveKanban(data);
      broadcastEvent('kanban:card_new', card);
      // F5: se atribuído, gera notificação chat
      if (card.assignee && card.assignee !== user) {
        appendMessage('system', `📌 @${card.assignee} novo card de @${user}: **${card.title}**`);
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, card }));
    }).catch((e) => { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: e.message })); });
  }
  if (req.method === 'PUT' && req.url === '/api/kanban/card') {
    return readBody(req).then((body) => {
      const data = loadKanban();
      const idx = data.cards.findIndex(c => c.id === body.id);
      if (idx < 0) throw new Error('card não encontrado');
      const old = data.cards[idx];
      const updated = { ...old, ...body, id: old.id, createdAt: old.createdAt, updatedAt: new Date().toISOString() };
      data.cards[idx] = updated;
      saveKanban(data);
      broadcastEvent('kanban:card_update', updated);
      // F5: notif quando movido pra "done"
      if (old.column !== 'done' && updated.column === 'done') {
        const user = currentUser(req) || 'system';
        appendMessage('system', `✅ @${user} finalizou: **${updated.title}**`);
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, card: updated }));
    }).catch((e) => { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: e.message })); });
  }
  if (req.method === 'DELETE' && req.url === '/api/kanban/card') {
    return readBody(req).then((body) => {
      const data = loadKanban();
      data.cards = data.cards.filter(c => c.id !== body.id);
      saveKanban(data);
      broadcastEvent('kanban:card_delete', { id: body.id });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    }).catch((e) => { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: e.message })); });
  }

  if (req.method === 'POST' && req.url === '/api/publish') return handlePublish(req, res, 'publish');
  if (req.method === 'POST' && req.url === '/api/unpublish') return handlePublish(req, res, 'unpublish');
  if (req.method === 'GET' && req.url === '/api/calendar-config') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(loadCalendarConfig()));
  }
  if (req.method === 'POST' && req.url === '/api/calendar-config') {
    return readBody(req).then((body) => {
      if (!body || typeof body !== 'object' || !body.channels) throw new Error('formato inválido');
      saveCalendarConfig(body);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    }).catch((e) => { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: e.message })); });
  }
  if (req.method === 'GET' && req.url === '/api/schedule') {
    const events = buildSchedule(getState(), loadCalendarConfig(), loadScheduleOverrides());
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(events));
  }
  if (req.method === 'GET' && req.url === '/api/overrides') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(loadScheduleOverrides()));
  }
  if (req.method === 'POST' && req.url === '/api/fila/promote') {
    return readBody(req).then((body) => {
      const { channel, ep, titulo } = body;
      if (typeof channel !== 'string' || typeof ep !== 'string') throw new Error('parâmetros inválidos');
      const result = promoteFilaItem(channel, ep, titulo);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, ...result }));
      scheduleRescan();
    }).catch((e) => { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: e.message })); });
  }
  if (req.method === 'POST' && req.url === '/api/fila/add') {
    return readBody(req).then((body) => {
      const { channel, titulo, thumb } = body;
      if (typeof channel !== 'string' || !channel || typeof titulo !== 'string' || !titulo.trim()) throw new Error('parâmetros inválidos');
      const ep = addFilaEntry(channel, titulo.trim(), (thumb || '').trim());
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, ep }));
      scheduleRescan();
    }).catch((e) => { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: e.message })); });
  }
  if (req.method === 'POST' && req.url === '/api/fila/delete') {
    return readBody(req).then((body) => {
      const { channel, ep } = body;
      if (typeof channel !== 'string' || typeof ep !== 'string') throw new Error('parâmetros inválidos');
      removeFilaEntry(channel, ep);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      scheduleRescan();
    }).catch((e) => { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: e.message })); });
  }
  if (req.method === 'POST' && req.url === '/api/fila/update') {
    return readBody(req).then((body) => {
      const { channel, ep } = body;
      if (typeof channel !== 'string' || typeof ep !== 'string') throw new Error('parâmetros inválidos');
      const patch = {};
      if (typeof body.titulo === 'string') patch.titulo = body.titulo;
      if (typeof body.thumb === 'string') patch.thumb = body.thumb;
      updateFilaEntry(channel, ep, patch);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      scheduleRescan();
    }).catch((e) => { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: e.message })); });
  }
  if (req.method === 'GET' && req.url === '/api/pipeline/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(pipeline.getStatus()));
  }
  if (req.method === 'POST' && req.url === '/api/pipeline/run') {
    return readBody(req).then((body) => {
      const { channel, ep, titulo, stopAfterPhase } = body;
      if (typeof channel !== 'string' || typeof ep !== 'string') throw new Error('parâmetros inválidos');
      const id = pipeline.enqueue(channel, ep, titulo, { stopAfterPhase: stopAfterPhase || null });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, id }));
    }).catch((e) => { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: e.message })); });
  }
  if (req.method === 'POST' && req.url === '/api/pipeline/run-fila-batch') {
    return readBody(req).then((body) => {
      const stopAfterPhase = body.stopAfterPhase || 3;
      const items = Array.isArray(body.items) ? body.items : null;
      const targets = items || [];
      if (!items) {
        const state = getState(true);
        for (const c of state) for (const q of c.queued) targets.push({ channel: c.channel, ep: q.ep, titulo: q.titulo });
        for (const c of state) for (const e of c.eps) {
          if (e.phase < stopAfterPhase && e.phase >= 0 && !targets.find(t => t.channel===c.channel && t.ep===e.ep)) {
            targets.push({ channel: c.channel, ep: e.ep, titulo: e.titulo });
          }
        }
      }
      // Promove tudo (cria pastas) — depois enfileira no modo pipelined
      for (const t of targets) {
        try { promoteFilaItem(t.channel, t.ep, t.titulo || ''); } catch {}
      }
      const enqueued = pipeline.enqueuePipelined(targets, stopAfterPhase);
      scheduleRescan();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, enqueued: enqueued.length, jobs: enqueued, mode: 'pipelined' }));
    }).catch((e) => { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: e.message })); });
  }
  if (req.method === 'POST' && req.url === '/api/pipeline/cancel-pipelined') {
    return readBody(req).then((body) => {
      const ok = pipeline.cancelPipelined(body.id);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok }));
    }).catch((e) => { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: e.message })); });
  }
  if (req.method === 'POST' && req.url === '/api/pipeline/cancel') {
    return readBody(req).then((body) => {
      const { id } = body;
      if (typeof id !== 'string') throw new Error('id inválido');
      const ok = pipeline.cancel(id);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok }));
    }).catch((e) => { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: e.message })); });
  }
  if (req.method === 'POST' && req.url === '/api/agendar') {
    return readBody(req).then((body) => {
      const { channel, ep, date } = body;
      if (typeof channel !== 'string' || typeof ep !== 'string') throw new Error('parâmetros inválidos');
      if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('data inválida');
      saveScheduleOverride(channel, ep, date || null);

      // Se data foi setada: marcar como publicado — move pasta do EP para Publicado/
      let publishedNow = false;
      if (date) {
        const channelDir = path.join(CANAIS_DIR, channel);
        const pubDir = path.join(channelDir, PUBLICADO_DIR_NAME);
        // procurar pasta do EP fora de Publicado/
        let srcFolder = null;
        try {
          for (const entry of fs.readdirSync(channelDir)) {
            if (PUBLICADO_DIRS.includes(entry)) continue;
            const m = entry.match(/^(\d{2,3})\s*-\s*/);
            if (m && m[1].padStart(2, '0') === ep) {
              const full = path.join(channelDir, entry);
              if (fs.statSync(full).isDirectory()) { srcFolder = entry; break; }
            }
          }
        } catch {}
        if (srcFolder) {
          fs.mkdirSync(pubDir, { recursive: true });
          const dst = path.join(pubDir, srcFolder);
          if (!fs.existsSync(dst)) {
            fs.renameSync(path.join(channelDir, srcFolder), dst);
            // gravar data de publicação
            try {
              const metaPath = path.join(dst, 'youtube-metadata.json');
              let meta = {};
              if (fs.existsSync(metaPath)) { try { meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')); } catch {} }
              meta.published_at = date;
              fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
            } catch {}
            publishedNow = true;
          }
        }
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, publishedNow }));
      scheduleRescan();
    }).catch((e) => { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: e.message })); });
  }
  if (urlObj.pathname === '/' || urlObj.pathname === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(HTML);
  } else if (req.url === '/api/state') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(getState()));
  } else if (req.url === '/api/flow-accounts') {
    try {
      const { statusSnapshot } = require('./flow-account-manager.js');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(statusSnapshot()));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
  } else if (req.method === 'POST' && req.url === '/api/flow-accounts/reset') {
    readBody(req).then((body) => {
      const { release } = require('./flow-account-manager.js');
      const r = release(body.id, { reason: 'manual_reset' });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, state: r }));
    }).catch((e) => { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: e.message })); });
    return;
  } else if (urlObj.pathname === '/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'X-Accel-Buffering': 'no',
    });
    sseClients.add(res);
    res.write(`retry: 3000\n\n`);
    res.write(`data: ${JSON.stringify({ ts: Date.now(), state: getState() })}\n\n`);
    // Heartbeat a cada 25s pra manter conexão viva
    const hb = setInterval(() => {
      try { res.write(`: ping\n\n`); } catch { clearInterval(hb); }
    }, 25000);
    req.on('close', () => { clearInterval(hb); sseClients.delete(res); });
    return;
  } else {
    res.writeHead(404);
    res.end('not found');
  }
});

try { writeObsidianDocs(getState(true)); } catch (e) { console.error('initial obsidian write:', e.message); }

server.listen(PORT, HOST, () => {
  const os = require('os');
  const ifaces = os.networkInterfaces();
  let lan = 'localhost';
  for (const name of Object.keys(ifaces)) {
    for (const a of ifaces[name]) {
      if (a.family === 'IPv4' && !a.internal) { lan = a.address; break; }
    }
  }
  console.log(`\n🎛️  LoopX Dashboard rodando`);
  console.log(`   Local:  http://localhost:${PORT}`);
  console.log(`   LAN:    http://${lan}:${PORT}\n`);
});
