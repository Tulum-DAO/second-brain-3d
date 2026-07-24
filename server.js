// second-brain server — standalone, isolated. Holds live graph, serves 3D client + WS.
// A crash here must NEVER touch ops. No writes to shared state; read-only watchers.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import chokidar from 'chokidar';
import { buildGraph, liveSessions, resolveActorId, normActor, db, AO, REPOS } from './lib/collect.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 7373;
const PUBLIC = path.join(__dirname, 'public');

// ---- live graph model in memory ----
let graph = buildGraph();
graph.index = new Map(graph.nodes.map(n => [n.id, n]));
console.log(`[brain] initial graph: ${graph.nodes.length} nodes, ${graph.links.length} links`, graph.stats);

// ---- static + json http server ----
const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css',
  '.json':'application/json', '.svg':'image/svg+xml', '.ico':'image/x-icon' };

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/api/graph') {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify({ nodes: graph.nodes, links: graph.links, stats: graph.stats }));
    return;
  }
  if (url === '/healthz') { res.writeHead(200); res.end('ok'); return; }
  let file = url === '/' ? '/index.html' : url;
  const fp = path.join(PUBLIC, path.normalize(file).replace(/^(\.\.[/\\])+/, ''));
  fs.readFile(fp, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, {
      'content-type': MIME[path.extname(fp)] || 'application/octet-stream',
      'cache-control': 'no-store, must-revalidate',
    });
    res.end(data);
  });
});

// ---- WebSocket broadcast ----
const wss = new WebSocketServer({ server });
wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ type: 'init', graph: { nodes: graph.nodes, links: graph.links, stats: graph.stats } }));
});
function broadcast(msg) {
  const s = JSON.stringify(msg);
  for (const c of wss.clients) if (c.readyState === 1) { try { c.send(s); } catch {} }
}

// ---- delta helpers (mutate model + broadcast) ----
function flash(id, kind) { if (graph.index.has(id)) broadcast({ type: 'node.flash', id, kind }); }
function updateNode(id, patch) {
  const n = graph.index.get(id); if (!n) return;
  Object.assign(n, patch);
  broadcast({ type: 'node.update', id, patch });
}
function pulse(source, target, kind = 'message') {
  broadcast({ type: 'link.pulse', source, target, kind });
}

// ================= WATCHERS =================

// 1) tmux liveness poll every 2s
let prevLive = liveSessions();
setInterval(() => {
  let cur;
  try { cur = liveSessions(); } catch { return; }
  // newly appeared
  for (const s of cur) if (!prevLive.has(s)) {
    for (const pfx of ['agent:', 'service:']) {
      const id = pfx + s;
      if (graph.index.has(id)) { updateNode(id, { status: 'live' }); flash(id, 'spawn'); }
    }
  }
  // disappeared
  for (const s of prevLive) if (!cur.has(s)) {
    for (const pfx of ['agent:', 'service:']) {
      const id = pfx + s;
      if (graph.index.has(id)) updateNode(id, { status: pfx === 'service:' ? 'down' : 'ember' });
    }
  }
  prevLive = cur;
}, 2000);

