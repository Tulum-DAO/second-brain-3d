# HANDOFF — second-brain-dev gen4 → successor (gen-5)
schema: handoff_schema.Handoff · authored at soft-handoff by gen-4 · 2026-09-06 · FRESHNESS AMENDMENT 02:20Z: g5 (tmux second-brain-dev-g5, spawned 01:17 ET) OWNS AgentEvent stage 3+ — its uncommitted WIP (test_snapshot_barrier.py 8 tests + test_w5_multipart_gate.py) was gen4-reviewed FAITHFUL + RED-verified; do NOT re-author. Gen4 stood down from the build lane; seat duty (brain viz) is what transfers at rotation. See BUILD-CHECKPOINT.md @7404e7f14 + msg_81ec2db1 for the coordination record.
gen-4 transcript: `~/.claude/projects/-home-shaw-repos-second-brain/16b937e8-e4f6-4feb-9db4-ffeb7948f153.jsonl`

## current_goal
TWO lanes, both live. (1) SEAT: the brain viz (port 7373, tmux `second-brain-svc`) is shipped, merged to master @5e62088, and in daily live-feedback iteration — status halos, chat composer (send/attach/interrupt via gateway proxy), tethered convo cards + overlay, depth-aware picker, orbit lock/zoom/pin, 24/24 regression matrix green. React to Shaw; no speculative work. (2) BUILD (Shaw-direct via orchestra-builder): AgentEvent replay-semantics — spec RATIFIED by 3-leg congruence (DEC-1788642519, REV 2.3 @09e474446 in ~/scripts/agent-orchestra), RED stage 1+2 faithfulness-PASSED, gm ruled SAME LINEAGE builds GREEN under the frozen-fixture condition. You are also the ARMED BG-validation seat — this rotation itself is part of that validation; don't fight it.

## phase_state
- plan_ref: `~/scripts/agent-orchestra/.workspace/proposals/agentevent-replay-semantics-spec.md` @09e474446 (§8 build order) + `~/scripts/agent-orchestra/contract/agentevent/BUILD-CHECKPOINT.md` (living successor-resume file — READ IT FIRST, it carries exact next-step + all gate rulings).
- phase: brain seat = SHIPPED/live-iteration on single master trunk. AgentEvent = stage-3 RED authoring next (`test_snapshot_barrier.py` + W5 multipart-gate test), then GREEN `projection.py` (stage 1) / `journal.py` (stage 2) against the FROZEN RED suites.
- next_gate: gm per-stage MERGE gate — runs every fixture GREEN BY EXECUTION itself (esp. concurrent-claimant, 4 crash boundaries, snapshot-cut-atomicity, W5) and diffs test files against the frozen SHAs (66646592b, bc2368c79, da422eaf3).

## next_3_actions
1. **Read BUILD-CHECKPOINT.md, then author stage-3 RED**: `test_snapshot_barrier.py` (snapshot-cut-atomicity per spec §5 barrier: register-before-cut, watermark on processed-complete-line, item_identities[] sidecar completeness, inflight reconciled committed-only) + the W5 multipart-gate RED test (spec §9). Same style as the existing suites; verify RED by ModuleNotFoundError; commit-per-fixture with exact-next-step in the message.
   - first_effect: { kind: "test-run", target: "~/scripts/agent-orchestra/contract/agentevent/tests/", check: "python3 -m pytest contract/agentevent/tests/ -q → ALL suites fail on ModuleNotFoundError (contract.agentevent.projection / .journal / .snapshot intentionally unwritten); zero passes, zero fake-greens" }
2. **GREEN stage 1**: implement `contract/agentevent/projection.py` (NS_AGENTEVENT, derive_event_id, derive_turn_id, project_conversation) until the FROZEN stage-1 suite passes untouched. NEVER edit a frozen test to fit code — a frozen-test change goes to gm for faithfulness re-gate FIRST (binding condition). Then msg gm for the stage-1 merge gate.
3. **Seat duty in parallel**: keep 7373 healthy (restart ONLY via tmux recipe below), answer Shaw's brain asks, and run `tools/regression-matrix.mjs <surface> <trigger>` after any client edit. If the svc dies silently again: fleet DB swaps are self-healed now, but the tmux session itself has been reaped 4+ times — watchdog addition is approved but was still gm-gated at orchestra-builder last I knew; check status.

