// collect.js — builds the in-memory hybrid graph from real VPS infra.
// Filesystem skeleton (repos/prompts/clients) + operational soul (agents/services/liveness).
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { applyBrainLayout } from './layout-brain.js';

export const AO = '/home/shaw/scripts/agent-orchestra';
export const REPOS = '/home/shaw/repos';
export const DB_PATH = path.join(AO, 'state', 'tasks.db');

// read-only handle to the canonical message/task DB (the operational soul).
// Self-heals on fleet DB swaps: tasks.db gets REPLACED (new inode) during repairs/rotations,
// and a cached handle then reads the deleted old file forever — the brain silently freezes at
// the swap moment (observed 2026-09-04: fd → "tasks.db (deleted)", 13h of missed events).
// Cheap inode stat at most once per 5s; reopen when it changes.
let _db = null, _dbIno = 0, _dbCheck = 0;
export function db() {
  const now = Date.now();
  if (_db && now - _dbCheck > 5000) {
    _dbCheck = now;
    try {
      const ino = fs.statSync(DB_PATH).ino;
      if (ino !== _dbIno) { try { _db.close(); } catch {} _db = null; }
    } catch { /* db momentarily missing mid-swap: keep the old handle until it reappears */ }
  }
  if (_db) return _db;
  try {
    _db = new DatabaseSync(DB_PATH, { readOnly: true });
    _dbIno = fs.statSync(DB_PATH).ino; _dbCheck = now;
    console.log('[brain] tasks.db (re)opened, inode', _dbIno);
  } catch { _db = null; }
  return _db;
}

// ---- cluster definitions (the "pillars") ----
export const CLUSTERS = {
  agents:   { label: 'AGENTS',        color: '#E8A225' }, // amber — the stars
  services: { label: 'SERVICES',      color: '#ec4899' }, // pink  — infra daemons
  repos:    { label: 'REPOS',         color: '#06b6d4' }, // cyan  — the codebase
  clients:  { label: 'CLIENTS',       color: '#22c55e' }, // green — revenue
  prompts:  { label: 'PROMPTS',       color: '#8b5cf6' }, // violet — souls
  ops:      { label: 'OPS',           color: '#f97316' }, // orange — orchestrators/humans
  queue:    { label: 'MESSAGES',      color: '#eab308' }, // yellow — the bloodstream
  state:    { label: 'STATE',         color: '#8A7F6E' }, // muted — memory
};
export const CLUSTER_ORDER = Object.keys(CLUSTERS);

// ---- shared pillar geometry (used by both the initial build AND live node adds,
// so an agent discovered at runtime lands in the SAME place buildGraph would put it) ----
export const HUB_R = 360;
export const CLUSTER_ANGLE = {}, CLUSTER_Y = {};
CLUSTER_ORDER.forEach((c, i) => {
  CLUSTER_ANGLE[c] = (i / CLUSTER_ORDER.length) * Math.PI * 2;
  CLUSTER_Y[c] = ((i % 2) ? 1 : -1) * 110 + (i % 3 - 1) * 40;
});
// hub (pinned pillar center) position for a cluster
export function hubPos(cluster) {
  const a = CLUSTER_ANGLE[cluster] || 0;
  return { x: Math.cos(a) * HUB_R, y: CLUSTER_Y[cluster] || 0, z: Math.sin(a) * HUB_R };
}
// a random member position on a small sphere around the cluster hub
export function hubSeed(cluster, spread = 70, rand = Math.random) {
  const h = hubPos(cluster);
  const u = rand() * Math.PI * 2, v = Math.acos(2 * rand() - 1), r = spread * (0.5 + rand() * 0.6);
  return {
    x: h.x + r * Math.sin(v) * Math.cos(u),
    y: h.y + r * Math.cos(v),
    z: h.z + r * Math.sin(v) * Math.sin(u),
  };
}

// message-type -> pulse color (semantics of the conversation)
export const MSG_COLORS = {
  escalate:'#ef4444', reply:'#06b6d4', route:'#E8A225', request:'#22c55e',
  broadcast:'#8b5cf6', status:'#8A7F6E', task:'#eab308', asset_registered:'#22c55e',
};

// tmux sessions that are infra services, not fleet agents
const SERVICE_SESSIONS = new Set([
  'dashboard', 'combo-proxy', 'custom-llm', 'telegram-router',
  'task-gm', 'approval-listener',
]);

