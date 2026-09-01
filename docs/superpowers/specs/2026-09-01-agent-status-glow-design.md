# Agent Status Glow — "firing brain" design
2026-09-01 · approved by Shaw (native menu + live session) · author: second-brain-dev (gen4)

## Goal
Every agent orb carries a live status halo so the brain visibly "fires" even with arrow
sprites and message labels off. Orb **cores stay lobe-tinted always** (anatomy reads);
the **halo** carries status color. Working agents **pulse continuously**. Work start/stop
times are ledgered.

## States, colors, precedence (first match wins)
| # | state | color | detector |
|---|-------|-------|----------|
| 1 | dead | grey `#6b6b66` | no tmux session for the agent |
| 2 | needs-decision | blue `#3b82f6` | pending `approval_requests` (or `questionnaires`) row with `from_agent` = agent, `status='pending'`, not discarded |
| 3 | working | orange `#f97316` | transcript `.jsonl` (`conversation_path` from agent-sessions.json) mtime within `WORK_WINDOW_MS` (~8s) — actively appending |
| 4 | draft-in-CLI | amber `#fbbf24` | Shaw has typed-but-unsubmitted text in the pane's Claude input box (tmux capture-pane heuristic on the prompt area) |
| 5 | idle | green `#22c55e` | alive, none of the above |

Only **working** pulses (halo scale + opacity oscillation). Others are steady halos.
No red anywhere; dead = grey.

## Server — `lib/status.js` + wiring in `server.js`
- One poller, every `STATUS_POLL_MS` (3s):
  1. `tmux ls` once → live session set (reuse `liveSessions()` from collect.js).
  2. `agent-sessions.json` (O_RDONLY) → per-agent `tmux_session` + `conversation_path`; `fs.statSync` mtime per transcript. Missing/stale path ≠ working.
  3. tasks.db opened **read-only** (`node:sqlite`, `{readOnly:true}`): `SELECT from_agent FROM approval_requests WHERE status='pending' AND discarded_at IS NULL` (+ same for questionnaires by `from_agent`,`status='pending'`).
  4. Amber: `tmux capture-pane -p -t <sess>` tail; input-box detection = text between the `>` prompt/box markers, non-empty, and the pane is NOT streaming (not working per #3). Best-effort — misdetection degrades to green, never crashes the poller.
- Diff vs previous map → broadcast **only deltas**: `{type:'agent.status', changes:[{id:'agent:<n>', s:'working'}]}` over the existing WS. Full map rides the initial `/api/graph` payload as `n.stat`.
- **Ledger**: every transition into/out of `working` appends `{"agent":"...","state":"working"|"done","t":"<iso>"}` to `~/repos/second-brain/state/work-ledger.jsonl` (this repo's own state — never the fleet stores). Scrubber fuel later; not consumed in v1.
- GUARD compliance: fleet stores read-only; no writes outside this repo; poller failures log + skip a tick, never kill the service.

## Client — `public/index.html`
- `STATUS_COLORS` map + per-node halo: one additive sprite (`makeGlowTex` reuse) parented with the orb's `__obj`, rendered behind the core, colored by `n.stat`. Core sprite untouched → lobe tint preserved.
- WS `agent.status` handler updates `n.stat` + halo color/visibility. No `graphData()` calls, **no link accessors** → zero digest-landmine interaction.
- Pulse: in the existing anim loop (gated on `window.__settled`), halos of `working` nodes oscillate scale ~1.0→1.35 and opacity ~0.45→0.9 on a per-node phase offset (so the brain shimmers, not metronomes).
- **Layers menu**: new `STATUS GLOW` checkbox (default ON). Off → all halos hidden; brain is exactly today's lobe-colored look.
- All three surfaces (/field, /brain, /console) get it; console included.

## Verification
- PNG per state (force: touch a transcript for orange; open a draft in a test pane for amber; a pending approval agent for blue; a dead registry agent for grey) → READ each PNG.
- Collapse-regression (0 sprites at origin across seek/play/live + isolate + focus) after the client edit.
- Live soak: watch a real busy agent pulse orange → settle green on the live service.
- Toggle check: STATUS GLOW off renders byte-identical-look to current brain.

## Out of scope (explicit)
- Scrubber replay of work-ledger (future).
- Status for non-agent nodes (repos/services keep current styling; infra services already have live/down).
- Any write to fleet stores; any change to lobe geometry/colors.
