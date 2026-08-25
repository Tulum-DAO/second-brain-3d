# HANDOFF — second-brain-dev → successor (gen-3)
schema: handoff_schema.Handoff · authored at soft-handoff by gen-2 · 2026-08-25

## current_goal
Execute P3→P6 of the congruence-approved anatomical brain-layout redesign of the second-brain 3D fleet viz (port 7373, tmux `second-brain-svc`): client brain mode behind `?layout=brain`, transcript firehose (synapse fires for script/prompt/client work), persistent client edges, then Shaw-gated default flip. Shaw's directive; congruence DEC-1787647710 CONSENSUS_REACHED (Claude peer APPROVE + AGY APPROVE-after-amendments).

## phase_state
- plan_ref: `docs/BRAIN_LAYOUT_PLAN.md` (committed copy of the canonical plan — read it IN FULL first; it embeds every peer finding, operator guardrail, and amendment)
- phase: **P0–P2 COMPLETE** (commits `7bdb3ac` asset+visual-gate, `a9650aa` layout module+wiring; service restarted and live: 736/748 nodes carry `n.brain`, legend + `/api/brain-points` serving, smoke tests ALL PASS: 0 overlaps on real 293-agent fleet, churn-stable). **P3 is next.**
- next_gate: P3 visual gate — `/field?layout=brain` renders a legible brain AND the full regression suite holds (scrubber seek/play/live, hover, isolate, WASDQE — the three known digest triggers) BEFORE starting P4.

## next_3_actions
1. **Implement P3 client brain mode** in `public/index.html` per plan §P3: swap `n.brain`→x/y/z + pin fx/fy/fz ALL nodes pre-`init()`, drop `brain:null` nodes AND apply same swap+pin in the WS `node.add` handler (Claude-peer finding 2 — replace the 1600ms setTimeout pin in brain mode), client-side `n.cluster=n.brain.region` + `CLUSTERS` from payload `legend` (finding 3), dust shell from `/api/brain-points` via `THREE.Points` added straight to `Graph.scene()`, new `MSG_COLORS` kinds (uses_script cyan / uses_prompt violet / client_work green), `__heatUntil` hold, fix `flyTo` near-origin bug (index.html ~412).
   - first_effect: { kind: "render-check", target: "http://127.0.0.1:7373/field?layout=brain", check: "node tools/shoot-launch.mjs <url> /tmp/p3.png 6000 → PNG shows brain-shaped constellation; page eval: 0 sprites at origin, sample agent sprite position === its n.brain coords, legend shows regions" }
2. **P3 regression gate**: same one-shot chrome recipe; verify scrubber (seek back, play, return live), hover highlight, region isolate, WASD fly — then commit P3 and screenshot to Shaw.
3. **Build P4 firehose** (`lib/firehose.js`) per plan §P4 exactly: O_RDONLY, boot=EOF / rotation=offset-0, attribution via `python3 ~/scripts/agent-orchestra/scripts/lineage_resolve.py` batch CLI (delivered, verified — stdin ids → JSON map) at ~30s candidate-refresh via async execFile, 5s coalescing, `link.heat` 180s, lazy script nodes + reconcile preserve-set validated against MERGED index (finding 4), oversized-line drop counter (finding 5), **shadow mode (log-only) for first day** before broadcasting.

## decisions
- { text: "Single trunk on master; commit incrementally per phase; never force-push; service restarts only via tmux `second-brain-svc`", rationale: "matches gen-1/gen-2 history; watchdogs don't cover this service — a broken master IS the product" }
- { text: "READ-ONLY on all fleet stores: agent-sessions.json + transcript JSONLs opened O_RDONLY, no locks, never r+/os.replace", rationale: "operator guardrail (orchestra-builder): 4 concurrent flock-managed writers own agent-sessions.json; a writer here can corrupt fleet succession state" }
- { text: "verify-before-completion for ALL visual claims: capture PNG via tools/shoot-launch.mjs and READ it before asserting; never background Chrome on this VPS", rationale: "gen-2 shipped two wrong fixes early on by trusting reasoning over observation; backgrounded chrome is reaped by this host — only the one-shot child-of-puppeteer pattern with swiftshader flags survives" }
- { text: "Congruence DEC-1787647710 amendments are binding: slot-from-own-hash, rotation-reads-offset-0, preserve-set 24h sweep, async-only lineage CLI, spatial-grid clearance guard, Poisson-disk claimable subsample", rationale: "both peers conditioned APPROVE on these; the grid guard empirically killed 9 real overlaps" }
- { text: "Default layout stays pillars until Shaw approves the P6 flip; brain ships behind ?layout=brain", rationale: "live surface used daily; rollout safety was an explicit congruence review point" }
- { text: "Lane boundary: this repo only. Fleet-level asks → orchestra-builder via msg_store (file-sourced bodies). Semantic-memory schema consumed read-only from state/semantic-memory.db when it lands", rationale: "standing fleet discipline; schema sync already agreed with semantic-memory-dev" }

