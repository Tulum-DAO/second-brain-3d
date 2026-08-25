#!/usr/bin/env node
// build-brain-points.mjs — one-time asset builder for the anatomical brain layout.
//
// Reads BodyParts3D per-region OBJ meshes (CC BY-SA 2.1 JP — © The Database Center
// for Life Science; attribution kept in the output meta + viz footer), samples each
// region's surface area-weighted, auto-orients the cloud into viz space (front = -Z
// toward camera default, up = +Y), normalizes to half-width ≈ 340 world units, and
// writes lib/brain-points.json used by lib/layout-brain.js (server-side) and the
// client dust shell (/api/brain-points).
//
// Usage: node tools/build-brain-points.mjs <objdir> [out.json]
//   <objdir> contains FMA*.obj files extracted from partof_BP3D_4.0_obj_99.zip
//
// Deterministic: fixed-seed PRNG; same input → byte-identical output.

import fs from 'node:fs';
import path from 'node:path';

const OBJDIR = process.argv[2] || '/tmp/bp3d/obj';
const OUT = process.argv[3] || new URL('../lib/brain-points.json', import.meta.url).pathname;
const HALF_WIDTH = 340;           // target world half-width (matches HUB_R≈360 scale)

// region → { files: FMA ids, n: sample budget }
// Budgets weighted by expected agent population (motor/parietal carry ~225 T2 devs;
// anchors ≈ 2-3× occupants keeps collision clusters rare) + silhouette needs (dust).
const REGIONS = {
  prefrontal:  { files: ['FMA242625', 'FMA242627'], n: 120 },  // r/l prefrontal cortex — GM/T0
  frontal:     { files: ['FMA72969', 'FMA72970'],   n: 350 },  // r/l frontal lobe — PMs (overlap-filtered)
  motor:       { files: ['FMA72661', 'FMA72662', 'FMA72665', 'FMA72666'], n: 700 }, // pre+postcentral gyri — builders/devs
  parietal:    { files: ['FMA72973', 'FMA72974'],   n: 600 },  // r/l parietal — dev overflow/misc (overlap-filtered)
  temporal:    { files: ['FMA72971', 'FMA72972'],   n: 350 },  // r/l temporal — voice/comms
  occipital:   { files: ['FMA72975', 'FMA72976'],   n: 300 },  // r/l occipital — research/scanning
  cerebellum:  { files: ['FMA67944'],               n: 450 },  // QA/audit/verify
  brainstem:   { files: ['FMA79876'],               n: 300 },  // watchdogs/services/daemons
  hippocampus: { files: ['FMA72713', 'FMA72714'],   n: 140 },  // memory/dream/semantic
  thalamus:    { files: ['FMA62007'],               n: 120, synth: 'ellipsoid' }, // routing — synthesized if mesh absent
};
// regions whose generic lobe meshes spatially contain a more specific region;
// their samples are rejected within EPS of the specific region's samples.
const OVERLAP_FILTER = { frontal: ['prefrontal', 'motor'], parietal: ['motor'] };
const EPS = 9; // world units post-scale ≈ raw*scale; applied post-normalization

