// regression-matrix.mjs — one CELL of the surface×trigger regression matrix.
//   node tools/regression-matrix.mjs <surface> <trigger>
//   surface ∈ field | brain | console      trigger ∈ seek | play | live | isolate | focus | grow | scrubber | tap-picker
// Runs the trigger against the LIVE server (:7373), asserts trigger-specific behavior PLUS the
// universal collapse invariant (0 node sprites at origin — hazard #1), prints one JSON verdict,
// exit 0 on pass / 1 on fail. The matrix runner appends the verdict to
// tools/regression-matrix.results.jsonl (the successor-resume checkpoint).
import puppeteer from '/home/shaw/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';

const [surface, trigger] = process.argv.slice(2);
const URLS = { field: '/field', brain: '/brain', console: '/console' };
if (!URLS[surface] || !trigger) { console.error('usage: regression-matrix.mjs <field|brain|console> <trigger>'); process.exit(2); }

const b = await puppeteer.launch({ executablePath: '/usr/bin/chromium-browser', headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--use-gl=angle', '--use-angle=swiftshader', '--window-size=1280,800'] });
const p = await b.newPage(); await p.setViewport({ width: 1280, height: 800 });
const errs = []; p.on('pageerror', e => errs.push(e.message.slice(0, 120)));

async function main(){
const verdict = (pass, notes) => {
  console.log(JSON.stringify({ surface, trigger, pass, notes, ts: new Date().toISOString() }));
  return b.close().then(() => process.exit(pass ? 0 : 1));
};

try {
  await p.goto(`http://127.0.0.1:7373${URLS[surface]}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await p.waitForFunction(() => window.__brain && window.__brain.DATA.nodes.length > 0, { timeout: 30000 });
  await new Promise(r => setTimeout(r, 6000));   // settle: pin/layout/loader
  await p.evaluate(() => { window.__controls && (window.__controls.autoRotate = false); });

  const census = () => p.evaluate(() => {
    const B = window.__brain; let atOrigin = 0, pos = 0;
    for (const n of B.DATA.nodes) { if (!n.__obj) continue;
      const q = n.__obj.position;
      if (Math.abs(q.x) < 0.001 && Math.abs(q.y) < 0.001 && Math.abs(q.z) < 0.001) atOrigin++; else pos++; }
    return { atOrigin, pos };
  });
  const c0 = await census();
  if (c0.pos < 100) return verdict(false, `graph too small at start: ${JSON.stringify(c0)}`);

  let notes = '';
  if (trigger === 'seek') {
    await p.evaluate(async () => { const r = document.getElementById('scr-range');
      r.value = 300; r.dispatchEvent(new Event('input')); await new Promise(q => setTimeout(q, 700));
      r.value = 700; r.dispatchEvent(new Event('input')); });
    await new Promise(r => setTimeout(r, 800));
    const t = await p.evaluate(() => document.getElementById('scr-time').textContent);
    if (t === 'live' || /Dec 31|1969/.test(t)) return verdict(false, `seek time label wrong: "${t}"`);
    notes = `time="${t}"`;
  } else if (trigger === 'play') {
    const r = await p.evaluate(async () => {
      const B = window.__brain, tog = document.getElementById('scr-toggle');
      document.getElementById('scr-range').value = 100;
      document.getElementById('scr-range').dispatchEvent(new Event('input'));
      await new Promise(q => setTimeout(q, 400));
      tog.click(); await new Promise(q => setTimeout(q, 400));
      const cur0 = B.scr.cursor, i0 = B.scr.idx;
      await new Promise(q => setTimeout(q, 2200));
      // the ASI-bug failure mode was a FROZEN cursor while the button showed playing —
      // assert the clock advances (idx only moves when events are crossed; traffic is bursty)
      const playing = B.scr.playing, moved = B.scr.cursor > cur0; tog.click();
      return { playing, moved, dCursorMs: Math.round(B.scr.cursor - cur0), dIdx: B.scr.idx - i0 };
    });
    if (!r.playing || !r.moved) return verdict(false, `play frozen: ${JSON.stringify(r)}`);
    notes = `cursor +${r.dCursorMs}ms, idx +${r.dIdx}`;
  } else if (trigger === 'live') {
    const r = await p.evaluate(async () => {
      document.getElementById('scr-range').value = 200;
      document.getElementById('scr-range').dispatchEvent(new Event('input'));
      await new Promise(q => setTimeout(q, 500));
      document.getElementById('scr-live').click(); await new Promise(q => setTimeout(q, 500));
      return { live: window.__brain.scr.live, label: document.getElementById('scr-time').textContent };
    });
    if (!r.live || r.label !== 'live') return verdict(false, `LIVE did not restore: ${JSON.stringify(r)}`);
    notes = 'returned to live';
  } else if (trigger === 'isolate') {
    const r = await p.evaluate(async () => {
      const row = document.querySelector('#legend-rows .lg'); if (!row) return { err: 'no legend row' };
      row.click(); await new Promise(q => setTimeout(q, 700));
      const B = window.__brain;
      const dimmed = B.DATA.nodes.filter(n => n.__mat && n.__mat.opacity < 0.35).length;
      row.click(); await new Promise(q => setTimeout(q, 500));   // un-isolate
      return { cluster: row.dataset.cluster, dimmed };
    });
    if (r.err || r.dimmed < 10) return verdict(false, `isolate did not dim: ${JSON.stringify(r)}`);
    notes = `${r.cluster}: ${r.dimmed} dimmed`;
  } else if (trigger === 'focus') {
    const r = await p.evaluate(async () => {
      const B = window.__brain;
      const n = B.DATA.nodes.find(x => x.kind === 'agent' && x.__obj && x.__obj.visible);
      B.focusOn(n); await new Promise(q => setTimeout(q, 900));
      const focused = B.focusId === n.id;
      B.clearFocus(); await new Promise(q => setTimeout(q, 500));
      return { id: n.id, focused, cleared: !B.focusId };
    });
    if (!r.focused || !r.cleared) return verdict(false, `focus/clear failed: ${JSON.stringify(r)}`);
    notes = `focused ${r.id}`;
  } else if (trigger === 'grow') {
    const r = await p.evaluate(async () => {
      const B = window.__brain, g = document.getElementById('scr-grow');
      if (!g) return { err: 'no grow button' };
      g.click(); await new Promise(q => setTimeout(q, 2200));
      const unborn = B.DATA.nodes.filter(n => n.__born === false).length;
      const hidden = B.DATA.nodes.filter(n => n.kind === 'agent' && n.__obj && !n.__obj.visible).length;
      const on = g.classList.contains('on'), hours = B.scr.hours;
      document.getElementById('scr-live').click(); await new Promise(q => setTimeout(q, 700));
      const restored = B.DATA.nodes.filter(n => n.__born === false).length;
      return { unborn, hidden, on, hours, restored };
    });
    if (r.err || !r.on || r.unborn < 100 || r.restored !== 0) return verdict(false, `grow wrong: ${JSON.stringify(r)}`);
    notes = `unborn=${r.unborn} hours=${r.hours} restored`;
  } else if (trigger === 'scrubber') {
    const r = await p.evaluate(async () => {
      const B = window.__brain, w = document.getElementById('scr-win');
      w.value = '24'; w.dispatchEvent(new Event('change'));
      await new Promise(q => setTimeout(q, 2500));
      const out = { hours: B.scr.hours, events: B.scr.events.length, t0ok: B.scr.t0 > 1e12 };
      w.value = '6'; w.dispatchEvent(new Event('change')); await new Promise(q => setTimeout(q, 1500));
      return out;
    });
    if (r.hours !== 24 || r.events < 1 || !r.t0ok) return verdict(false, `window change wrong: ${JSON.stringify(r)}`);
    notes = `24h: ${r.events} events`;
  } else if (trigger === 'tap-picker') {
    // project a visible agent, real-mouse tap it, expect focus (all surfaces run the picker now)
    const pt = await p.evaluate(() => {
      const B = window.__brain, cam = B.Graph.camera(); cam.updateMatrixWorld();
      const rect = document.querySelector('canvas').getBoundingClientRect();
      const MV = cam.matrixWorldInverse.elements, P = cam.projectionMatrix.elements;
      const mul = (m, x, y, z, w) => [m[0]*x+m[4]*y+m[8]*z+m[12]*w, m[1]*x+m[5]*y+m[9]*z+m[13]*w, m[2]*x+m[6]*y+m[10]*z+m[14]*w, m[3]*x+m[7]*y+m[11]*z+m[15]*w];
      for (const n of B.DATA.nodes) { if (n.kind !== 'agent' || !n.__obj || !n.__obj.visible) continue;
        const e = mul(MV, n.x, n.y, n.z, 1), c = mul(P, ...e); if (c[3] <= 0) continue;
        const nx = c[0]/c[3], ny = c[1]/c[3]; if (Math.abs(nx) > 0.8 || Math.abs(ny) > 0.8) continue;
        return { x: (nx*0.5+0.5)*rect.width+rect.left, y: (-ny*0.5+0.5)*rect.height+rect.top, id: n.id }; }
      return null;
    });
    if (!pt) return verdict(false, 'no projectable agent found');
    await p.mouse.move(pt.x, pt.y); await p.mouse.down(); await p.mouse.up();
    await new Promise(r => setTimeout(r, 1600));
    const r = await p.evaluate(() => ({ focus: window.__brain.focusId,
      card: document.getElementById('convocard')?.classList.contains('on') || false }));
    if (!r.focus) return verdict(false, `tap did not select (aimed ${pt.id}): ${JSON.stringify(r)}`);
    notes = `aimed ${pt.id} → focused ${r.focus}${r.card ? ' +card' : ''}`;
    await p.evaluate(() => { window.__brain.clearFocus(); window.__convo && window.__convo.close(); });
  } else return verdict(false, `unknown trigger ${trigger}`);

  const c1 = await census();
  if (c1.atOrigin > 0) return verdict(false, `COLLAPSE: ${c1.atOrigin} at origin after ${trigger}`);
  if (errs.length) return verdict(false, `pageerrors: ${errs.join(' | ')}`);
  return verdict(true, `${notes} · census ${c1.pos} pos / 0 at origin`);
} catch (e) {
  return verdict(false, `harness error: ${String(e).slice(0, 160)}`);
}
}
await main();
