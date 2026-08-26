# HANDOFF — second-brain-dev-3 → successor (gen-4)
schema: handoff_schema.Handoff · authored at soft-handoff by gen-3 · 2026-08-26

## current_goal
The anatomical-brain 3D fleet viz (port 7373, tmux `second-brain-svc`) is SHIPPED and used daily by Shaw, and is being wired to the OrchestraOS iOS app's "brain" button → the `/console` surface. Your goal: continued live-feedback iteration (polish, mobile/touch UX, new visual+data features) on a single local-only master trunk. There is no phased plan left to execute — gen-2's P0–P2 and gen-3's P3-and-beyond are done.

## phase_state
- plan_ref: `docs/BRAIN_LAYOUT_PLAN.md` — canonical design record; P4 firehose / P5 client edges / P6 default-flip were NOT built (Shaw deprioritized live firehose). All still-valid if revived.
- phase: **SHIPPED / live-iteration.** 25 gen-3 commits on master (a9241fc → b6617d7). Three surfaces on ONE flag-driven `public/index.html`: `/field`=pillars, `/brain`=anatomical brain, `/console`=iOS surface (brain layout + stripped fluff + live activity feed + finger tap-picker). Route→mode via `ROUTE_LAYOUT` map + `CONSOLE`/`BRAIN`/`EMBED` flags (client) and `SHAPE_ROUTES` (server). `/` still 302→`/field`.
- next_gate: no open gate. Any client change must PASS the collapse-regression (`node /tmp/p3-regression.mjs` equivalent: 0 sprites at origin across scrubber seek/play/live + isolate + focus) before you claim it done.

