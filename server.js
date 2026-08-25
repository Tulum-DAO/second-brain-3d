// second-brain server — standalone, isolated. Holds live graph, serves 3D client + WS.
// A crash here must NEVER touch ops. No writes to shared state; read-only watchers.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import chokidar from 'chokidar';
import { buildGraph, liveSessions, resolveActorId, normActor, hubSeed, db, AO, REPOS } from './lib/collect.js';
import { brainPosFor, brainAsset, REGION_LEGEND } from './lib/layout-brain.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 7373;
const PUBLIC = path.join(__dirname, 'public');
// bumps every server start + whenever index.html changes -> clients auto-reload
let VERSION = Date.now();
try { VERSION = Math.floor(fs.statSync(path.join(PUBLIC, 'index.html')).mtimeMs); } catch {}

// ---- live graph model in memory ----
let graph = buildGraph();
graph.index = new Map(graph.nodes.map(n => [n.id, n]));
console.log(`[brain] initial graph: ${graph.nodes.length} nodes, ${graph.links.length} links`, graph.stats);

// ---- lineage map: retired predecessor name -> live-head name, via the CANONICAL batch resolver ----
// (handoff discipline: attribution goes through lineage_resolve.py, never a re-implementation). Built
// async from every distinct message participant so restored Apr→Aug history attributes retired gens
// to their live successors (e.g. gm-gen21 -> gm). Refreshed on agent-sessions change; never per-fire.
const LINEAGE_CLI = path.join(AO, 'scripts/lineage_resolve.py');
let lineageMap = new Map();   // normActor(name) -> live-head name (or absent = no live head)
function refreshLineage() {
  const d = db(); if (!d) return;
  let names;
  try { names = d.prepare(`SELECT DISTINCT from_agent n FROM messages WHERE from_agent IS NOT NULL
                            UNION SELECT DISTINCT to_agent n FROM messages WHERE to_agent IS NOT NULL`).all().map(r => r.n); }
  catch { return; }
  if (!names.length) return;
  const child = execFile('python3', [LINEAGE_CLI], { maxBuffer: 8 << 20 }, (err, stdout) => {
    if (err) { console.error('[brain] lineage resolve failed', err.message); return; }
    try {
      const map = JSON.parse(stdout), next = new Map();
      for (const [name, v] of Object.entries(map)) {
        const head = v && v.session; if (head) next.set(normActor(name), head);
      }
      lineageMap = next;
      console.log(`[brain] lineage map: ${lineageMap.size} retired→live-head mappings`);
    } catch (e) { console.error('[brain] lineage parse failed', e.message); }
  });
  try { child.stdin.end(names.join('\n')); } catch {}
}
// Resolve a message participant to a current graph node id, following lineage to the live head.
function resolveHistoric(name) {
  const direct = resolveActorId(name, graph); if (direct) return direct;
  const head = lineageMap.get(normActor(name)); return head ? resolveActorId(head, graph) : null;
}
// Suppressed flows: high-volume noise Shaw doesn't want rendered (no arrow sprite, ticker, or replay).
// Currently: the lineage daemon's soft-handoff spam to codex-dev-1 (186 msgs). Matched by type+target.
const MUTED_FLOWS = [{ type: 'lineage_soft_handoff', to: 'codex-dev-1' }];
function isMutedMessage(m) {
  const to = normActor(m.to_agent);
  return MUTED_FLOWS.some(f => m.type === f.type && to === f.to);
}
refreshLineage();