## decisions
- { text: "GUARD — single master trunk in ~/repos/second-brain, local-only, commit incrementally, never force-push", rationale: "a broken master IS the outage; 4 generations of history" }
- { text: "GUARD — never restart second-brain-svc casually: `tmux kill-session -t second-brain-svc; tmux new-session -d -s second-brain-svc \"cd ~/repos/second-brain && node server.js 2>&1 | tee -a ~/repos/second-brain/state/service.log\"` — server.js changes only; index.html hot-reloads", rationale: "no watchdog covers it; silent outages have burned every generation" }
- { text: "GUARD — verify-before-completion: PNG-read every visual claim; collapse-regression (0 sprites at origin) after ANY client edit; contract checks by EFFECT (curl/pane-grep), never declaration", rationale: "this session alone caught a dead render loop, a false upload failure, and a wrong lock protocol only because of by-effect verification" }
- { text: "GUARD — lane boundary: brain repo + contract/agentevent/ in agent-orchestra. Fleet stores O_RDONLY (tasks.db via node:sqlite readOnly, agent-sessions.json read). The ONE sanctioned write outside: msg_store sends + contract/agentevent commits + .workspace/proposals spec commits", rationale: "flock-managed writers own fleet state; the AgentEvent lane was explicitly Shaw-authorized" }
- { text: "BINDING — RED fixtures frozen at 66646592b/bc2368c79/da422eaf3; changes only through gm re-gate; additions free", rationale: "gm ruling closing the same-seat-builds-GREEN hazard (author tweaking own tests)" }
- { text: "Chat composer NEVER embeds the gateway bearer token client-side — server proxies via lib/chat.js to 127.0.0.1:9091", rationale: "/console is tailnet-exposed; token lives in ~/.config/jarvis/watch-gateway-token, server-side only" }
- { text: "surface-decision skill is MANDATORY for any menu/approval/question to Shaw (native card/AskUserQuestion), never terminal prose", rationale: "standing fleet rule; auto-memory feedback_surface_decisions_to_shaw.md" }
- { text: "gm merge-gate will REJECT in-process SystemExit crash tests — crash fixtures must hard-kill (os._exit/SIGKILL subprocess)", rationale: "SystemExit unwinds finally/__exit__ → flushes state a real crash never flushes; gm-verified lesson" }

## open_loops
- **AgentEvent stage-3 RED not yet authored** (snapshot barrier + W5) — next action 1.
- **GREEN stages 1-5 unbuilt**; stage-2 REQUIRED gm-tracked fixture: live-alias publisher test (provisional turn:null + turn_alias → first-commit re-key) — in BUILD-CHECKPOINT.md, must not drop.
- **Codex semantic capture blocked**: workspace OUT OF CREDITS (spike VERDICT.md Q3 is schema+persistence only). Flagged upward; needs funding or Shaw call.
- **ios-watch-dev coordination (standing)**: msg it SAME-DAY when generated AgentEvent Swift types land in contract/ (codegen.mjs); peer-review its reducer-interface design packet when its congruence fires (path in its msg_58733094); shared acceptance numbering acc1-acc6/acc4b/supersession-rescribe.
- **second-brain-svc watchdog**: Shaw approved via native menu; orchestra-builder drafted the block; was pending gm gate (standing rule for always-on infra). Check whether it ever landed — svc has died silently 4+ times.
- **Brain viz likely next asks**: sparse-traffic legibility in live mode (heat trails / recent-trails toggle — offered to Shaw, unanswered); P4 firehose still deprioritized ("not yet"); ping-pong + decision-arrow flows are demo-proven.
- **Astra plan resets daily** — it's a standing congruence peer; diff-only packets when its quota is low (§10/§11/§12 pattern in the spec).