function readJSON(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; }
}

// live tmux sessions -> Set of session names
export function liveSessions() {
  try {
    const out = execSync('tmux ls 2>/dev/null', { encoding: 'utf8' });
    return new Set(out.split('\n').filter(Boolean).map(l => l.split(':')[0].trim()));
  } catch { return new Set(); }
}

// ---- the full snapshot ----
export function buildGraph() {
  const nodes = [];
  const links = [];
  const seen = new Set();
  const add = (n) => { if (!seen.has(n.id)) { seen.add(n.id); nodes.push(n); } };
  const link = (source, target, extra = {}) => {
    if (seen.has(source) && seen.has(target)) links.push({ source, target, ...extra });
  };

  const live = liveSessions();

  // deterministic PRNG so the layout is identical every load (no random clump lottery)
  let _s = 0x9e3779b9;
  const rnd = () => { _s = (_s * 1664525 + 1013904223) & 0x7fffffff; return _s / 0x7fffffff; };
  // members seeded on a small sphere around their pinned hub (shared geometry, deterministic PRNG)
  const seed = (cluster, spread = 70) => hubSeed(cluster, spread, rnd);

  // ---- hub nodes (cluster centers, big + labeled), pinned to hold pillar shape ----
  for (const c of CLUSTER_ORDER) {
    const h = hubPos(c);
    add({
      id: `hub:${c}`, cluster: c, kind: 'hub', name: CLUSTERS[c].label,
      val: 40, status: 'hub',
      fx: h.x, fy: h.y, fz: h.z,
      meta: { desc: `${CLUSTERS[c].label} pillar` },
    });
  }

  // ---- AGENTS (registry + liveness) ----
  const registry = readJSON(path.join(AO, 'registry.json'), { agents: {} });
  const roster = readJSON(path.join(AO, 'state/live-roster.json'), {});
  const agentByRepo = new Map(); // repo path -> [agentIds]

  for (const [aid, a] of Object.entries(registry.agents || {})) {
    const sess = a.tmux_session || aid;
    const isLive = live.has(sess);
    const p = seed('agents');
    add({
      id: `agent:${aid}`, cluster: 'agents', kind: 'agent', name: aid,
      val: a.tier === 'T0' ? 14 : a.tier === 'T1' ? 10 : 7,
      status: isLive ? 'live' : 'idle',
      ...p,
      meta: {
        tier: a.tier, role: a.name, cwd: a.cwd, machine: a.machine,
        tmux: sess, system_prompt: a.system_prompt, always_on: !!a.always_on,
      },
    });
    link(`hub:agents`, `agent:${aid}`, { kind: 'member' });
    if (a.cwd && a.cwd.startsWith(REPOS)) {
      const arr = agentByRepo.get(a.cwd) || [];
      arr.push(aid); agentByRepo.set(a.cwd, arr);
    }
    if (a.system_prompt) {
      const pid = `prompt:${path.basename(a.system_prompt)}`;
      a.__prompt = pid;
    }
  }

  // live tmux sessions that aren't registry agents & aren't services -> ad-hoc live agents
  for (const sess of live) {
    if (SERVICE_SESSIONS.has(sess)) continue;
    if (seen.has(`agent:${sess}`)) continue;
    const p = seed('agents');
    add({
      id: `agent:${sess}`, cluster: 'agents', kind: 'agent', name: sess,
      val: 8, status: 'live', ...p,
      meta: { role: 'live tmux session', tmux: sess, adhoc: true,
        cwd: roster[sess]?.cwd },
    });
    link(`hub:agents`, `agent:${sess}`, { kind: 'member' });
    if (roster[sess]?.cwd?.startsWith(REPOS)) {
      const arr = agentByRepo.get(roster[sess].cwd) || [];
      arr.push(sess); agentByRepo.set(roster[sess].cwd, arr);
    }
  }

  // ---- SERVICES (infra daemons) ----
  for (const sess of SERVICE_SESSIONS) {
    const p = seed('services');
    add({
      id: `service:${sess}`, cluster: 'services', kind: 'service', name: sess,
      val: 12, status: live.has(sess) ? 'live' : 'down', ...p,
      meta: { role: 'infra service', tmux: sess },
    });
    link(`hub:services`, `service:${sess}`, { kind: 'member' });
  }

  // ---- REPOS (~/repos/*) ----
  let repoDirs = [];
  try {
    repoDirs = fs.readdirSync(REPOS, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);
  } catch {}
  const now = Date.now();
  for (const name of repoDirs) {
    const full = path.join(REPOS, name);
    const gitHead = path.join(full, '.git', 'logs', 'HEAD');
    let recency = 0, hasGit = false;
    try { const st = fs.statSync(gitHead); hasGit = true; recency = st.mtimeMs; } catch {}
    const ageDays = recency ? (now - recency) / 86400000 : 999;
    const p = seed('repos', 60);
    add({
      id: `repo:${name}`, cluster: 'repos', kind: 'repo', name,
      val: ageDays < 2 ? 9 : ageDays < 14 ? 6 : 4,
      status: ageDays < 2 ? 'live' : ageDays < 30 ? 'idle' : 'cold',
      ...p,
      meta: { path: full, hasGit, lastCommitDaysAgo: recency ? Math.round(ageDays) : null },
    });
    link(`hub:repos`, `repo:${name}`, { kind: 'member' });
    // agent -> its cwd repo
    const agents = agentByRepo.get(full) || [];
    for (const aid of agents) link(`agent:${aid}`, `repo:${name}`, { kind: 'works_on', cross: true });
  }

  // ---- CLIENTS ----
  let clientDirs = [];
  try {
    clientDirs = fs.readdirSync(path.join(AO, 'state/clients'), { withFileTypes: true })
      .filter(d => d.isDirectory()).map(d => d.name);
  } catch {}
  for (const slug of clientDirs) {
    const cj = readJSON(path.join(AO, 'state/clients', slug, 'client.json'), null);
    if (!cj) continue;
    const urls = (cj.deployed_urls || []).length;
    const p = seed('clients', 45);
    add({
      id: `client:${slug}`, cluster: 'clients', kind: 'client', name: slug,
      val: Math.min(6 + urls, 18),
      status: urls > 0 ? 'live' : 'idle', ...p,
      meta: { slug, deployed_urls: cj.deployed_urls || [], urlCount: urls,
        repos: cj.repos || [], netlify: cj.netlify_sites || [] },
    });
    link(`hub:clients`, `client:${slug}`, { kind: 'member' });
  }

  // ---- PROMPTS ----
  let promptFiles = [];
  try {
    promptFiles = fs.readdirSync(path.join(AO, 'prompts'))
      .filter(f => f.endsWith('.md'));
  } catch {}
  for (const f of promptFiles) {
    const p = seed('prompts', 40);
    add({
      id: `prompt:${f}`, cluster: 'prompts', kind: 'prompt', name: f.replace(/\.md$/, ''),
      val: 5, status: 'idle', ...p,
      meta: { path: path.join(AO, 'prompts', f) },
    });
    link(`hub:prompts`, `prompt:${f}`, { kind: 'member' });
  }
  // agent -> its prompt
  for (const [aid, a] of Object.entries(registry.agents || {})) {
    if (a.__prompt && seen.has(a.__prompt)) link(`agent:${aid}`, a.__prompt, { kind: 'soul', cross: true });
  }

  // ---- STATE (key files) ----
  const stateFiles = ['registry.json', 'state/agent-sessions.json', 'state/live-roster.json'];
  for (const rel of stateFiles) {
    const p = seed('state', 25);
    add({
      id: `state:${rel}`, cluster: 'state', kind: 'state', name: path.basename(rel),
      val: 8, status: 'live', ...p,
      meta: { path: path.join(AO, rel) },
    });
    link(`hub:state`, `state:${rel}`, { kind: 'member' });
  }

  // ---- QUEUE hub (the message bus itself) ----
  add({
    id: 'queue:bus', cluster: 'queue', kind: 'queue', name: 'message bus',
    val: 14, status: 'live', ...seed('queue', 20),
    meta: { path: DB_PATH, desc: 'state/tasks.db · messages table (live)' },
  });
  link('hub:queue', 'queue:bus', { kind: 'member' });

  // ---- OPS actors: every real message participant that isn't already a node ----
  // (dispatcher, asset-registry, mac-heartbeat, shaw, approval-loop, …)
  const resolveLocal = (name) => {
    if (!name) return null;
    for (const pfx of ['agent:', 'service:']) if (seen.has(pfx + normActor(name))) return pfx + normActor(name);
    return null;
  };
  const database = db();
  let msgStats = { total: 0, last24h: 0 };
  if (database) {
    try {
      // distinct participants in the last 7d -> ensure a node exists for each
      const parts = database.prepare(
        `SELECT DISTINCT actor FROM (
           SELECT from_agent actor FROM messages WHERE created_at > datetime('now','-7 day')
           UNION SELECT to_agent FROM messages WHERE created_at > datetime('now','-7 day'))
         WHERE actor IS NOT NULL`).all();
      for (const { actor } of parts) {
        const norm = normActor(actor);
        if (!norm || norm === 'unknown') continue;
        if (resolveLocal(actor)) continue;             // already an agent/service
        const id = `ops:${norm}`;
        if (seen.has(id)) continue;
        const human = /^shaw|qa-user/.test(norm);
        // liveness from tmux, NOT hardcoded: most ops actors are dead historical
        // message participants (e.g. arkdata-merge-2/3). Only mark live if a tmux
        // session by that name is actually running right now.
        const status = live.has(norm) ? 'live' : (human ? 'idle' : 'ember');
        add({
          id, cluster: 'ops', kind: human ? 'human' : 'daemon', name: norm,
          val: human ? 12 : 8, status, ...seed('ops', 30),
          meta: { role: human ? 'human operator' : 'orchestration daemon' },
        });
        link('hub:ops', id, { kind: 'member' });
      }
      // aggregate last-7d traffic -> persistent weighted comm edges (the real topology)
      const resolveAny = (name) => resolveLocal(name) || (seen.has(`ops:${normActor(name)}`) ? `ops:${normActor(name)}` : null);
      const pairs = database.prepare(
        `SELECT from_agent f, to_agent t, count(*) w, max(created_at) last
           FROM messages
          WHERE created_at > datetime('now','-7 day') AND to_agent IS NOT NULL
          GROUP BY f, t`).all();
      const commSeen = new Set();
      for (const { f, t, w, last } of pairs) {
        const sid = resolveAny(f), tid = resolveAny(t);
        if (!sid || !tid || sid === tid) continue;
        const key = sid + '|' + tid;
        if (commSeen.has(key)) continue; commSeen.add(key);
        links.push({ source: sid, target: tid, kind: 'comm', weight: w, last, cross: true });
      }
      msgStats.total = database.prepare(`SELECT count(*) c FROM messages`).get().c;
      msgStats.last24h = database.prepare(`SELECT count(*) c FROM messages WHERE created_at > datetime('now','-1 day')`).get().c;
    } catch (e) { /* DB shape drift -> skip comm layer, keep skeleton */ }
  }

  // ---- PEOPLE (Pocket Intelligence Phase 2: person nodes only; comm edges are Phase 3) ----
  if (database) {
    try {
      const ppl = database.prepare(
        `SELECT id, name, title, relationship, context, updated_at FROM people`).all();
      for (const person of ppl) {
        const id = `person:${person.id}`;
        if (seen.has(id)) continue;
        const p = seed('ops', 35);
        add({
          id, cluster: 'ops', kind: 'person', name: person.name,
          val: 6, status: 'idle', ...p,
          meta: { title: person.title, relationship: person.relationship,
            context: person.context, updated_at: person.updated_at },
        });
        link('hub:ops', id, { kind: 'member' });
      }
    } catch (e) { /* people tables absent -> skip people layer, keep skeleton */ }
  }

  applyBrainLayout(nodes);   // anatomical positions (n.brain) — DEC-1787647710
  return { nodes, links,
    stats: { agents: nodes.filter(n=>n.kind==='agent').length,
             repos: repoDirs.length, clients: clientDirs.length,
             live: nodes.filter(n=>n.status==='live').length,
             msgs24h: msgStats.last24h, msgsTotal: msgStats.total,
             commEdges: links.filter(l=>l.kind==='comm').length } };
}

// normalize a message participant name to a node key
// (collapses "shaw · tranche A/B/C" -> "shaw", trims noise)
export function normActor(name) {
  if (!name) return null;
  let s = String(name).trim();
  s = s.replace(/\s*·.*$/, '');           // "shaw · tranche A" -> "shaw"
  return s;
}

// resolve a message participant -> an existing node id (agent | service | ops actor)
export function resolveActorId(name, graph) {
  const n = normActor(name);
  if (!n) return null;
  for (const id of [`agent:${n}`, `service:${n}`, `ops:${n}`]) if (graph.index.has(id)) return id;
  return null;
}