// ---- static + json http server ----
const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css',
  '.json':'application/json', '.svg':'image/svg+xml', '.ico':'image/x-icon' };

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/api/graph') {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify({ nodes: graph.nodes, links: graph.links, stats: graph.stats, legend: REGION_LEGEND }));
    return;
  }
  // timeline for the scrubber: every message in the last N hours, resolved to node ids
  if (url === '/api/brain-points') {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'max-age=3600' });
    res.end(JSON.stringify(brainAsset()));
    return;
  }
  // agent spawn / first-appearance events for the scrubber. Read-only over agent-sessions.json;
  // per agent, appearance ts = spawned_at|created_at|launched_at, else its transcript's birthtime.
  if (url === '/api/spawns') {
    const q = new URLSearchParams(req.url.split('?')[1] || '');
    const hours = Math.min(Math.max(parseInt(q.get('hours') || '720', 10), 1), 8760);
    const cutoff = Date.now() - hours * 3600 * 1000;
    let events = [];
    try {
      const sess = JSON.parse(fs.readFileSync(path.join(AO, 'state/agent-sessions.json'), 'utf8'));
      const seen = new Set();
      for (const [name, e] of Object.entries(sess)) {
        let t = e.spawned_at || e.created_at || e.launched_at || null;
        if (!t && e.conversation_path) { try { const st = fs.statSync(e.conversation_path); t = new Date(st.birthtimeMs || st.ctimeMs).toISOString(); } catch {} }
        if (!t) continue;
        const tm = +new Date(t); if (isNaN(tm) || tm < cutoff) continue;
        const id = resolveActorId(name, graph);
        if (!id || !graph.index.has(id) || seen.has(id)) continue;
        seen.add(id);
        events.push({ t, id, name: normActor(name), kind: 'spawn' });
      }
      events.sort((a, b) => a.t < b.t ? -1 : 1);
    } catch {}
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify({ hours, count: events.length, events }));
    return;
  }
  if (url === '/api/history') {
    const q = new URLSearchParams(req.url.split('?')[1] || '');
    const hours = Math.min(Math.max(parseInt(q.get('hours') || '6', 10), 1), 8760);
    const d = db();
    let events = [];
    if (d) {
      try {
        // created_at is ISO8601 with a 'T' separator + '+00:00' offset; datetime('now',?) yields a
        // space-separated string. Raw string-compare is WRONG (the 'T' at index 10 always beats the
        // space, so every row from *today* passes any intra-day window). Normalise both via datetime().
        const rows = d.prepare(
          `SELECT id, from_agent, to_agent, type, subject, created_at
             FROM messages WHERE datetime(created_at) > datetime('now', ?) AND to_agent IS NOT NULL
             ORDER BY created_at ASC LIMIT 20000`).all(`-${hours} hour`);
        for (const m of rows) {
          if (isMutedMessage(m)) continue;   // suppressed flow — keep it off the replay timeline
          const from = resolveHistoric(m.from_agent), to = resolveHistoric(m.to_agent);
          if (!from || !to) continue;
          events.push({ t: m.created_at, from, to, type: m.type,
            fromName: normActor(m.from_agent), toName: normActor(m.to_agent),
            subject: (m.subject || '').slice(0, 80) });
        }
      } catch {}
    }
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify({ hours, count: events.length, events }));
    return;
  }
  // inspect an edge: recent messages between two actors (either direction)
  if (url === '/api/messages') {
    const q = new URLSearchParams(req.url.split('?')[1] || '');
    const a = normActor(q.get('a')), b = normActor(q.get('b'));
    const d = db();
    let msgs = [];
    if (d && a && b) {
      try {
        msgs = d.prepare(
          `SELECT from_agent, to_agent, type, subject, body, status, created_at
             FROM messages
            WHERE (from_agent=? AND to_agent=?) OR (from_agent=? AND to_agent=?)
            ORDER BY created_at DESC LIMIT 40`).all(a, b, b, a)
          .map(m => ({ from: normActor(m.from_agent), to: normActor(m.to_agent), type: m.type,
            subject: m.subject, body: (m.body || '').slice(0, 600), status: m.status, t: m.created_at }));
      } catch {}
    }
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify({ a, b, count: msgs.length, messages: msgs }));
    return;
  }
  if (url === '/healthz') { res.writeHead(200); res.end('ok'); return; }
  // Shape routes all serve the one page; the client picks its layout from the path.
  // Add a new shape here (+ ROUTE_LAYOUT in index.html) to give it its own URL. `/` → default.
  const SHAPE_ROUTES = new Set(['/field', '/brain']);
  if (url === '/') { res.writeHead(302, { location: '/field' }); res.end(); return; }
  let file = SHAPE_ROUTES.has(url) ? '/index.html' : url;
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
  ws.send(JSON.stringify({ type: 'init', version: VERSION, graph: { nodes: graph.nodes, links: graph.links, stats: graph.stats, legend: REGION_LEGEND } }));
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