## file_roots_touched
`~/repos/second-brain/`: public/index.html (composer, convo card/overlay/tether, halos, picker, orbit — ~2100 lines now), server.js (+/api/status,/api/convo,/api/chat/*), lib/{status,chat,convo,collect}.js, tools/{regression-matrix,collapse-regression,shoot-launch}.mjs + results.jsonl, state/work-ledger.jsonl, docs/ (this file, specs, plans).
`~/scripts/agent-orchestra/`: .workspace/proposals/agentevent-replay-semantics-spec.md (REV 2.3), contract/agentevent/{BUILD-CHECKPOINT.md, spike/, tests/}, state/agent-handoffs/second-brain-dev-gen4.readback.md (my own inbound readback, historical).

## hazards
1. **Digest-collapse landmine (eternal #1)**: any forcegraph link accessor triggers the debounced digest zeroing pinned node positions → one-dot graph. Run `tools/regression-matrix.mjs` (or collapse-regression) after EVERY client edit. Related trap THIS session: code inside `init()` called from module-level `animFlashes` throws ReferenceError and silently kills the whole render loop on frame 1 — pulses/halos/tether all freeze while PNGs still look fine (initial render already painted). The `convoTick` hook pattern is the fix; suspect it first if "everything stopped animating".
2. **Frozen-fixture discipline**: your own GREEN code failing a frozen RED test means the CODE is wrong until gm rules otherwise. The temptation to "fix" the test is the exact hazard gm's condition exists to block; gm diffs against the SHAs.
3. **Shared-repo git contention + fleet-store swaps**: agent-orchestra .git is huge and busy — index.lock appears/vanishes constantly; retry with backoff, NEVER delete the lock. tasks.db gets REPLACED (new inode) during fleet repairs — brain server self-heals now (lib/collect.js db()), but any NEW long-lived DB handle you write needs the same inode-check pattern or it silently freezes at the swap.

## canary_questions
- { id: "epoch-slider-1969", question: "Shaw reported the timeline slider snapping to 'December 31st at 7pm'. Explain the full causal chain from a fleet-side maintenance action to that exact on-screen date, and what now prevents recurrence.", source_pointer: "jsonl: 2026-09-04T08:40Z..09:10Z turns" }
- { id: "flip-over-dof", question: "Locking the brain's 'flip-over' rotation required abandoning the first fix attempt. What was structurally wrong with the initial approach (name the mechanism that made it a no-op), and what double change shipped instead?", source_pointer: "jsonl: 2026-09-04, the rotation-lock exchange after the zoom question" }
- { id: "dead-loop-forensics", question: "A UI feature once froze ALL brain animation on frame 1 while screenshots kept looking normal. Walk the forensic chain: the observable that finally exposed it, the scoping mistake underneath, and why headless PNG verification missed it.", source_pointer: "jsonl: 2026-09-02, the min/max-button session's debugging span" }
- { id: "crash-test-unwind", question: "gm rejected one of my crash-boundary test designs on a Python-semantics argument. Reproduce that argument in your own words and state what the harness does now instead.", source_pointer: "jsonl: 2026-09-05T22:00Z region, the faithfulness-verdict processing" }
- { id: "amber-meaning", question: "The status-halo color between green and orange has a precise, Shaw-chosen meaning that differs from what I first proposed. What does it detect, by what mechanism, and which false-positive did tuning have to exclude?", source_pointer: "jsonl: 2026-09-01, the status-glow design questions + the draft-detection fix span" }

```json
{
  "seat": "second-brain-dev",
  "from_generation": 4,
  "authored": "2026-09-06T00:50:00Z",
  "current_goal": "Lane 1 (seat): brain viz shipped+merged (master 5e62088, svc :7373), live-feedback iteration, armed BG-validation seat. Lane 2 (Shaw-direct build): AgentEvent replay-semantics — spec REV 2.3 ratified (DEC-1788642519), RED stages 1+2 faithfulness-passed, SAME lineage builds GREEN under frozen-fixture condition.",
  "phase_state": {
    "plan_ref": "~/scripts/agent-orchestra/.workspace/proposals/agentevent-replay-semantics-spec.md@09e474446 + ~/scripts/agent-orchestra/contract/agentevent/BUILD-CHECKPOINT.md (living resume file, read first)",
    "phase": "brain=SHIPPED/live-iteration; agentevent=stage-3 RED next, then GREEN 1-2 vs frozen suites",
    "next_gate": "gm per-stage merge gate: runs fixtures green BY EXECUTION + diffs tests vs frozen SHAs 66646592b/bc2368c79/da422eaf3"
  },
  "next_3_actions": [
    {
      "action": "AMENDED: stage-3 RED already EXISTS as your own pre-rotation WIP (uncommitted test_snapshot_barrier.py + test_w5_multipart_gate.py, gen4-reviewed faithful) — COMMIT it per-fixture, request gm faithfulness eyeball, then GREEN stage 1. Do not re-author.",
      "first_effect": { "kind": "test-run", "target": "~/scripts/agent-orchestra/contract/agentevent/tests/", "check": "python3 -m pytest contract/agentevent/tests/ -q → all suites RED on ModuleNotFoundError, zero passes" }
    },
    { "action": "GREEN stage 1: contract/agentevent/projection.py until the FROZEN stage-1 suite passes untouched; frozen-test changes only via gm re-gate; then request stage-1 merge gate" },
    { "action": "Seat duty parallel: 7373 health (tmux recipe only), Shaw asks, regression-matrix after client edits; check watchdog-addition status at orchestra-builder" }
  ],
  "decisions": [
    { "text": "GUARD single master trunk, local-only, never force-push", "rationale": "broken master IS the outage" },
    { "text": "GUARD svc restart only via tmux recipe; index.html hot-reloads", "rationale": "no watchdog; silent outages recurrent" },
    { "text": "GUARD verify-before-completion: PNG visual claims, collapse-regression after client edits, by-effect contract checks", "rationale": "caught dead loop/false upload/wrong lock this session" },
    { "text": "GUARD lane: brain repo + contract/agentevent + proposals; fleet stores O_RDONLY", "rationale": "flock writers own fleet state; agentevent lane Shaw-authorized" },
    { "text": "BINDING frozen RED fixtures @66646592b/bc2368c79/da422eaf3 — change only via gm re-gate; additions free", "rationale": "gm ruling enabling same-lineage GREEN" },
    { "text": "gateway bearer token server-side only (lib/chat.js proxy)", "rationale": "/console tailnet-exposed" },
    { "text": "surface-decision skill mandatory for Shaw-facing choices", "rationale": "standing fleet rule" },
    { "text": "crash tests must hard-kill (os._exit/SIGKILL subprocess), never in-process SystemExit", "rationale": "unwind runs finally/__exit__ → cleaner-than-real state; gm rejects" }
  ],
  "open_loops": [
    "stage-3 RED unauthored (snapshot barrier + W5)",
    "GREEN stages 1-5 unbuilt; gm-tracked required stage-2 fixture: live-alias publisher test",
    "codex semantic capture credit-blocked (spike Q3 = schema+persistence only); funding flagged upward",
    "ios-watch-dev: same-day ping when generated Swift types land; peer-review its reducer interface at its congruence; shared acc numbering",
    "second-brain-svc watchdog approved by Shaw, was gm-gated at orchestra-builder — verify landed",
    "brain: sparse-traffic legibility offer to Shaw unanswered; P4 firehose deprioritized",
    "Astra = standing peer, daily quota reset, diff-only packets when low"
  ],
  "file_roots_touched": [
    "~/repos/second-brain/{public/index.html, server.js, lib/, tools/, state/work-ledger.jsonl, docs/}",
    "~/scripts/agent-orchestra/{.workspace/proposals/agentevent-replay-semantics-spec.md, contract/agentevent/}"
  ],
  "hazards": [
    "digest-collapse landmine + init()-scope-vs-module-loop ReferenceError silently kills ALL animation frame 1 (convoTick hook pattern; PNGs still look fine)",
    "frozen-fixture discipline: failing frozen RED = code wrong until gm re-rules; never edit tests to pass",
    "agent-orchestra index.lock contention (retry+backoff, never delete) + fleet DB inode swaps freeze naive cached handles (db() inode-check pattern)"
  ],
  "canary_questions": [
    { "id": "epoch-slider-1969", "question": "Shaw reported the timeline slider snapping to 'December 31st at 7pm'. Explain the full causal chain from a fleet-side maintenance action to that exact on-screen date, and what now prevents recurrence.", "source_pointer": "jsonl: 2026-09-04T08:40Z..09:10Z turns" },
    { "id": "flip-over-dof", "question": "Locking the brain's 'flip-over' rotation required abandoning the first fix attempt. What was structurally wrong with the initial approach (name the mechanism that made it a no-op), and what double change shipped instead?", "source_pointer": "jsonl: 2026-09-04, the rotation-lock exchange after the zoom question" },
    { "id": "dead-loop-forensics", "question": "A UI feature once froze ALL brain animation on frame 1 while screenshots kept looking normal. Walk the forensic chain: the observable that finally exposed it, the scoping mistake underneath, and why headless PNG verification missed it.", "source_pointer": "jsonl: 2026-09-02, the min/max-button session's debugging span" },
    { "id": "crash-test-unwind", "question": "gm rejected one of my crash-boundary test designs on a Python-semantics argument. Reproduce that argument in your own words and state what the harness does now instead.", "source_pointer": "jsonl: 2026-09-05T22:00Z region, the faithfulness-verdict processing" },
    { "id": "amber-meaning", "question": "The status-halo color between green and orange has a precise, Shaw-chosen meaning that differs from what I first proposed. What does it detect, by what mechanism, and which false-positive did tuning have to exclude?", "source_pointer": "jsonl: 2026-09-01, the status-glow design questions + the draft-detection fix span" }
  ]
}
```
