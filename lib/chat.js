// chat.js — server-side proxy to the canonical OrchestraOS watch gateway (127.0.0.1:9091).
// The brain client NEVER sees the bearer token (the /console surface is tailnet-exposed);
// this module reads it and forwards. Parity by construction: same gateway, same verified-inject
// gates (detector state / composer text / active-turn spinner), same 409+force semantics, same
// frozen attachment marker grammar as the OrchestraOS web app and iOS.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { AO } from './collect.js';

const GW = { host: '127.0.0.1', port: 9091 };
let _token = null;
function token() {
  if (_token) return _token;
  try { _token = fs.readFileSync(path.join(process.env.HOME || '/home/shaw', '.config/jarvis/watch-gateway-token'), 'utf8').trim(); }
  catch { _token = null; }
  return _token;
}

// agent name -> tmux session (agent-sessions.json, O_RDONLY)
export function sessionFor(agent) {
  try {
    const s = JSON.parse(fs.readFileSync(path.join(AO, 'state/agent-sessions.json'), 'utf8'));
    const a = s[agent];
    return (a && (a.tmux_session || agent)) || agent;
  } catch { return agent; }
}

// JSON round-trip to the gateway. Resolves {status, body} — gateway 4xx/5xx are DATA, not errors.
export function gwJson(method, gwPath, payload) {
  return new Promise((resolve) => {
    const t = token();
    if (!t) return resolve({ status: 503, body: { error: 'gateway token unavailable' } });
    const data = payload ? Buffer.from(JSON.stringify(payload)) : null;
    const req = http.request({
      ...GW, path: gwPath, method, timeout: 30000,
      headers: {
        authorization: `Bearer ${t}`,
        ...(data ? { 'content-type': 'application/json', 'content-length': data.length } : {}),
      },
    }, (r) => {
      let buf = '';
      r.on('data', (c) => buf += c);
      r.on('end', () => { let b; try { b = JSON.parse(buf); } catch { b = { raw: buf.slice(0, 500) }; } resolve({ status: r.statusCode, body: b }); });
    });
    req.on('timeout', () => { req.destroy(); resolve({ status: 504, body: { error: 'gateway timeout' } }); });
    req.on('error', (e) => resolve({ status: 502, body: { error: 'gateway unreachable: ' + e.message } }));
    if (data) req.write(data);
    req.end();
  });
}

// Stream a multipart upload through to the gateway untouched (content-type boundary preserved).
export function gwUpload(clientReq) {
  return new Promise((resolve) => {
    const t = token();
    if (!t) return resolve({ status: 503, body: { error: 'gateway token unavailable' } });
    const req = http.request({
      ...GW, path: '/upload', method: 'POST', timeout: 300000,
      headers: {
        authorization: `Bearer ${t}`,
        'content-type': clientReq.headers['content-type'] || 'application/octet-stream',
        ...(clientReq.headers['content-length'] ? { 'content-length': clientReq.headers['content-length'] } : {}),
      },
    }, (r) => {
      let buf = '';
      r.on('data', (c) => buf += c);
      r.on('end', () => { let b; try { b = JSON.parse(buf); } catch { b = { raw: buf.slice(0, 500) }; } resolve({ status: r.statusCode, body: b }); });
    });
    req.on('timeout', () => { req.destroy(); resolve({ status: 504, body: { error: 'gateway timeout' } }); });
    req.on('error', (e) => resolve({ status: 502, body: { error: 'gateway unreachable: ' + e.message } }));
    clientReq.pipe(req);
  });
}

export function readJsonBody(req, cb) {
  let buf = '';
  req.on('data', (c) => { buf += c; if (buf.length > 1e6) req.destroy(); });
  req.on('end', () => { let b; try { b = JSON.parse(buf || '{}'); } catch { b = null; } cb(b); });
}
