// voice.js — live Arturo voice-request feed for the brain.
// Reads the arturo call journals O_RDONLY (state/voice-calls/*.json) and resolves each
// routed request to (target agent, source surface):
//   target: tool turns carry the agent in input.session_name (inject_message /
//           get_agent_output / kill_agent / spawn_agent); gm_command implies gm.
//   source: per-call surface sidecar (vc_client_<sha1(conv_id)[:12]>.surface.jsonl,
//           device field — the ONLY per-call surface truth today) → fallback to
//           state/arturo/active-surface.json current.device → journal origin.
//           NOTE (honest limit): today ios does NOT distinguish phone vs watch — the
//           fleet-side stamping gap is filed with orchestra-builder; until it lands we
//           report "ios"/"web"/"unknown", never a guessed "phone"/"watch".
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { AO } from './collect.js';

const CALLS = path.join(AO, 'state/voice-calls');
const ACTIVE_SURFACE = path.join(AO, 'state/arturo/active-surface.json');
const POLL_MS = 2000;
const FRESH_CALL_MS = 6 * 3600e3;   // only watch journals touched in the last 6h

// tool -> how to find the target agent
const TARGETED_TOOLS = {
  inject_message: { field: 'session_name', kind: 'voice' },
  gm_command: { fixed: 'gm', kind: 'voice' },
  get_agent_output: { field: 'session_name', kind: 'voice_read' },
  spawn_agent: { field: 'session_name', kind: 'voice' },
  kill_agent: { field: 'session_name', kind: 'voice' },
};

const normTarget = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, '-');

function readJSON(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } }

function sidecarFor(convId) {
  if (!convId) return null;
  const h = crypto.createHash('sha1').update(String(convId)).digest('hex').slice(0, 12);
  return path.join(CALLS, `vc_client_${h}.surface.jsonl`);
}

// device for a call: sidecar (per-call truth) → active-surface current → origin label
function resolveDevice(call) {
  const sc = sidecarFor(call.conv_id);
  if (sc && fs.existsSync(sc)) {
    try {
      const lines = fs.readFileSync(sc, 'utf8').trim().split('\n');
      for (let i = lines.length - 1; i >= 0; i--) {
        const d = JSON.parse(lines[i]);
        if (d.device) return { device: d.device, source: 'sidecar' };
      }
    } catch {}
  }
  const act = readJSON(ACTIVE_SURFACE);
  if (act && act.current && act.current.device) {
    // only trust the active surface as a proxy if it was touched within the call window
    const age = Date.now() / 1000 - (act.current.updated_at || 0);
    if (age < 3600) return { device: act.current.device, source: 'active-surface' };
  }
  if (call.origin === 'funnel') return { device: 'unknown', source: 'origin-funnel' };
  return { device: call.origin || 'unknown', source: 'origin' };
}

// per-journal high-water of processed turns (by file path)
const seen = new Map();   // path -> turn count already emitted
let primed = false;       // first tick: record positions, emit nothing (no replay-storm on restart)

export function startVoicePoller({ onRequest } = {}) {
  const tick = () => {
    try {
      if (!fs.existsSync(CALLS)) return;
      const now = Date.now();
      for (const f of fs.readdirSync(CALLS)) {
        if (!f.endsWith('.json') || f.endsWith('.surface.jsonl')) continue;
        const p = path.join(CALLS, f);
        let st; try { st = fs.statSync(p); } catch { continue; }
        if (now - st.mtimeMs > FRESH_CALL_MS) continue;
        const call = readJSON(p); if (!call || !Array.isArray(call.turns)) continue;
        const prev = seen.get(p) ?? 0;
        seen.set(p, call.turns.length);
        if (primed === false) continue;            // priming pass records positions only
        if (call.turns.length <= prev) continue;
        const dev = resolveDevice(call);
        for (const t of call.turns.slice(prev)) {
          if (t.role !== 'tool') continue;
          const spec = TARGETED_TOOLS[t.tool]; if (!spec) continue;
          const target = spec.fixed || normTarget((t.input || {})[spec.field]);
          if (!target) continue;
          onRequest && onRequest({
            target, kind: spec.kind, tool: t.tool,
            device: dev.device, deviceSource: dev.source,
            call: call.call_id || f.replace(/\.json$/, ''),
            summary: t.tool === 'inject_message'
              ? String((t.input || {}).message || '').slice(0, 80)
              : t.tool,
            ts: t.ts ? new Date(t.ts * 1000).toISOString() : new Date().toISOString(),
          });
        }
      }
      primed = true;
    } catch (e) { console.warn('[voice] tick failed', e.message); }
  };
  tick();          // priming pass
  primed = true;
  const h = setInterval(tick, POLL_MS);
  h.unref?.();
  return h;
}
