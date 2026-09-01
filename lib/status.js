// status.js — live per-agent work-state resolver ("firing brain" feed).
// States (precedence, first match wins):
//   dead      grey   — no tmux session
//   decision  blue   — pending approval/questionnaire authored by the agent (tasks.db, read-only)
//   working   orange — agent transcript .jsonl appended within WORK_WINDOW_MS (actively working)
//   draft     amber  — typed-but-unsubmitted text sitting in the pane's input box
//   idle      green  — alive and quiet
// Fleet stores are read O_RDONLY only. The one WRITE this module does is to THIS repo's own
// state/work-ledger.jsonl: a line on every transition into/out of `working` (start/stop times).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { AO, db, liveSessions } from './collect.js';

const LEDGER = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'state', 'work-ledger.jsonl');
const WORK_WINDOW_MS = 8000;
const POLL_MS = 3000;

let statusMap = {};            // 'agent:<id>' -> 'dead'|'decision'|'working'|'draft'|'idle'
export function getStatusMap() { return statusMap; }

// agents with a pending approval or questionnaire (the blue set)
function pendingDecisionAgents() {
  const out = new Set(); const d = db(); if (!d) return out;
  try {
    for (const r of d.prepare("SELECT from_agent FROM approval_requests WHERE status='pending' AND discarded_at IS NULL").all()) out.add(r.from_agent);
    for (const r of d.prepare("SELECT from_agent FROM questionnaires WHERE status='pending' AND discarded_at IS NULL").all()) out.add(r.from_agent);
  } catch (e) { console.warn('[status] decision query failed', e.message); }
  return out;
}

// amber: the Claude input box (the `❯ ` line) holds typed, unsubmitted text.
// Best-effort — any capture failure or ambiguity degrades to "not draft".
function paneHasDraft(sess) {
  try {
    const pane = execFileSync('tmux', ['capture-pane', '-p', '-t', sess], { encoding: 'utf8', timeout: 1500 });
    const lines = pane.split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      const m = lines[i].match(/^[❯>]\s(.*\S.*)$/);
      if (m) return true;                      // prompt line with content after it
      if (/^[❯>]\s*$/.test(lines[i])) return false; // empty prompt found first → no draft
    }
  } catch { /* dead pane / tmux hiccup → not draft */ }
  return false;
}

function readSessions() {
  try { return JSON.parse(fs.readFileSync(path.join(AO, 'state/agent-sessions.json'), 'utf8')); }
  catch { return {}; }
}

function resolveAll() {
  const live = liveSessions();
  const sessions = readSessions();
  const blue = pendingDecisionAgents();
  const now = Date.now();
  const next = {};
  for (const [aid, a] of Object.entries(sessions)) {
    const sess = a.tmux_session || aid;
    let s;
    if (!live.has(sess)) s = 'dead';
    else if (blue.has(aid)) s = 'decision';
    else {
      let working = false;
      if (a.conversation_path) {
        try { working = fs.statSync(a.conversation_path).mtimeMs > now - WORK_WINDOW_MS; } catch { /* stale path */ }
      }
      if (working) s = 'working';
      else s = paneHasDraft(sess) ? 'draft' : 'idle';
    }
    next['agent:' + aid] = s;
  }
  return next;
}

function ledgerWrite(agent, state) {
  try { fs.appendFileSync(LEDGER, JSON.stringify({ agent, state, t: new Date().toISOString() }) + '\n'); }
  catch (e) { console.warn('[status] ledger write failed', e.message); }
}

export function startStatusPoller({ onDelta } = {}) {
  const tick = () => {
    try {
      const next = resolveAll();
      const changes = [];
      for (const [id, s] of Object.entries(next)) {
        const prev = statusMap[id];
        if (prev === s) continue;
        changes.push({ id, s });
        const name = id.slice('agent:'.length);
        if (s === 'working') ledgerWrite(name, 'working');
        else if (prev === 'working') ledgerWrite(name, 'done');
      }
      for (const id of Object.keys(statusMap)) if (!(id in next)) changes.push({ id, s: 'dead' });
      statusMap = next;
      if (changes.length && onDelta) onDelta(changes);
    } catch (e) { console.warn('[status] tick failed', e.message); }
  };
  tick();
  const h = setInterval(tick, POLL_MS);
  h.unref?.();
  return h;
}
