# Agent Status Glow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans, INLINE ONLY. Do NOT dispatch subagents into `public/index.html` (digest-collapse landmine field). Run the collapse-regression after every client task.

**Goal:** Live status halos on agent orbs (grey dead / blue needs-decision / orange working+pulsing / amber draft-in-CLI / green idle), lobe-tinted cores untouched, STATUS GLOW layer toggle, work start/stop ledger.

**Architecture:** New `lib/status.js` poller (3s: tmux + transcript mtimes + tasks.db read-only + capture-pane amber) → WS `agent.status` deltas + `/api/status` snapshot + `state/work-ledger.jsonl`. Client keeps `nodeSprite` untouched; halos are additive sprites in a `haloGroup` added straight to `Graph.scene()` (outside the forcegraph digest, same pattern as lobes/dust), positions synced in `animFlashes`.

**Tech Stack:** node (no new deps; `node:sqlite` readOnly), three.js sprites, existing WS.

**Spec:** `docs/superpowers/specs/2026-09-01-agent-status-glow-design.md`

---

### Task 1: `lib/status.js` — status resolver + ledger

**Files:** Create `lib/status.js`; Test `/tmp/status-test.mjs` (throwaway).

- [ ] Step 1: Write `lib/status.js` exporting `startStatusPoller({onDelta})` and `getStatusMap()`.
  - Read `agent-sessions.json` O_RDONLY for `{tmux_session, conversation_path}` per agent.
  - `liveSessions()` reused from `./collect.js`.
  - Working: `fs.statSync(conversation_path).mtimeMs > Date.now()-8000`.
  - Blue: `node:sqlite` `{readOnly:true}` on tasks.db: pending `approval_requests` (status='pending', discarded_at IS NULL) + `questionnaires` (status='pending') by `from_agent`.
  - Amber: `tmux capture-pane -p -t <sess>` (only for alive, non-working agents), detect non-empty typed text inside the `>` input box; any exec error → not amber.
  - Precedence dead→blue→working→amber→idle. Poll 3s; diff → `onDelta([{id,s}])`; transitions in/out of `working` append to `state/work-ledger.jsonl`.
  - Every failure path: warn + return previous state; never throw out of the tick.
- [ ] Step 2: Test standalone: `node /tmp/status-test.mjs` prints a map with ≥1 working agent (me) and my state flips orange while this session appends. Verify ledger line appears.
- [ ] Step 3: Commit `lib/status.js`.

### Task 2: server wiring

**Files:** Modify `server.js` (near the feed poller + WS broadcast helpers).

- [ ] Step 1: Import + `startStatusPoller({onDelta:changes=>broadcast({type:'agent.status',changes})})`; add `GET /api/status` returning `getStatusMap()` (route added alongside `/api/spawns`).
- [ ] Step 2: Restart svc via the ONLY sanctioned recipe; `curl /api/status` shows sane states; log clean.
- [ ] Step 3: Commit.

### Task 3: client halos + pulse + toggle

**Files:** Modify `public/index.html` (STATUS_COLORS near CLUSTERS; haloGroup near lobes init; pulse block in `animFlashes`; checkbox in layers panel HTML + `applyLayer`; WS handler near `node.update`; init fetch near `loadHistory(6)`).

- [ ] Step 1: `LAYERS.status=true`; `STATUS_COLORS={dead:'#6b6b66',decision:'#3b82f6',working:'#f97316',draft:'#fbbf24',idle:'#22c55e'}`; `haloGroup=new THREE.Group()` added to scene at init; per-agent halo sprite (shared `makeTexture('#ffffff')`-style radial tex, `color` set per state, additive, depthWrite:false, renderOrder behind orbs).
- [ ] Step 2: `applyStatus(id,s)` sets halo color/visibility (`dead` grey steady, others steady, `working` flagged for pulse). WS `agent.status` case + init `fetch('/api/status')`.
- [ ] Step 3: In `animFlashes`: position every halo at its node (guard `n.__obj.visible`), and for working halos oscillate scale/opacity with per-node phase (`id`-hash offset). No link accessors touched.
- [ ] Step 4: Layers menu: `STATUS GLOW` checkbox (`data-layer="status"`); `applyLayer('status')` → `haloGroup.visible=on`.
- [ ] Step 5: Syntax check (script-extract + `node --check`).
- [ ] Step 6: Collapse-regression: 0 sprites at origin across seek/play/live+isolate+focus.
- [ ] Step 7: PNG verify on `/brain` + `/console`: halos present, states plausible (me=orange), toggle off = today's look. READ the PNGs.
- [ ] Step 8: Commit.

### Task 4: live soak + GROW interplay

- [ ] Step 1: Verify halos hide with unborn nodes during GROW (halo visibility ANDs with `n.__born!==false`).
- [ ] Step 2: Watch live: an active agent pulses orange → settles green/amber. PNG evidence.
- [ ] Step 3: Commit any fix; done.