// 1) tmux liveness poll every 2s — reconcile EVERY node against the live tmux set,
//    so agents, services AND ops actors (arkdata-merge-2/3 etc) reflect reality.
let currentLive = liveSessions();
// the tmux session name a node maps to (null = liveness N/A, e.g. repos/files)
function sessionOf(n) {
  if (n.kind === 'agent') return n.meta?.tmux || n.name;
  if (n.kind === 'service') return n.name;
  if (n.kind === 'daemon' || n.kind === 'human') return n.name; // ops actors
  return null;
}
setInterval(() => {
  let cur;
  try { cur = liveSessions(); } catch { return; }
  currentLive = cur;
  for (const n of graph.nodes) {
    const sess = sessionOf(n); if (!sess) continue;
    const nowLive = cur.has(sess);
    const wasLive = n.status === 'live';
    if (nowLive && !wasLive) { updateNode(n.id, { status: 'live' }); flash(n.id, 'spawn'); }
    else if (!nowLive && wasLive) { updateNode(n.id, { status: n.kind === 'service' ? 'down' : 'ember' }); }
  }
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
  const human = /^shaw|qa-user/.test(norm);
  // A newly-provisioned agent first appears here (it messages before its state file lands).
  // If it's a live tmux session it's a real AGENT -> place it IN the agents pillar, next to
  // its peers, not off in the OPS region. Only non-live, non-human names stay as ops daemons.
  const isAgent = currentLive.has(norm) && !human;
  const cluster = isAgent ? 'agents' : 'ops';
  const nid = isAgent ? `agent:${norm}` : `ops:${norm}`;
  if (graph.index.has(nid)) return nid;
  const status = currentLive.has(norm) ? 'live' : (human ? 'idle' : 'ember');
  // seed at the correct pillar hub so it renders among its cluster immediately
  const pos = hubSeed(cluster, 70);
  const node = { id: nid, cluster,
    kind: isAgent ? 'agent' : (human ? 'human' : 'daemon'), name: norm,
    val: isAgent ? 8 : (human ? 12 : 8), status, ...pos,
    meta: { role: isAgent ? 'live tmux session' : (human ? 'human operator' : 'orchestration daemon'),
      tmux: isAgent ? norm : undefined, discovered: true } };
  node.brain = brainPosFor(node, graph.nodes);   // anatomical position for runtime-discovered actors
  graph.nodes.push(node); graph.index.set(nid, node);
  // link to its pillar hub so the force layout keeps it snug in the cluster
  const hubId = `hub:${cluster}`;
  let hubLink = null;
  if (graph.index.has(hubId)) {
    hubLink = { source: hubId, target: nid, kind: 'member' };
    graph.links.push(hubLink);
  }
  broadcast({ type: 'node.add', node, link: hubLink });
  return nid;
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
    if (isMutedMessage(m)) continue;   // suppressed flow — no live pulse/ticker
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
    rebuildTimer = setTimeout(() => { reconcile(); refreshLineage(); }, 1500);   // lineage heads may have rotated
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
  // Refresh links from the fresh build. Previously graph.links was frozen at startup, so
  // when a node was removed here its comm/member edges stayed behind as DANGLING references
  // to a non-existent node — and d3-force throws on a missing link endpoint, which aborts the
  // client's entire link force (every connection vanishes). Rebuilding keeps links consistent
  // with nodes and lets new message topology appear. Guard against any residual dangling edge.
  graph.links = next.links.filter(l => next.index.has(l.source) && next.index.has(l.target));
  graph.stats = next.stats;
  console.log('[brain] reconciled:', graph.nodes.length, 'nodes,', graph.links.length, 'links');
}

// live client hot-reload: editing the client bumps VERSION + pushes reload to open tabs
chokidar.watch(path.join(PUBLIC, 'index.html'), { ignoreInitial: true })
  .on('change', () => {
    try { VERSION = Math.floor(fs.statSync(path.join(PUBLIC, 'index.html')).mtimeMs); } catch { VERSION = Date.now(); }
    broadcast({ type: 'reload' });
    console.log('[brain] client changed -> pushed reload, version', VERSION);
  });

// bind loopback only: tailscale serve proxies to localhost:7373, and this avoids
// colliding with tailscaled's own listener on the tailnet IP:7373.
server.listen(PORT, '127.0.0.1', () => {
  console.log(`[brain] listening on http://127.0.0.1:${PORT}  (WS same port)`);
});

process.on('uncaughtException', (e) => console.error('[brain] uncaught', e));
process.on('unhandledRejection', (e) => console.error('[brain] unhandled', e));