## next_3_actions
1. **React to Shaw; do not start speculative work.** Most-likely first ask (from this session's trajectory): wire the GROW button onto the `/console` scrubber (it's only on `/brain`/`/field` today), and/or make console edges finger-tappable (they're short + translucent-at-rest so the orb picker usually wins).
   - first_effect: { kind: "render-check", target: "http://127.0.0.1:7373/console", check: "node tools/shoot-launch.mjs http://127.0.0.1:7373/console /tmp/c.png 10000 → READ the png: brain visible, Activity feed streaming, timeline visible at the very bottom (scrubber z-index 16 sits ABOVE the feed); page eval: 0 sprites at origin" }
2. **Verify every visual claim with a PNG** (shoot-launch → READ). Headless can't hit iOS memory limits; auto-rotate moves coords between compute-and-tap (disable `window.__controls.autoRotate` in-page for pointer tests); chrome launches occasionally protocol-timeout → retry.
3. **If Shaw revives the live firehose (P4):** plan §P4, shadow-mode-first. The canonical `lineage_resolve.py` batch-resolve+cache pattern is ALREADY wired into server.js for history attribution — reuse it; do not re-implement lineage.

## decisions
- { text: "GUARD — single trunk on master; commit incrementally per change; NEVER force-push; repo is local-only (no remote, nothing to push)", rationale: "matches gen-1/2/3 history; a broken master IS the outage" }
- { text: "GUARD — never kill/restart shared services casually. second-brain-svc restart ONLY via the tmux recipe (hazard #3) and ONLY for server.js changes; index.html hot-reloads via the file watcher", rationale: "no watchdog covers this svc; a bad restart is a silent outage" }
- { text: "GUARD — verify-before-completion: PNG-read every visual claim; run the collapse-regression after ANY client edit", rationale: "reasoning-instead-of-measuring, and syntax-checks that pass runtime-wrong code, have both burned this lineage" }
- { text: "GUARD — lane boundary: THIS repo only. Fleet-level asks → orchestra-builder via msg_store (file-sourced bodies). Read fleet stores (state/tasks.db, agent-sessions.json) O_RDONLY only — never write", rationale: "4 flock-managed writers own agent-sessions.json; a writer here corrupts fleet succession" }
- { text: "One shared index.html with mode flags — /console is a route+flag, NOT a duplicated file", rationale: "the file is a landmine field; forking it would diverge and re-introduce fixed bugs. Shaw said 'duplicate the page'; functional separation via flags has held across many edits" }
- { text: "Console finger interaction is a screen-space tap picker (pointerup nearest-pick, orbs 18px / edges 12px), and FG's own onNode/onLink/onBackground click handlers are DISABLED in console mode. Priority hoverNode→hoverLink→pickNode→pickEdge so the depth-aware GLOWING item wins", rationale: "bigger 3D geometry would change visuals + risk the object/position model" }
- { text: "GROW mode is pure visibility gating (n.__obj.visible + n.__born flag + link accessors → transparent/0-width for unborn); NEVER node add/remove", rationale: "add/remove touches graphData()/the digest landmine" }

## open_loops
- **P4/P5/P6 unbuilt** — Shaw deprioritized firehose ("not yet"). Reusable: the server-side canonical-lineage integration already exists.
- **Outstanding msg_store request (mine, still OPEN):** I asked orchestra-builder to fix the surface-decision bypass mechanism fleet-wide (a hook/guard so decision prompts to Shaw can't leak to the terminal). No resolution yet — check its status; it saw the request and reportedly spun a blocker-surfacing-investigator.
- **Replied+closed:** gm-gen27's restored-history integration (I integrated it; see phase_state). orchestra-builder attribution lane (batch CLI) — closed/reused.
- **`/console` GROW button** not wired onto the console scrubber layout.
- **Console edge-tap is weak** — comm edges are short + hidden-at-rest; offered Shaw two fixes (faintly-visible console edges, or surface an orb's recent convos in the left drawer), he hasn't chosen. Most likely next console complaint.
- **second-brain-svc unsupervised** (not in service-watchdog.sh) — standing offer to Shaw, unanswered; has caused silent outages. Raise once more.
- **`public/brain-points.json`** is now unused (dust removed; lobes use `/api/brain-points` from lib/). Safe to delete.
- **semantic-memory-dev DDL confirmation** (gen-2 loop) still unverified; hippocampus memory-health glow unbuilt (post-firehose).

## file_roots_touched
`~/repos/second-brain/`: **public/index.html** (entire client — mode flags, brain swap+pin, lobes, GROW, /console feed + tap picker, orbit, layers menu, collision slider; ~1450 lines), **server.js** (routes incl. /console; `/api/feed` + `/api/spawns`; `/api/history` with the datetime-normalization fix + lineage resolution + LIMIT 20000; lineage map via `scripts/lineage_resolve.py`; `MUTED_FLOWS`; approvals/questionnaire feed poller), lib/layout-brain.js (UNCHANGED this session), lib/brain-points.json (asset), docs/ (this file + BRAIN_LAYOUT_PLAN.md). Throwaway test scripts in /tmp.

## hazards
1. **Digest-collapse landmine (still #1)**: setting ANY link accessor (linkColor/linkWidth) triggers three-forcegraph's debounced scene digest that zeroes every node's __threeObj to origin; our layout is static/pinned so nothing restores it → whole graph renders as one dot. Guard: `syncSprites()` before every render in `animFlashes` (gated on window.__settled); the force engine must NEVER run on brain layout (pin fx/fy/fz); d3 THROWS on a dangling link endpoint (keep init() filter + reconcile refresh). Regression-test the three triggers after ANY client change.
2. **Lobe hulls must stay STRICTLY CONVEX — do NOT smooth them.** Every rounding approach gen-3 tried failed; convex is the only clean option under the translucent double-sided material. Shaw's priority is anatomical accuracy > smoothness. The only real path to "rounder AND accurate" is loading actual per-region anatomical meshes (BodyParts3D OBJs) — an unbuilt asset-pipeline spike. (Mechanism of WHY smoothing fails is a canary — read the transcript.)
3. **Chrome on this VPS**: ONLY `tools/shoot-launch.mjs` works (puppeteer-core launches its own child chrome, swiftshader). Headless throttles rAF (the `Math.min(dt,50)` fly/orbit clamp then undercounts elapsed time) and cannot reproduce iOS memory limits. **Restart recipe:** `tmux kill-session -t second-brain-svc; tmux new-session -d -s second-brain-svc "cd ~/repos/second-brain && node server.js 2>&1 | tee -a ~/repos/second-brain/state/service.log"` — server.js changes only.

## canary_questions
(Answer each IN YOUR OWN WORDS after reading gen-3's session jsonl. Facts live only in the transcript — not inferable from the phrasing, not answered anywhere in this repo.)
- { id: "smoothing-failure-mechanism", question: "Gen-3 tried several ways to make the lobes rounder and all but one produced the SAME visual failure. State the precise rendering mechanism (why the geometry + the material interacted to ruin it) and why the surviving approach is structurally immune.", source_pointer: "jsonl: the lobe-geometry iteration span, 2026-08-25 (the run of attempts before the convex revert)" }
- { id: "first-lobe-rejection", question: "Shaw rejected gen-3's FIRST lobe pass with a specific TWO-part critique. Name both parts, and state the one property of the source asset that gen-3 had to MEASURE first to prove the chosen fix was even possible.", source_pointer: "jsonl: the turn where Shaw rejects the first lobes + the immediately-following asset-measurement turn" }
- { id: "playback-frozen-root-cause", question: "A live feature silently broke: playback showed as running but nothing moved. The build passed its syntax check. Explain the exact parsing mechanism that caused it and why the syntax check could not catch it.", source_pointer: "jsonl: the turn diagnosing why 'play does nothing' after a refactor" }
- { id: "silhouette-legibility-pivot", question: "Before the lobes existed the brain silhouette was rendered a different way. Gen-3 changed ONE property of that render after comparing it to an earlier gate artifact, and the anatomy suddenly read as a brain. What was the render, what property changed, and what was the comparison?", source_pointer: "jsonl: the P3 silhouette/dust iteration turns (before hulls existed)" }

## .jsonl transcript map (GREP, never read linearly)
- Gen-3 (this whole session): the newest large file in `~/.claude/projects/-home-shaw-repos-second-brain/*.jsonl`.
- Gen-2: `~/.claude/projects/-home-shaw-repos-second-brain/ef55f113-6143-4dd3-8dc6-e0601aa7c826.jsonl`.
- Search: `rg -l "<pattern>" ~/.claude/projects/-home-shaw-repos-second-brain/*.jsonl`.

## standing feedback (also in auto-memory — READ IT)
- **surface-decision is MANDATORY** for any menu/approval/question to Shaw, even mid-brainstorm (memory `feedback_surface_decisions_to_shaw.md`). Route decisions to the OrchestraOS surface, not terminal prose.
- Visual claims need PNGs. Shaw iterates fast + course-corrects readily: ship a focused version and state your choices; but the instant it's a genuine multi-option DECISION for him, surface it natively.
