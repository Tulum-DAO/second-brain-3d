# HANDOFF — second-brain-dev-3 → successor (gen-4)
schema: handoff_schema.Handoff · authored at soft-handoff by gen-3 · 2026-08-26

## current_goal
The anatomical-brain 3D fleet viz is SHIPPED and being used daily by Shaw, and is about to be wired to the OrchestraOS iOS app's "brain" button (→ the `/console` surface). Your job is continued iteration on Shaw's live feedback — polish, mobile/touch UX, and new visual/data features — on a single trunk (master, local-only repo, no remote). Port 7373, tmux `second-brain-svc`. There is no longer a phased plan to execute; gen-2's P0–P2 + gen-3's P3-and-beyond are all done. `docs/BRAIN_LAYOUT_PLAN.md` remains the canonical design record for the brain layout; P4 firehose / P5 client edges / P6 default-flip were NOT built (Shaw deprioritized live firehose; see open_loops).

## phase_state
- Everything gen-3 shipped is on master (24 commits this session, a9241fc → 203807d) and LIVE.
- Three route surfaces, one shared `public/index.html` (mode flags, NOT forked files):
  - `/field` = pillars (original), `/brain` = anatomical brain, `/console` = iOS-app surface (brain layout + stripped fluff + live feed + finger hitboxes).
  - Route→mode: `ROUTE_LAYOUT` map + `CONSOLE`/`BRAIN`/`EMBED` flags in index.html; `SHAPE_ROUTES` in server.js.
- Default `/` still 302→`/field` (P6 flip never requested).
- Service healthy; restart recipe unchanged (see hazards).

## next_3_actions
1. **Nothing is half-built** — no forced next step. React to Shaw. Likely near-term asks, based on this session's trajectory: wire the GROW button onto the `/console` scrubber (currently only on `/brain`/`/field`); make console edges more finger-tappable (they're short + hidden-at-rest, so tapping an edge is hard — see hazards); tune `NODE_R`/`EDGE_R` (console tap radii, index.html ~line 1348) after Shaw tries it on-device.
2. **Verify before claiming visual work done** — ALWAYS `node tools/shoot-launch.mjs <url> /tmp/x.png <ms>` then READ the png. Headless can't reproduce iOS Safari memory limits and auto-rotate makes coordinate-based tests flaky (disable `window.__controls.autoRotate` in the page before computing/dispatching taps).
3. **If Shaw wants the live firehose** (agent→script/prompt/client synapse fires, P4): the plan is in `docs/BRAIN_LAYOUT_PLAN.md §P4`, shadow-mode-first, canonical `lineage_resolve.py`. Gen-3 already pulled the canonical resolver into the server for HISTORY attribution (see decisions) — the batch-resolve + cache pattern is proven and reusable.

## decisions
- { text: "One shared index.html with mode flags (BRAIN/CONSOLE/EMBED), NOT physical page copies. /console is a route+flag, not a duplicated file", rationale: "the file is a landmine field (digest-collapse, lobe geometry, lineage, growth) — double-maintaining it would diverge and re-introduce fixed bugs. Shaw said 'duplicate the page'; I built functional separation without code duplication and it's held up across many edits. If Shaw insists on a literal fork, that's the only reason to reconsider." }
- { text: "Server reads state/tasks.db + agent-sessions.json O_RDONLY only; canonical lineage via lineage_resolve.py (async execFile, ONE batch call over all participants, cached, refreshed on agent-sessions change — never per-message)", rationale: "handoff discipline from gen-2; the restored Apr→Aug history animates because retired gens resolve to live heads (65/409 map to a live head; the rest are fully-retired with no node to fire on)" }
- { text: "Growth (GROW button) is pure VISIBILITY gating — never node add/remove", rationale: "add/remove touches graphData()/the digest; visibility (n.__obj.visible + n.__born flag + link accessors returning transparent/0-width for unborn) is landmine-safe. A node's/edge's first replayed event IS its first-appearance, so no birth-ledger endpoint was needed." }
- { text: "Console tap = a screen-space picker, NOT bigger 3D geometry; FG's own onNode/onLink/onBackground click handlers are disabled in console mode", rationale: "bigger sprites/cylinders would change visuals + risk the object/position model; a pointerup nearest-pick (orbs 18px / edges 12px) is non-invasive. Priority: hoverNode → hoverLink → pickNode → pickEdge, so the GLOWING (depth-aware FG-hovered) item always wins the tap." }
- { text: "Muted flows are a small server list (MUTED_FLOWS): type+target match, applied in live loop + /api/history", rationale: "lineage-daemon spammed 186 soft-handoffs at codex-dev-1; add {type,to} entries to mute more" }
- { text: "Mobile hardening is real: on ≤640px drop .fx overlays + backdrop-filter:blur + cap renderer pixelRatio to 1.5", rationale: "backdrop-filter + mix-blend-mode over WebGL is THE iOS-Safari 'a problem repeatedly occurred' (OOM) trigger. Can't repro headlessly; strong-inference fix." }