// ---- deterministic PRNG (mulberry32) ----
let _s = 0x5EEDB7A1;
const rand = () => { _s |= 0; _s = (_s + 0x6D2B79F5) | 0; let t = Math.imul(_s ^ (_s >>> 15), 1 | _s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

// ---- minimal OBJ parse → {verts:[[x,y,z]...], tris:[[i,j,k]...]} ----
function parseOBJ(file) {
  const verts = [], tris = [];
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (line.startsWith('v ')) {
      const p = line.slice(2).trim().split(/\s+/).map(Number);
      verts.push([p[0], p[1], p[2]]);
    } else if (line.startsWith('f ')) {
      // faces may be "f a b c" or "f a/.. b/.. c/.." and may be polygons → fan-triangulate
      const idx = line.slice(2).trim().split(/\s+/).map(t => parseInt(t.split('/')[0], 10) - 1);
      for (let i = 2; i < idx.length; i++) tris.push([idx[0], idx[i - 1], idx[i]]);
    }
  }
  return { verts, tris };
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = a => Math.hypot(a[0], a[1], a[2]);
const norm = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

// area-weighted surface sampling with per-point face normal
function sampleMesh(meshes, n) {
  const faces = []; let total = 0;
  for (const { verts, tris } of meshes) for (const t of tris) {
    const A = verts[t[0]], B = verts[t[1]], C = verts[t[2]];
    if (!A || !B || !C) continue;
    const nv = cross(sub(B, A), sub(C, A));
    const area = len(nv) / 2;
    if (!(area > 0)) continue;
    total += area;
    faces.push({ A, B, C, nv: norm(nv), cum: total });
  }
  const out = [];
  for (let i = 0; i < n; i++) {
    const r = rand() * total;
    // binary search cum
    let lo = 0, hi = faces.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; faces[mid].cum < r ? lo = mid + 1 : hi = mid; }
    const f = faces[lo];
    const r1 = Math.sqrt(rand()), r2 = rand();
    const w = [1 - r1, r1 * (1 - r2), r1 * r2];
    out.push({
      x: w[0] * f.A[0] + w[1] * f.B[0] + w[2] * f.C[0],
      y: w[0] * f.A[1] + w[1] * f.B[1] + w[2] * f.C[1],
      z: w[0] * f.A[2] + w[1] * f.B[2] + w[2] * f.C[2],
      nx: f.nv[0], ny: f.nv[1], nz: f.nv[2],
    });
  }
  return out;
}

// ---- FMA → element-file resolution (BodyParts3D names files FJ####.obj; the
// extractor writes fma-files.txt "FMA#### FJ####" lines alongside the objs) ----
const fmaMap = new Map();
const mapFile = path.join(OBJDIR, '..', 'fma-files.txt');
if (fs.existsSync(mapFile)) for (const line of fs.readFileSync(mapFile, 'utf8').split('\n')) {
  const [fma, fj] = line.trim().split(/\s+/);
  if (fma && fj) { if (!fmaMap.has(fma)) fmaMap.set(fma, []); fmaMap.get(fma).push(fj); }
}
const filesFor = id => (fmaMap.get(id) || [id]).map(n => path.join(OBJDIR, `${n}.obj`));

// ---- load all regions ----
const raw = {}; const missing = [];
for (const [region, cfg] of Object.entries(REGIONS)) {
  const meshes = [];
  for (const id of cfg.files) {
    const found = filesFor(id).filter(f => fs.existsSync(f));
    if (found.length) for (const f of found) meshes.push(parseOBJ(f));
    else missing.push(`${region}:${id}`);
  }
  if (meshes.length) raw[region] = sampleMesh(meshes, cfg.n);
  else if (cfg.synth === 'ellipsoid') raw[region] = null; // synthesized after orientation
  else throw new Error(`region ${region}: no meshes found (${cfg.files.join(',')})`);
}
if (missing.length) console.error('missing meshes (ok if synthesized):', missing.join(' '));

// ---- auto-orient: build basis from anatomy itself (source axes unknown) ----
// down = brainstem centroid − whole centroid; front = prefrontal centroid − whole centroid (orthogonalized)
const all = Object.values(raw).filter(Boolean).flat();
const centroid = pts => { const c = [0, 0, 0]; for (const p of pts) { c[0] += p.x; c[1] += p.y; c[2] += p.z; }
  return [c[0] / pts.length, c[1] / pts.length, c[2] / pts.length]; };
const C = centroid(all);
const down = norm(sub(centroid(raw.brainstem), C));
const up = [-down[0], -down[1], -down[2]];
let front = norm(sub(centroid(raw.prefrontal), C));
// orthogonalize front against up
const d = front[0] * up[0] + front[1] * up[1] + front[2] * up[2];
front = norm([front[0] - d * up[0], front[1] - d * up[1], front[2] - d * up[2]]);
const right = norm(cross(up, front));
// viz basis: x=right, y=up, z=front (camera starts at +z looking at origin → faces the viewer)
const reorient = p => {
  const v = [p.x - C[0], p.y - C[1], p.z - C[2]];
  const nv = [p.nx, p.ny, p.nz];
  return {
    x: v[0] * right[0] + v[1] * right[1] + v[2] * right[2],
    y: v[0] * up[0] + v[1] * up[1] + v[2] * up[2],
    z: v[0] * front[0] + v[1] * front[1] + v[2] * front[2],
    nx: nv[0] * right[0] + nv[1] * right[1] + nv[2] * right[2],
    ny: nv[0] * up[0] + nv[1] * up[1] + nv[2] * up[2],
    nz: nv[0] * front[0] + nv[1] * front[1] + nv[2] * front[2],
  };
};
for (const k of Object.keys(raw)) if (raw[k]) raw[k] = raw[k].map(reorient);

// ---- normalize scale to HALF_WIDTH on x (brain width) ----
let maxAbs = 0;
for (const p of Object.values(raw).filter(Boolean).flat()) maxAbs = Math.max(maxAbs, Math.abs(p.x));
const S = HALF_WIDTH / maxAbs;
const R = v => Math.round(v * 100) / 100;
for (const k of Object.keys(raw)) if (raw[k]) raw[k] = raw[k].map(p => ({
  x: R(p.x * S), y: R(p.y * S), z: R(p.z * S),
  nx: R(p.nx), ny: R(p.ny), nz: R(p.nz),
}));

// ---- synthesize thalamus if its mesh was absent: ellipsoid between the hippocampi ----
if (!raw.thalamus) {
  const hip = centroid(raw.hippocampus);
  const cfg = REGIONS.thalamus; const pts = [];
  for (let i = 0; i < cfg.n; i++) {
    const u = rand() * Math.PI * 2, v = Math.acos(2 * rand() - 1);
    const nx = Math.sin(v) * Math.cos(u), ny = Math.cos(v), nz = Math.sin(v) * Math.sin(u);
    pts.push({ x: R(hip[0] + 55 * nx), y: R(hip[1] + 25 + 32 * ny), z: R(hip[2] + 40 * nz),
      nx: R(nx), ny: R(ny), nz: R(nz) });
  }
  raw.thalamus = pts;
}

// ---- overlap filter: generic lobes reject samples near specific sub-regions ----
for (const [generic, specifics] of Object.entries(OVERLAP_FILTER)) {
  const anti = specifics.flatMap(s => raw[s] || []);
  const before = raw[generic].length;
  raw[generic] = raw[generic].filter(p =>
    !anti.some(q => (p.x - q.x) ** 2 + (p.y - q.y) ** 2 + (p.z - q.z) ** 2 < EPS * EPS));
  console.error(`overlap-filter ${generic}: ${before} → ${raw[generic].length}`);
}

const out = {
  scale: HALF_WIDTH,
  meta: {
    source: 'BodyParts3D 4.0 (partof), The Database Center for Life Science',
    license: 'CC BY-SA 2.1 JP — https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html',
    generated: 'tools/build-brain-points.mjs (deterministic seed)',
  },
  regions: raw,
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out));
const counts = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, v.length]));
console.error('wrote', OUT, JSON.stringify(counts), `total=${Object.values(counts).reduce((a, b) => a + b, 0)}`);
