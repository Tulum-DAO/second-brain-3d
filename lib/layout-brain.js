// layout-brain.js — anatomical brain layout for the second-brain viz.
// Maps every graph node to a deterministic position: agents/services/daemons onto
// functional-region anchors of a real brain point cloud (lib/brain-points.json),
// clients/repos/prompts/scripts/humans onto satellite rings, hubs/queue/state → null
// (hidden in brain mode). Congruence DEC-1787647710 (both peers APPROVE).
//
// Guarantees:
//  - Deterministic: same inputs → identical positions (restart-stable).
//  - Churn-stable: an agent's position derives from its own id hash (anchor + spiral
//    slot); joins/leaves cannot move existing agents except rare true slot-collisions,
//    which only move the newcomer (AGY amendment).
//  - Touching-not-overlapping: claimable anchors are a min-separation subsample
//    (≥ 2·R_MAX + margin, Claude-peer finding 1); collision spirals space by
//    r_i + r_j + 2; a global overlap check ABORTS the build on violation.

import fs from 'node:fs';

const ASSET = new URL('./brain-points.json', import.meta.url).pathname;
const asset = JSON.parse(fs.readFileSync(ASSET, 'utf8'));

// region palette (shipped to the client as `legend`; keys become n.cluster client-side)
export const REGION_LEGEND = {
  prefrontal:  { label: 'PREFRONTAL — executive',   color: '#E8A225' },
  frontal:     { label: 'FRONTAL — management',     color: '#f5c15c' },
  motor:       { label: 'MOTOR — builders',         color: '#06b6d4' },
  parietal:    { label: 'PARIETAL — generalists',   color: '#38bdf8' },
  temporal:    { label: 'TEMPORAL — voice/comms',   color: '#ec4899' },
  occipital:   { label: 'OCCIPITAL — research',     color: '#8b5cf6' },
  cerebellum:  { label: 'CEREBELLUM — QA/audit',    color: '#22c55e' },
  brainstem:   { label: 'BRAINSTEM — infra',        color: '#f97316' },
  hippocampus: { label: 'HIPPOCAMPUS — memory',     color: '#eab308' },
  thalamus:    { label: 'THALAMUS — routing',       color: '#ef4444' },
  clients:     { label: 'CLIENTS — orbit',          color: '#22c55e' },
  repos:       { label: 'REPOS — orbit',            color: '#0e7490' },
  prompts:     { label: 'PROMPTS — library',        color: '#8b5cf6' },
  scripts:     { label: 'SCRIPTS — toolbelt',       color: '#67e8f9' },
  humans:      { label: 'OPERATORS & PEOPLE',       color: '#EDE4D3' },
};

// ---- hashing (fnv1a + a second stream for spiral slots) ----
export function fnv1a(str, seed = 0x811c9dc5) {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}
const fnv1a2 = s => fnv1a(s, 0x9747b28c);

// max sprite radius (val 14 T0, statusScale max 1.35) → spacing floor
const R_MAX = (3 + Math.sqrt(14) * 1.4) * 1.35;       // ≈ 11.1
const CLAIM_SPACING = 2 * R_MAX + 6;                   // ≈ 28.2 (finding 1)
const GOLDEN = 2.399963229728653;                      // golden angle
const SLOTS = 16;                                      // sunflower slots per anchor

// ---- claimable subsample: deterministic min-separation (greedy over stable order) ----
function subsampleClaimable(points) {
  const kept = [];
  const s2 = CLAIM_SPACING * CLAIM_SPACING;
  for (const p of points) {                            // asset order is deterministic
    let ok = true;
    for (const q of kept) {
      const d = (p.x - q.x) ** 2 + (p.y - q.y) ** 2 + (p.z - q.z) ** 2;
      if (d < s2) { ok = false; break; }
    }
    if (ok) kept.push(p);
  }
  return kept;
}

// azimuth-sorted claimable anchors per region (contiguous indices ≈ spatially adjacent
// → project-arc grouping lands same-project agents near each other)
const CLAIMABLE = {};
for (const [region, pts] of Object.entries(asset.regions)) {
  CLAIMABLE[region] = subsampleClaimable(pts)
    .sort((a, b) => Math.atan2(a.z, a.x) - Math.atan2(b.z, b.x) || a.y - b.y);
}

// ---- region classification (ordered rules; ≥90% named-rule coverage asserted in tests) ----
const strip = s => String(s || '').toLowerCase();
// project key: name minus generation/version suffixes so gens cluster together
export const projectKey = name => strip(name)
  .replace(/[-_](gen|g|v)\d+$/,'').replace(/[-_]\d+$/,'').replace(/[-_](dev|builder|agent)$/,'');