## open_loops
- **P4 firehose / P5 client works_on edges / P6 default-flip: NOT built.** Shaw explicitly deprioritized backfilling client/script/repo activity ("not yet"). If revived, plan §P4–P6 stands; the lineage-resolver server integration is already done and reusable.
- **`/console` GROW button not present** — GROW is only wired on the pillars/brain scrubber; console has its own scrubber layout. Easy add if Shaw wants it there.
- **Console edge-tapping is weak** — comm edges in brain mode are short (agents who talk sit close) AND translucent at rest, so their midpoints sit near orbs and the orb picker usually wins. Offered Shaw two fixes (faintly-visible console edges, or surface an orb's recent convos in the left drawer); he hasn't chosen. This is the most likely next console complaint.
- **semantic-memory-dev DDL confirmation** (gen-2 open loop) — still unverified; hippocampus memory-health glow is unbuilt, post-firehose work.
- **second-brain-svc still unsupervised** (not in service-watchdog.sh) — standing offer to Shaw, still unanswered; has caused silent outages. Raise once more.
- **public/brain-points.json** duplicate of lib/brain-points.json — dust is gone (lobes replaced it) but `/api/brain-points` still serves the point cloud for the lobe hulls; the public copy is unused, safe to delete.
- **The GROW ledger reaches ~July for spawns, April for messages** — clean per-agent spawn fields are sparse (~July+); message-derived first-appearance goes back to Apr 16. Reaching true April spawns would need mining orphaned April transcripts + rendering retired agents ("scar tissue" — Shaw-gated, unbuilt).

## file_roots_touched
`~/repos/second-brain/`: **public/index.html** (the whole client — 1400+ lines, mode flags, lobes, growth, console feed, tap picker, orbit), **server.js** (routes incl. /console + /api/feed + /api/spawns; /api/history with datetime() fix + lineage resolution + LIMIT 20000; lineage map via lineage_resolve.py; muted flows; approvals/qnr feed poller), lib/layout-brain.js (unchanged this session — region classifier + anchors), lib/brain-points.json (asset), docs/ (this file, BRAIN_LAYOUT_PLAN.md). Test scripts live in /tmp (throwaway).

## hazards
1. **The index.html digest-collapse landmine (unchanged, still #1)**: setting ANY link accessor (linkColor/linkWidth) triggers three-forcegraph's debounced scene digest that zeroes every node's __threeObj position to origin; our layout is static/pinned so nothing restores it → whole graph = one dot. Guard: `syncSprites()` before every render in `animFlashes` (gated on window.__settled). The force engine must NEVER run on brain layout (all nodes pinned fx/fy/fz). d3 THROWS on a dangling link endpoint → keep the init() dangling filter + reconcile refresh. **Regression-test scrubber seek/play/live + isolate + focus after ANY client change** (`/tmp/p3-regression.mjs`: 0 sprites at origin throughout).
2. **Lobe rendering is a transparent-double-sided trap**: smoothing a convex hull (Laplacian OR subdivide+Taubin) breaks convexity, and under the translucent DoubleSide material the folds stack into a dark muddy tangle. Convex hulls stay clean BECAUSE strictly convex (2 depth layers). Shaw wants anatomical accuracy > smoothness → keep convex. The real path to "rounded + accurate" is actual per-region meshes (BodyParts3D OBJs), an asset-pipeline spike, unbuilt.
3. **Chrome on this VPS**: ONLY `tools/shoot-launch.mjs` (puppeteer-core launches its own child chrome, swiftshader flags) works. Headless throttles rAF (undercounts time via the `Math.min(dt,50)` fly/orbit clamp) and can't hit iOS memory limits. Auto-rotate moves coords between compute-and-tap → disable it in-page for pointer tests. Launches occasionally protocol-timeout; just retry.
4. **JS ASI**: never start a line with `(` after a newline-terminated expression — `new THREE.Sprite(...)` <newline> `(x).add()` parses as CALLING the sprite. This cost real time (broke all pulses + froze playback); `node --check` passes it (valid syntax, wrong intent).
5. **Timestamp string-compare bug (fixed, stay alert)**: created_at is 'T'-separated ISO with +00:00; `datetime('now',?)` is space-separated. Raw `created_at > datetime('now',?)` is WRONG (the 'T' at index 10 beats the space → every row from today passes). Always wrap the column: `datetime(created_at) > datetime('now',?)`.
6. **Service restart**: `tmux kill-session -t second-brain-svc; tmux new-session -d -s second-brain-svc "cd ~/repos/second-brain && node server.js 2>&1 | tee -a ~/repos/second-brain/state/service.log"`. Needed only for server.js changes; index.html hot-reloads (file watcher broadcasts `reload`). No watchdog covers it.

## canary_questions
(Answer IN YOUR OWN WORDS after reading gen-3's session jsonl — these facts live only in the transcript, by design.)
- { id: "smoothing-dark-tangle", question: "Gen-3 tried THREE ways to make the lobes rounder; all but one failed the same way. State the precise rendering mechanism that turned smoothed hulls into a dark muddy tangle, and why the final approach (plain convex hull) is immune.", source_pointer: "jsonl: the lobe-rounding iterations — Laplacian, then subdivide+Taubin, then ellipsoids, then revert" }
- { id: "console-page-choice", question: "Shaw said 'duplicate this page' for the iOS surface. Gen-3 did NOT create a second file. What did it do instead, and what specific property of index.html made a literal fork the wrong call?", source_pointer: "jsonl: the /console build turn" }
- { id: "growth-no-endpoint", question: "GROW animates the brain assembling from its first-appearance ledger, yet gen-3 added NO new server endpoint for births. What existing mechanism supplies the birth times, and why is that exactly equivalent to a first-appearance ledger?", source_pointer: "jsonl: the GROW-mode turn" }
- { id: "history-cap-and-resolve", question: "After gm restored 10,997 messages, only ~240 animated and they stopped at July. TWO independent server bugs caused that. Name both and the one-line fix for each.", source_pointer: "jsonl: the restored-history integration turn" }
- { id: "surface-decision-miss", question: "Shaw corrected gen-3 about HOW it was asking him things during a brainstorm. What was the rule, why did gen-3 keep breaking it, and where is it now recorded so you won't?", source_pointer: "jsonl: the lobes brainstorm turn where Shaw said 'menu, menu, and approval card'" }

## .jsonl transcript map (archaeology on demand — GREP, never read linearly)
- Gen-3 (this whole session: P3, shape routing, all lobe iterations, layers menu, orbit, mobile hardening, restored-history/lineage, /console + feed + hitboxes, GROW): the ef55f113-successor session in `~/.claude/projects/-home-shaw-repos-second-brain/*.jsonl` (find the newest large file).
- Gen-2 (five render-bug fixes, P0–P2, fleet negotiations): `~/.claude/projects/-home-shaw-repos-second-brain/ef55f113-6143-4dd3-8dc6-e0601aa7c826.jsonl`
- Search: `rg -l "<pattern>" ~/.claude/projects/-home-shaw-repos-second-brain/*.jsonl`

## the standing feedback that bit gen-3 (read your auto-memory)
- **surface-decision is MANDATORY** for any menu/approval/question to Shaw, even mid-brainstorm — memory `feedback_surface_decisions_to_shaw.md`. Gen-3 posed A/B/C menus as terminal text; Shaw called it out. Route decisions to the OrchestraOS surface, not prose.
- Visual claims need PNGs (shoot-launch + READ). Measure, don't reason.
- Shaw iterates fast and course-corrects readily — ship a focused version + state your choices, don't over-brainstorm; but the moment it's a genuine multi-option DECISION for him, surface it natively.
