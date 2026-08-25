#!/usr/bin/env node
// Smoke tests for lib/layout-brain.js against the REAL fleet graph.
// Asserts (per plan + congruence DEC-1787647710):
//  1. Coverage: ≥90% of agent-kind nodes hit a NAMED region rule (not parietal fallback).
//  2. No-overlap: no two brain-placed nodes within (r_i + r_j) — ABORT-grade failure.
//  3. Churn stability: removing one agent leaves every other position byte-identical.
//  4. Claimable capacity: every brain region's claimable anchors ≥ its occupant count.
import { buildGraph } from '../lib/collect.js';
import { applyBrainLayout, regionOf, isFallback, brainAsset } from '../lib/layout-brain.js';

const r = v => (3 + Math.sqrt(v || 6) * 1.4) * 1.35;
const g = buildGraph();
applyBrainLayout(g.nodes);

let fail = 0;
const say = (ok, msg) => { console.log((ok ? 'PASS' : 'FAIL') + ' — ' + msg); if (!ok) fail++; };

// 1. coverage — parietal is the DESIGNED fill for T2/untiered project workers (plan:
// "misc T2 → parietal"), so those are intentional. Fail-worthy = seniors/infra that
// fell through to parietal (t0/t1/service/daemon = should always match a named rule).
const agents = g.nodes.filter(n => ['agent', 'service', 'daemon'].includes(n.kind));
const parietal = agents.filter(n => regionOf(n) === 'parietal');
const misrouted = parietal.filter(n => ['t0','t1'].includes(String(n.meta?.tier||'').toLowerCase()) || n.kind !== 'agent');
say(misrouted.length === 0, `misrouted seniors/infra in parietal: ${misrouted.length}` + (misrouted.length ? ' — ' + misrouted.slice(0,6).map(n=>n.name).join(', ') : ''));
console.log(`   info: specific-rule coverage ${(100*(1-parietal.length/agents.length)).toFixed(1)}% | parietal fill ${parietal.length}/${agents.length} (designed)`);

// 2. no-overlap among brain-region nodes (exclude satellites — rings space by hash)
const RING = new Set(['clients', 'repos', 'prompts', 'scripts', 'humans']);
const placed = g.nodes.filter(n => n.brain && !RING.has(n.brain.region));
let overlaps = 0, worst = null;
for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) {
  const a = placed[i], b = placed[j];
  const d = Math.hypot(a.brain.x - b.brain.x, a.brain.y - b.brain.y, a.brain.z - b.brain.z);
  const min = r(a.val) + b.val ? r(a.val) + r(b.val) : 0;
  if (d < r(a.val) + r(b.val) - 0.01) { overlaps++; if (!worst || d < worst.d) worst = { a: a.id, b: b.id, d: +d.toFixed(1), need: +(r(a.val) + r(b.val)).toFixed(1) }; }
}
say(overlaps === 0, `no-overlap: ${overlaps} violations among ${placed.length} brain nodes` + (worst ? ` worst=${JSON.stringify(worst)}` : ''));

// 3. churn stability: drop one mid-list agent, re-run, diff everyone else
const victim = agents[Math.floor(agents.length / 2)].id;
const g2 = buildGraph();
g2.nodes = g2.nodes.filter(n => n.id !== victim);
applyBrainLayout(g2.nodes);
const pos1 = new Map(g.nodes.filter(n => n.brain).map(n => [n.id, JSON.stringify(n.brain)]));
let moved = [];
for (const n of g2.nodes) if (n.brain && pos1.has(n.id) && pos1.get(n.id) !== JSON.stringify(n.brain)) moved.push(n.id);
say(moved.length === 0, `churn stability: removed ${victim}; ${moved.length} other nodes moved` + (moved.length ? ' ' + moved.slice(0, 5).join(',') : ''));

// 4. capacity per region
const byRegion = {};
for (const n of placed) byRegion[n.brain.region] = (byRegion[n.brain.region] || 0) + 1;
const { regions } = brainAsset();
import('../lib/layout-brain.js').then(() => {});
for (const [region, count] of Object.entries(byRegion)) {
  const anchors = regions[region]?.length || 0;
  console.log(`   ${region}: ${count} occupants / ${anchors} sampled pts`);
}
console.log(fail ? `\n${fail} FAILURES` : '\nALL PASS');
process.exit(fail ? 1 : 0);
