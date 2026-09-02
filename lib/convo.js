// lib/convo.js — agent conversation reader for GET /api/convo
// Reads Claude Code transcripts (.jsonl) or falls back to tmux pane capture.
// READ-ONLY: never writes to any fleet state.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const SESSIONS_PATH = '/home/shaw/scripts/agent-orchestra/state/agent-sessions.json';
const TRANSCRIPT_ROOT = '/home/shaw/.claude/projects/';
const TAIL_BYTES = 2 * 1024 * 1024; // 2MB tail read
const MAX_N = 200;

// Truncate a string to maxLen chars; appends … if cut.
function trunc(s, maxLen) {
  if (!s || s.length <= maxLen) return s || '';
  return s.slice(0, maxLen - 1) + '…';
}

// Load agent-sessions.json, return entry for name or null.
function getSession(name) {
  try {
    const raw = fs.readFileSync(SESSIONS_PATH, 'utf8');
    const sessions = JSON.parse(raw);
    return sessions[name] || null;
  } catch {
    return null;
  }
}

// Read the last ~TAIL_BYTES of a file; return array of text lines (dropping the first partial).
function readTail(filePath) {
  const fd = fs.openSync(filePath, 'r');
  try {
    const { size } = fs.fstatSync(fd);
    const readSize = Math.min(TAIL_BYTES, size);
    const offset = size - readSize;
    const buf = Buffer.alloc(readSize);
    fs.readSync(fd, buf, 0, readSize, offset);
    let text = buf.toString('utf8');
    // Drop the first (possibly partial) line unless we read from offset 0
    if (offset > 0) {
      const nl = text.indexOf('\n');
      if (nl !== -1) text = text.slice(nl + 1);
    }
    return text.split('\n');
  } finally {
    fs.closeSync(fd);
  }
}

// Skip-text patterns for user text items that are system noise.
const SKIP_USER_TEXT_PREFIXES = [
  'Base directory for this skill',
  '<system-reminder',
  '[Request interrupted',
];
function isSkipUserText(text) {
  return SKIP_USER_TEXT_PREFIXES.some(p => text.startsWith(p));
}

// Parse Claude Code .jsonl transcript; return events oldest→newest, capped at n.
function parseTranscript(filePath, n) {
  const lines = readTail(filePath);
  const events = [];
  // Map tool_use_id → index in events array (to later attach results)
  const toolEventByUseId = new Map();
  // Last tool event index (fallback for result matching without id)
  let lastToolEventIdx = -1;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let obj;
    try { obj = JSON.parse(trimmed); } catch { continue; }

    // Skip non-message lines
    if (!obj.message) continue;
    const { role, content } = obj.message;
    if (!role) continue;

    // Skip meta/snapshot/system lines by type
    const lineType = obj.type;
    if (lineType && !['user', 'assistant'].includes(lineType)) continue;

    const t = obj.timestamp || undefined;

    if (role === 'assistant') {
      if (!Array.isArray(content)) continue;
      for (const item of content) {
        if (item.type === 'text') {
          const text = (item.text || '').trim();
          if (!text) continue;
          events.push({ t, role: 'assistant', text });
        } else if (item.type === 'tool_use') {
          const toolName = item.name || 'Unknown';
          const inputStr = trunc(JSON.stringify(item.input ?? {}), 120);
          const ev = { t, role: 'tool', tool: { name: toolName, input: inputStr, result: '' } };
          lastToolEventIdx = events.length;
          if (item.id) toolEventByUseId.set(item.id, events.length);
          events.push(ev);
        }
      }
    } else if (role === 'user') {
      if (typeof content === 'string') {
        if (content.trim() && !isSkipUserText(content.trim())) {
          events.push({ t, role: 'user', text: content });
        }
      } else if (Array.isArray(content)) {
        for (const item of content) {
          if (item.type === 'tool_result') {
            // Attach result to the matching tool event
            let targetIdx = -1;
            if (item.tool_use_id && toolEventByUseId.has(item.tool_use_id)) {
              targetIdx = toolEventByUseId.get(item.tool_use_id);
            } else if (lastToolEventIdx >= 0) {
              // fallback: last tool event without a result
              targetIdx = lastToolEventIdx;
            }
            if (targetIdx >= 0) {
              const resultContent = item.content;
              let resultText = '';
              if (typeof resultContent === 'string') {
                resultText = resultContent;
              } else if (Array.isArray(resultContent)) {
                resultText = resultContent
                  .filter(c => c.type === 'text')
                  .map(c => c.text || '')
                  .join('');
              }
              events[targetIdx].tool.result = trunc(resultText, 200);
              // Clear from map so we don't re-use this slot
              if (item.tool_use_id) toolEventByUseId.delete(item.tool_use_id);
              if (targetIdx === lastToolEventIdx) lastToolEventIdx = -1;
            }
          } else if (item.type === 'text') {
            const text = (item.text || '').trim();
            if (text && !isSkipUserText(text)) {
              events.push({ t, role: 'user', text });
            }
          }
        }
      }
    }
  }

  // Return last n events (oldest first within that window)
  return events.slice(-n);
}

// Check if a tmux session is alive.
function tmuxAlive(session) {
  try {
    execFileSync('tmux', ['has-session', '-t', session], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// Capture tmux pane content for a session.
function capturePaneEvents(session) {
  try {
    const raw = execFileSync('tmux', ['capture-pane', '-p', '-t', session, '-S', '-120'], {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
    });
    const lines = raw.split('\n').filter(l => l.trim().length > 0);
    const tail = lines.slice(-60).join('\n');
    if (!tail) return [];
    return [{ role: 'assistant', text: tail }];
  } catch {
    return [];
  }
}

/**
 * agentConvo(name, n) — main export.
 * Returns {agent, source, events} per contract.
 */
export async function agentConvo(name, n = 40) {
  const cap = Math.min(Math.max(parseInt(n, 10) || 40, 1), MAX_N);
  const empty = { agent: name, source: 'none', events: [] };

  let session;
  try {
    session = getSession(name);
  } catch {
    return empty;
  }

  if (!session) return empty;

  // Try transcript path first
  const cp = session.conversation_path;
  if (cp && cp.endsWith('.jsonl') && cp.startsWith(TRANSCRIPT_ROOT)) {
    try {
      const stat = fs.statSync(cp);
      if (stat.isFile()) {
        const events = parseTranscript(cp, cap);
        return { agent: name, source: 'transcript', events };
      }
    } catch {
      // file doesn't exist or unreadable — fall through
    }
  }

  // Try tmux pane fallback
  const sess = session.tmux_session;
  if (sess && tmuxAlive(sess)) {
    const events = capturePaneEvents(sess);
    return { agent: name, source: 'pane', events };
  }

  return empty;
}
