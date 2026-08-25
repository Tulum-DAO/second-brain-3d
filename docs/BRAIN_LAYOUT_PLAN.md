# Second Brain → Anatomical Brain Layout + Tool/Client Synapse Fires

## Context

Shaw's directive: reorganize the 3D fleet viz (`~/repos/second-brain`) so agents + services render as a **point cloud shaped like a real human brain**, each positioned in the functional region matching its role (GM→prefrontal, routing→thalamus, QA→cerebellum, memory→hippocampus, devs→motor/parietal, voice→temporal, infra→brainstem…). Add two new synapse-fire classes with visual parity to today's message comets: **agent uses a script/prompt** → pulse to a script/prompt node; **agent works on a client** → the client dot (orbiting outside the brain) connects to the agent and fires/holds heat while worked on.

Decisions locked with Shaw: **real mesh sample** (not procedural) with **collision mapping** (colliding agents cluster touching-but-not-overlapping); **slim satellites** (prompts+scripts as two small rings; repos folded under owning client, non-client repos one dim cloud; real service-daemons into brainstem; queue/state pillars retired); **lazy script nodes** (materialize on first observed use).

Verified event source: `state/agent-sessions.json` maps agent → `{session_id, conversation_path, cwd}`; the Claude transcript JSONLs contain `tool_use` blocks with script/prompt/client paths. (484 entries, most stale → must filter by live tmux ∩ recency; Gemini-runtime agents have a different format → explicitly skipped, logged, future work.)

## Architecture decisions (holes found in planning, resolved)