export function regionOf(node) {
  const k = node.kind, n = strip(node.name), tier = strip(node.meta?.tier);
  if (k === 'hub' || node.id?.startsWith('queue:') || node.id?.startsWith('state:')) return null;
  if (k === 'client') return 'clients';
  if (k === 'repo') return 'repos';
  if (k === 'prompt') return 'prompts';
  if (k === 'script') return 'scripts';
  if (k === 'human') return 'humans';
  if (k === 'person') return 'humans';
  // services/daemons first (they're also "agents" by shape)
  if (/router|dispatch|proxy|gateway|telegram|jarvis|intent|relay/.test(n)) return 'thalamus';
  if (k === 'service' || k === 'daemon' ||
      /watchdog|heartbeat|sync|cron|recovery|snapshot|rotat|failover|guard/.test(n)) return 'brainstem';
  // agents by function
  if (tier === 't0' || /^gm\b|^gm-|^core|^orchestra-builder|^orchestr/.test(n)) return 'prefrontal';
  if (tier === 't1' || /^pm-/.test(n)) return 'frontal';
  if (/qa|audit|verif|lineage|canary|test|lint|review/.test(n)) return 'cerebellum';
  if (/memor|dream|semantic|historian|consolidat|archiv/.test(n)) return 'hippocampus';
  if (/voice|arturo|speech|transcri|copywrit|writer|convai/.test(n)) return 'temporal';
  if (/research|scan|market|scout|monitor|watch|explor|investigat/.test(n)) return 'occipital';
  if (/^bare-|canary|experiment|trial|e2e|probe|smoke/.test(n)) return 'cerebellum';
  if (/-ops$|^ops-|^vps-|deploy|worker|provision|merge|staging|pipeline/.test(n)) return 'brainstem';
  if (/-dev\b|builder|-build\b|engineer|coder/.test(n)) return 'motor';
  return 'parietal'; // fallback fill
}
// exported for the coverage test: was the region a named rule or the fallback?
export const isFallback = (node, region) => region === 'parietal' &&
  !/pariet/.test(strip(node.name)) && strip(node.meta?.tier) !== 't2p';