// 2) inter-agent messages -> live pulses, polled from the canonical DB (state/tasks.db).
//    This is the REAL message bus; the old queue/bridged dir is legacy/stale.
let lastMsgSeen = null; // ISO created_at high-water mark
function initMsgCursor() {
  const d = db(); if (!d) return;
  try { lastMsgSeen = d.prepare(`SELECT max(created_at) m FROM messages`).get().m || null; } catch {}
}
initMsgCursor();
function ensureActorNode(name) {
  const id = resolveActorId(name, graph);
  if (id) return id;
  const norm = normActor(name);
  if (!norm || norm === 'unknown') return null;
  const opId = `ops:${norm}`;
  if (graph.index.has(opId)) return opId;
  const human = /^shaw|qa-user/.test(norm);
  const node = { id: opId, cluster: 'ops', kind: human ? 'human' : 'daemon', name: norm,
    val: human ? 12 : 8, status: 'live',
    meta: { role: human ? 'human operator' : 'orchestration daemon', discovered: 'live' } };
  graph.nodes.push(node); graph.index.set(opId, node);
  broadcast({ type: 'node.add', node });
  return opId;
}
setInterval(() => {
  const d = db(); if (!d) return;
  let rows;
  try {
    rows = d.prepare(
      `SELECT id, from_agent, to_agent, type, priority, subject, created_at
         FROM messages
        WHERE created_at > ? ORDER BY created_at ASC LIMIT 100`
    ).all(lastMsgSeen || '1970-01-01');
  } catch { return; }
  for (const m of rows) {
    lastMsgSeen = m.created_at;
    const from = ensureActorNode(m.from_agent);
    const to = ensureActorNode(m.to_agent);
    if (from) flash(from, 'message');
    if (to) flash(to, 'message');
    if (from && to) pulse(from, to, m.type || 'message');
    else if (from) pulse(from, 'queue:bus', m.type || 'message');
    else if (to) pulse('queue:bus', to, m.type || 'message');
    broadcast({ type: 'ticker',
      text: `${normActor(m.from_agent)||'?'} → ${normActor(m.to_agent)||'?'} · ${m.type||'msg'}${m.subject?': '+m.subject.slice(0,48):''}` });
  }
}, 2000);

// 3) commits -> repo node flash (repos/*/.git/logs/HEAD)
chokidar.watch(path.join(REPOS, '*/.git/logs/HEAD'), { ignoreInitial: true,
  awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 } })
  .on('all', (_e, fp) => {
    const m = fp.match(/repos\/([^/]+)\/\.git/);
    if (!m) return;
    const id = `repo:${m[1]}`;
    if (graph.index.has(id)) {
      updateNode(id, { status: 'live', val: 9 });
      flash(id, 'commit');
      broadcast({ type: 'ticker', text: `commit → ${m[1]}` });
    }
  });

// 4) state changes -> rebuild agents periodically (agent-sessions / live-roster)
let rebuildTimer = null;
chokidar.watch([
  path.join(AO, 'state/agent-sessions.json'),
  path.join(AO, 'state/live-roster.json'),
  path.join(AO, 'registry.json'),
], { ignoreInitial: true })
  .on('change', () => {
    clearTimeout(rebuildTimer);
    rebuildTimer = setTimeout(reconcile, 1500);
  });

// full reconcile: rebuild graph, diff, broadcast add/remove
function reconcile() {
  let next; try { next = buildGraph(); } catch (e) { console.error('[brain] reconcile failed', e.message); return; }
  next.index = new Map(next.nodes.map(n => [n.id, n]));
  const oldIds = new Set(graph.index.keys());
  const newIds = new Set(next.index.keys());
  for (const id of newIds) if (!oldIds.has(id)) {
    const n = next.index.get(id);
    graph.nodes.push(n); graph.index.set(id, n);
    broadcast({ type: 'node.add', node: n }); flash(id, 'spawn');
  }
  for (const id of oldIds) if (!newIds.has(id)) {
    graph.index.delete(id);
    graph.nodes = graph.nodes.filter(n => n.id !== id);
    broadcast({ type: 'node.remove', id });
  }
  // status sync for survivors
  for (const id of newIds) if (oldIds.has(id)) {
    const a = graph.index.get(id), b = next.index.get(id);
    if (a.status !== b.status) updateNode(id, { status: b.status });
  }
  graph.stats = next.stats;
  console.log('[brain] reconciled:', graph.nodes.length, 'nodes');
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[brain] listening on http://0.0.0.0:${PORT}  (WS same port)`);
});

process.on('uncaughtException', (e) => console.error('[brain] uncaught', e));
process.on('unhandledRejection', (e) => console.error('[brain] unhandled', e));