1. **Dual positions, one graph**: collector bakes BOTH position sets on every node — pillar `x/y/z` (unchanged) + `brain:{x,y,z,region}`. Client reads `?layout=brain` and swaps before `init()`. Works for both boot paths (fetch `/api/graph` first, WS `init` fallback — index.html:814). No fork of `reconcile()`/`ensureActorNode()`.
2. **Pin everything up front in brain mode**: anchors ARE the layout; if the force engine ran, 300 cooldown ticks would smear the brain. Client sets `fx/fy/fz` on all nodes during the swap → engine settles instantly, existing `settleView()`/`pinAll()`/digest-guard machinery works unchanged. Hide `hub:*` nodes + `member` links in brain mode (`brain:null` → dropped client-side; existing dangling-link filter cleans the edges).
3. **Dust shell for silhouette**: ~273 lit agents on ~4k sampled points = 7% occupancy — not a brain silhouette. Serve the full cloud via `/api/brain-points`; client renders unclaimed points as one dim additive `THREE.Points` added directly to `Graph.scene()` (outside the forcegraph digest — no landmine interaction).
4. **Legend = reuse `cluster` field** [amended per Claude-peer finding 3]: the server NEVER rewrites `n.cluster` (one WS serves both modes); it ships `brain.region` per node + the region palette (`legend`) in payloads, and the CLIENT overwrites `n.cluster = n.brain.region` during the brain-mode swap. `colorOf`/isolate/dim/search/panel/`clusterTex` all inherit untouched; `CLUSTERS` becomes server-provided-with-fallback.
5. **Reconcile must preserve firehose state**: lazy `script:*` nodes + `uses_*` links aren't in `buildGraph()` output; `reconcile()` consults a preserve-set for both node removal and the wholesale `graph.links` replacement. [AMENDED per AGY] Preserve-set entries carry `lastFire` ts; a sweep evicts entries (node + links, with `node.remove` broadcast) idle >24h — bounds memory alongside the script-node LRU. Lineage resolution stays in the canonical Python resolver (fleet-operator guidance beats architectural purity) but MUST be invoked via async execFile at the 30s candidate-refresh cadence only — never synchronously, never per-fire. AGY's node-drag concern is inapplicable: client sets enableNodeDrag(false).
6. **Sustained heat**: new `link.heat {source,target,until}` WS event; client holds `l.__act` at ~0.5 floor while `now < __heatUntil`, then normal 1.6s decay. (Scrubber's `clearHeat` may zero it; next server heat event restores — acceptable.)
7. **`flyTo` near-origin bug**: current camera math `k=1+d/r` explodes for nodes near origin (thalamus). Fix: position camera at `node + viewDir·d` instead of radial scaling.
8. **`queue:bus` fallback pulses** (server.js ~198): route to drop in brain mode when an endpoint is unresolvable.

## Phases

### P0 — Congruence + mesh selection (small)
- Run multi-model-congruence on this design (fleet norm for structural refactors).
- Mesh source, try in order: **(a) BodyParts3D** (CC BY-SA 2.1 JP — per-region OBJs: lobes, cerebellum, brainstem, thalamus, hippocampus — region tagging free); **(b) FreeSurfer fsaverage pial + Desikan-Killiany labels** via nilearn (cortex only → synthesize cerebellum/brainstem/thalamus/hippocampus as parametric clouds); **(c) any CC0 brain mesh + coordinate-plane region partition** (front 18% = prefrontal, rear = occipital, lateral-inferior flanks = temporal, etc.). Save license text alongside the tool.

### P1 — Asset pipeline (medium) — NEW `tools/build-brain-points.mjs`
Area-weighted triangle sampling (CDF + barycentric), ~4k points, **per-region budgets proportional to expected agent population** (motor/parietal dense for 225 T2s), normalized to half-width ≈ 340 world units (matches HUB_R=360 so camera/fly/pulse scales stay sane), per-point outward normal stored, deterministic seed. Output `lib/brain-points.json` `{scale, regions:{name:[{x,y,z,nx,ny,nz}...]}, meta:{source,license}}`.
**Gate: standalone visual check (screenshot-verify) — silhouette must read as a brain before any server work.**

### P2 — Layout module + collector (large) — NEW `lib/layout-brain.js`; touch `lib/collect.js`, `server.js`
- `regionOf(node)`: ordered keyword rules (gm/T0→prefrontal; pm-*→frontal; *-dev/*-builder→motor/parietal sub-clustered by project-hash to contiguous anchor arcs; qa/audit/verify/lineage→cerebellum; memory/dream/semantic→hippocampus; voice/arturo→temporal; router/dispatch/proxy→thalamus; watchdog/daemon/service→brainstem; misc→parietal fill). Testable: assert ≥90% non-fallback on real registry.
- **Anchor assignment (churn-stable, collision-mapped)** [AMENDED per AGY congruence DEC-1787647710]: `fnv1a(nodeId) mod N_region` → preferred anchor; colliders on one anchor land on a tangent-plane golden-angle sunflower where **spiral slot = fnv1a2(nodeId) mod 16, linear-probe to next free slot on slot-collision** — slot derives from the agent's OWN hash, never from sorting peers, so joins/leaves cannot shift existing agents (popping only on rare true slot-collisions, and only for the newcomer). Offset outward along the normal, pairwise spacing `r_i+r_j+2` where `r=(3+√val·1.4)·1.35` (max statusScale so status flips never overlap) → **touching-not-overlapping + stable across restarts and churn**. [Claude-peer finding 1] The CLAIMABLE anchor subset is a deterministic Poisson-disk/min-separation subsample (spacing ≥ 2·r_max + 6u margin) of each region's points; non-claimable points are dust-only — prevents a collision spiral smearing into an adjacent claimed anchor. If the global no-overlap smoke test still fails, the build ABORTS (asset/params bug, never ship-with-overlap).
- Satellites (same hash discipline): clients ring R≈560 (angle=hash(slug)); each client's repos on a small dim arc under it; non-client repos one dim sub-ring; prompts ring R≈480 tilt +25°; scripts ring R≈480 tilt −25° (lazy positions same hash rule). Services→brainstem anchors.
- `collect.js`: `applyBrainLayout(nodes)` after build → sets `n.brain` (or `null` for hub/queue/state). `server.js`: `ensureActorNode` computes `brain` too; add `/api/brain-points`; include `legend` in graph payloads.
- Smoke tests: no two brain positions within `r_i+r_j`; re-run with one agent removed → all others byte-identical.

### P3 — Client brain mode (medium-large) — touch `public/index.html` only
`?layout=brain`: swap positions + set `fx/fy/fz` all nodes + drop `brain:null` nodes/links before `init()`; [Claude-peer finding 2] the WS `node.add` handler must apply the same swap+pin immediately for runtime nodes (replace the 1600ms setTimeout pin path in brain mode) and drop `brain:null` delta nodes; `CLUSTERS` from payload legend; dust shell from `/api/brain-points`; new `MSG_COLORS` kinds `uses_script` (cyan), `uses_prompt` (violet), `client_work` (green) — `pulseLink` needs zero changes; `__heatUntil` hold in decay loop + `link.heat` handler; **fix flyTo** (decision #7).
**Gate (screenshot-verify): brain legible; scrubber seek/play/live, hover, isolate, WASD all regression-tested (the three known digest triggers).**

### P4 — Firehose tailer (large) — NEW `lib/firehose.js`; wire into `server.js`
- **Operator guardrails (orchestra-builder, msg_f0682180, accepted)**: agent-sessions.json + transcripts opened O_RDONLY only — never r+/os.replace, no locks (4 concurrent flock-managed writers own that store); `conversation_path` is possibly-stale mid-rotation → re-stat per tick, tolerate ENOENT; on path flip switch to the new file (read from offset 0 per AGY amendment — see tail rule below).
- **Attribution (canonical, msg_6fb63abf)**: `scripts/lineage_resolve.py:35` `resolve_live_head(agent_id, sessions, meta) -> (session|None, reason)` follows succeeded_by chains in agent-sessions.json (NOT registry aliases) so a predecessor's transcript attributes to the live successor. Firehose resolves at **candidate-refresh cadence only** (agent-sessions mtime change, ~30s), never per-fire, via the DELIVERED batch CLI (`python3 ~/scripts/agent-orchestra/scripts/lineage_resolve.py` — stdin one-id-per-line → single JSON map to stdout, snapshot built once internally; commit 69bce6644, live; verified: retired-alias→succeeded-by-chain, direct-live, unknown→null). Invoke via async execFile. `None` is a REAL outcome → attribute to last-known name tagged unresolved via `reason`; never crash/null-attribute. Consume `session`+`reason` only (ignore the resolver's injection semantics).
- Candidates: agent-sessions ∩ live tmux (`currentLive`) ∩ has `conversation_path` ∩ `last_active`<24h (~50 of 484); refresh on existing agent-sessions chokidar event.
- Tail every 2.5s: stat; **server BOOT/cold-start → offset=EOF (files can be multi-MB; never replay history). Session ROTATION (path flip) → new file read from offset 0** [AMENDED per AGY: EOF-on-rotation would race-skip events written before the flip is noticed; a fresh session file is small so offset-0 is bounded and correct]. Incremental byte reads, per-agent remainder buffer (64KB cap; [Claude-peer finding 5] count+log dropped-oversized-line events for shadow-mode review), tolerant JSONL parse.
- Classify `tool_use`: `prompts/*.md` → `uses_prompt` (target exists); `/home/shaw`-anchored `*.sh|*.py` in Bash commands → `uses_script` (lazy `script:*` node on scripts ring, `node.add`, preserve-set, LRU ~150); agent `cwd` basename ↔ client slug or ∈ client.json repos[] (reverse map built in collect) → `client_work` (+ tail `activity.jsonl` `git_push` as additional client-work signal).
- Coalesce ≤1 pulse per agent|target per 5s; each client_work also emits `link.heat` until now+180s. **First day: shadow mode flag (log-only) before broadcasting.** Own try/catch per tick — a throw must not kill the server's other watchers.

### P5 — Persistent client edges (small) — touch `lib/collect.js`
Build-time `works_on` agent→client links (dim, always present so fires travel a real edge, not an `ensureCommLink` improvisation); client→repo grouping links for hover legibility.

### P6 — Flip default (small)
Screenshots to Shaw → flip default to brain (`?layout=pillars` escape hatch for one release); drop queue/state generation + bus-fallback pulses; keep `hubPos/hubSeed` until escape hatch dies.

## Top risks
1. **Force/digest smears the brain** (this file's #1 historic bug class) → pin-before-init; dust shell outside forcegraph; regression-test the three digest triggers at P3.
2. **Tailer resource blowup** (stale entries, multi-MB transcripts, poison lines) → liveness∩recency filter, EOF cold-start, offset reads, remainder cap, LRU, per-tick try/catch.
3. **Reconcile deletes firehose nodes/links** → preserve-set in both removal paths; [Claude-peer finding 4] preserved links validate against the MERGED index (next.index ∪ preserve-set nodes), since lazy script nodes never appear in buildGraph output.
4. **Brain not legible** (aesthetic failure = feature failure) → P1 standalone visual gate before any server work; population-weighted region densities; dust shell.
5. **Noisy/false fires** → anchored conservative regexes, 5s coalescing, shadow mode first.

## Files
- `lib/collect.js` — dual positions, region hook, works_on client edges, cwd↔slug map
- `public/index.html` — swap+pin, legend-from-payload, dust shell, heat hold, flyTo fix, new pulse kinds
- `server.js` — preserve-set in reconcile, ensureActorNode brain seeding, firehose wiring, `/api/brain-points`, legend in payload
- NEW `lib/layout-brain.js`, NEW `lib/firehose.js`, NEW `tools/build-brain-points.mjs`, NEW asset `lib/brain-points.json`

## Verification
- P1: screenshot of region-colored cloud (silhouette gate).
- P2: node smoke tests (coverage ≥90%, no-overlap invariant, churn-stability byte-diff).
- P3: `/field?layout=brain` vs `/field` side-by-side screenshots; scrubber/hover/isolate/WASD regression.
- P4: shadow-mode log review → enable → observe live pulses agent→script/prompt/client; kill+rotate a session (no replay burst); RSS flat over an hour.
- P6: Shaw eyeball + flip. Service restart via tmux `second-brain-svc` after each server change; client hot-reloads automatically.