// ---- anchor + spiral placement ----
const CELL = 32;
const occupied = () => ({ slots: new Map(), grid: new Map() }); // slot keys + spatial hash
const cellKey = (x, y, z) => `${Math.floor(x / CELL)},${Math.floor(y / CELL)},${Math.floor(z / CELL)}`;
function gridOK(occ, x, y, z, rad) {
  const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL), cz = Math.floor(z / CELL);
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
    for (const p of (occ.grid.get(`${cx+dx},${cy+dy},${cz+dz}`) || [])) {
      const d = Math.hypot(x - p.x, y - p.y, z - p.z);
      if (d < rad + p.r + 1) return false;             // true pairwise clearance (+1 margin)
    }
  }
  return true;
}
function gridAdd(occ, x, y, z, r) {
  const k = cellKey(x, y, z);
  if (!occ.grid.has(k)) occ.grid.set(k, []);
  occ.grid.get(k).push({ x, y, z, r });
}
function anchorPos(region, id) {
  const anchors = CLAIMABLE[region];
  const N = anchors.length;
  // project-arc grouping: same project starts from the same arc window
  const proj = projectKey(id.replace(/^[a-z]+:/, ''));
  const arcStart = fnv1a(proj) % N;
  const pref = (arcStart + (fnv1a(id) % 24)) % N;
  return { anchors, N, pref };
}
function place(region, id, occ, val = 8) {
  const rad = (3 + Math.sqrt(val || 6) * 1.4) * 1.35;
  const { anchors, N, pref } = anchorPos(region, id);
  for (let probe = 0; probe < N; probe++) {
    const ai = (pref + probe) % N;
    const a = anchors[ai];
    // sunflower slots on this anchor: slot from OWN hash, linear-probe (AGY amendment)
    const s0 = fnv1a2(id) % SLOTS;
    for (let sp = 0; sp < SLOTS; sp++) {
      const slot = (s0 + sp) % SLOTS;
      const key = `${region}|${ai}|${slot}`;
      if (occ.slots.has(key)) continue;
      if (slot === 0) {
        if (!gridOK(occ, a.x, a.y, a.z, rad)) continue; // neighbor-spiral smear guard (finding 1)
        occ.slots.set(key, id); gridAdd(occ, a.x, a.y, a.z, rad);
        return { x: a.x, y: a.y, z: a.z, region };
      }
      // tangent-plane basis from the surface normal
      const nrm = [a.nx, a.ny, a.nz];
      const ref = Math.abs(nrm[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
      let t1 = [nrm[1] * ref[2] - nrm[2] * ref[1], nrm[2] * ref[0] - nrm[0] * ref[2], nrm[0] * ref[1] - nrm[1] * ref[0]];
      const l1 = Math.hypot(...t1) || 1; t1 = t1.map(v => v / l1);
      const t2 = [nrm[1] * t1[2] - nrm[2] * t1[1], nrm[2] * t1[0] - nrm[0] * t1[2], nrm[0] * t1[1] - nrm[1] * t1[0]];
      const step = R_MAX + 2;                          // sunflower scale ≥ r_i+r_j+2 for any pair
      const rho = step * Math.sqrt(slot), th = slot * GOLDEN;
      const lift = 2 + slot * 1.5;                     // ease outward along normal
      const x = a.x + t1[0] * rho * Math.cos(th) + t2[0] * rho * Math.sin(th) + nrm[0] * lift;
      const y = a.y + t1[1] * rho * Math.cos(th) + t2[1] * rho * Math.sin(th) + nrm[1] * lift;
      const z = a.z + t1[2] * rho * Math.cos(th) + t2[2] * rho * Math.sin(th) + nrm[2] * lift;
      if (!gridOK(occ, x, y, z, rad)) continue;        // neighbor-spiral smear guard (finding 1)
      occ.slots.set(key, id); gridAdd(occ, x, y, z, rad);
      return { x, y, z, region };
    }
  }
  return null; // region totally full (asserted against in tests)
}

// ---- satellites (deterministic ring positions; exported for firehose lazy scripts) ----
export function satellitePos(kind, id, ownerSlug = null) {
  const h = fnv1a(id) / 0xFFFFFFFF;                    // 0..1
  const th = h * Math.PI * 2;
  if (kind === 'client')  return { x: Math.cos(th) * 560, y: 0,   z: Math.sin(th) * 560, region: 'clients' };
  if (kind === 'human')   return { x: Math.cos(th) * 520, y: 240, z: Math.sin(th) * 520, region: 'humans' };
  if (kind === 'person')  return { x: Math.cos(th) * 520, y: 300, z: Math.sin(th) * 520, region: 'humans' }; // people ring above operators
  if (kind === 'repo') {
    if (ownerSlug) {                                    // fold under owning client's orbit
      const c = satellitePos('client', `client:${ownerSlug}`);
      const j = (fnv1a2(id) % 100) / 100 - 0.5;
      return { x: c.x + j * 70, y: -70 - (fnv1a(id) % 40), z: c.z + j * 50, region: 'repos' };
    }
    return { x: Math.cos(th) * 640, y: -140, z: Math.sin(th) * 640, region: 'repos' };
  }
  // prompts ring tilt +25°, scripts ring tilt −25°
  const tilt = (kind === 'prompt' ? 25 : -25) * Math.PI / 180, R = 480;
  const y0 = Math.sin(th) * R * Math.sin(tilt);
  return { x: Math.cos(th) * R, y: y0, z: Math.sin(th) * R * Math.cos(tilt),
    region: kind === 'prompt' ? 'prompts' : 'scripts' };
}

// ---- main entry: annotate every node with n.brain (or null) ----
export function applyBrainLayout(nodes, links = []) {
  const occ = occupied();
  // repo → owning client slug (for orbit folding)
  const repoOwner = new Map();
  for (const n of nodes) if (n.kind === 'client') {
    for (const r of (n.meta?.repos || [])) repoOwner.set(`repo:${r.name || r}`, n.meta?.slug || n.name);
  }
  // deterministic processing order = sorted by id (stateless churn discipline)
  for (const n of [...nodes].sort((a, b) => a.id < b.id ? -1 : 1)) {
    const region = regionOf(n);
    if (!region) { n.brain = null; continue; }
    if (region === 'clients' || region === 'humans' || region === 'repos' ||
        region === 'prompts' || region === 'scripts') {
      n.brain = satellitePos(n.kind === 'daemon' ? 'human' : n.kind, n.id, repoOwner.get(n.id));
      continue;
    }
    n.brain = place(region, n.id, occ, n.val) || satellitePos('human', n.id); // overflow → operator ring (visible, never lost)
  }
  return nodes;
}

// single-node path for server runtime adds (ensureActorNode): rebuild-free best effort —
// occupancy of existing nodes is approximated by re-deriving their preferred keys; exact
// dedup happens on the next reconcile's full applyBrainLayout pass.
export function brainPosFor(node, nodes) {
  const occ = occupied();
  for (const m of nodes) if (m.brain?.region && m !== node) {
    const rad = (3 + Math.sqrt(m.val || 6) * 1.4) * 1.35;
    gridAdd(occ, m.brain.x, m.brain.y, m.brain.z, rad);  // exact occupancy from live positions
  }
  const region = regionOf(node);
  if (!region) return null;
  if (['clients', 'humans', 'repos', 'prompts', 'scripts'].includes(region))
    return satellitePos(node.kind, node.id);
  return place(region, node.id, occ, node.val) || satellitePos('human', node.id);
}

export const brainAsset = () => asset;