## open_loops
- semantic-memory-dev owes confirmation that gen-2's viz read-side deltas (health_by_scope view, documents.last_used_at, ts indexes on queries_log/feedback, agent-id normalization) are in the shipped DDL — check inbox thread; memory-health rendering near hippocampus is post-P3 work that binds to that schema.
- orchestra-builder attribution lane is CLOSED (batch CLI live, verified; stdin-loop mode declined but on offer).
- second-brain-svc remains unsupervised (not in service-watchdog.sh) — standing offer to Shaw, unanswered; has caused 3 silent outages. Raise once more at a natural moment.
- `public/brain-points.json` + `public/brain-preview.html` are P1 gate artifacts; after P3's dust shell uses `/api/brain-points`, remove the public JSON copy (keep the preview page or fold it).
- tasks.db was reset ~Aug-20 (mechanism undocumented): scrubber history is only days deep — known, not yours to fix.
- Inbox discipline: stop-hook drains pending msg_store messages ≥120s old — process + ack promptly; reply via store API with file-read bodies (shell-mangling hazard is real and documented in msg_store.py itself).

## file_roots_touched
`~/repos/second-brain/`: server.js, lib/collect.js, lib/layout-brain.js, lib/brain-points.json, public/index.html, public/brain-preview.html, public/brain-points.json, tools/build-brain-points.mjs, tools/test-brain-layout.mjs, tools/shoot-launch.mjs, docs/ (this file, BRAIN_LAYOUT_PLAN.md, brain-gate-lateral.png). Also: /tmp/bp3d (mesh cache, disposable), ~/.claude/plans/eventual-wibbling-dijkstra.md (original plan; repo copy is canonical now), DOCS/SHARED_DECISIONS.json (congruence record).

## hazards
1. **index.html landmine field**: setting ANY link accessor triggers three-forcegraph's debounced digest which resets every node object's position to origin (guard: `syncSprites()` before every render in `animFlashes` — never remove); the force engine must NEVER run on brain layout (pin fx/fy/fz pre-init or 300 cooldown ticks smear the brain); d3 THROWS on a dangling link endpoint (one stale edge kills ALL links — `init()` filter + reconcile refresh are the guards). After ANY client change, regression-test scrubber+hover before claiming done.
2. **Chrome on this VPS**: any backgrounded launch (nohup/setsid/tmux/&) dies instantly post-restart; ONLY `tools/shoot-launch.mjs` (puppeteer-core launches chrome as its own child, swiftshader GL flags) works. Do not rediscover this — it cost gen-2 hours across two sessions.
3. **Shared-store etiquette**: transcripts + agent-sessions.json are hot fleet state with concurrent writers; `conversation_path` flips mid-rotation (boot=EOF, rotation=offset-0); attribution MUST go through the canonical lineage CLI or fires bind to retired generations.

## canary_questions
(Answer each IN YOUR OWN WORDS after reading gen-2's session jsonl — no answers exist anywhere in this repo, by design.)
- { id: "overlap-worst-pair", question: "The FIRST run of the P2 no-overlap smoke test failed. Which two node ids formed the worst overlapping pair, at what measured distance, and why was that pairing structurally predictable?", source_pointer: "jsonl: 2026-08-25T09:05–09:20Z, first test-brain-layout.mjs output turn" }
- { id: "sprite-collapse-mechanism", question: "The scrubber 'clump' bug: state the precise mechanism finally identified, and the single measurement that separated node DATA from render state.", source_pointer: "jsonl: 2026-08-01, the seek-investigation turns culminating in a sprite-position census" }
- { id: "agy-round1-reject", question: "One of AGY's five round-1 congruence findings was rejected as inapplicable rather than amended. Which one, and what code-level fact grounded the rejection?", source_pointer: "jsonl: 2026-08-25T08:55–09:05Z, AGY round-1 processing turn" }
- { id: "rotation-offset-rule", question: "The firehose has two different tail-offset behaviors for two different situations. State both rules and the failure each prevents.", source_pointer: "jsonl: 2026-08-25T09:00–09:10Z, plan-amendment turns after the counter-propose" }
- { id: "attribution-cadence", question: "Why does the firehose never call the lineage resolver per-fire, and what insight made the operator's performance caveat moot?", source_pointer: "jsonl: 2026-08-25T08:40–08:50Z, resolver-pointer reply turn" }
