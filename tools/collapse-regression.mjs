// Collapse-landmine regression: after any client edit, every digest trigger must leave
// 0 node sprites at the origin (see hazard #1 in docs/HANDOFF_second-brain-dev-next.md).
import puppeteer from '/home/shaw/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js'
const url=process.argv[2]||'http://127.0.0.1:7373/brain'
const b=await puppeteer.launch({executablePath:'/usr/bin/chromium-browser',headless:'new',
  args:['--no-sandbox','--disable-gpu','--use-gl=angle','--use-angle=swiftshader','--window-size=1280,800']})
const p=await b.newPage(); await p.setViewport({width:1280,height:800})
const errs=[]; p.on('pageerror',e=>errs.push(e.message))
await p.goto(url,{waitUntil:'domcontentloaded',timeout:30000})
await new Promise(r=>setTimeout(r,7000))
const census=()=>p.evaluate(()=>{
  const B=window.__brain; let atOrigin=0,pos=0
  for(const n of B.DATA.nodes){ if(!n.__obj) continue
    const q=n.__obj.position; if(Math.abs(q.x)<0.001&&Math.abs(q.y)<0.001&&Math.abs(q.z)<0.001) atOrigin++; else pos++ }
  return {atOrigin,pos}
})
const out={}
out.baseline=await census()
await p.evaluate(()=>{ window.__controls&&(window.__controls.autoRotate=false)
  document.getElementById('scr-range').value=300
  document.getElementById('scr-range').dispatchEvent(new Event('input')) })
await new Promise(r=>setTimeout(r,800)); out.afterSeek=await census()
await p.evaluate(()=>document.getElementById('scr-toggle').click())
await new Promise(r=>setTimeout(r,1500))
await p.evaluate(()=>document.getElementById('scr-toggle').click())
out.afterPlay=await census()
await p.evaluate(()=>document.getElementById('scr-live').click())
await new Promise(r=>setTimeout(r,800)); out.afterLive=await census()
out.iso=await p.evaluate(async()=>{
  const B=window.__brain
  const t=B.DATA.nodes.find(n=>n.kind==='agent'&&n.__obj)
  B.focusOn(t); await new Promise(r=>setTimeout(r,700))
  let atOrigin=0; for(const n of B.DATA.nodes){ if(!n.__obj) continue
    const q=n.__obj.position; if(Math.abs(q.x)<0.001&&Math.abs(q.y)<0.001&&Math.abs(q.z)<0.001) atOrigin++ }
  const focused=atOrigin
  B.clearFocus(); await new Promise(r=>setTimeout(r,500))
  atOrigin=0; for(const n of B.DATA.nodes){ if(!n.__obj) continue
    const q=n.__obj.position; if(Math.abs(q.x)<0.001&&Math.abs(q.y)<0.001&&Math.abs(q.z)<0.001) atOrigin++ }
  return {afterFocus:focused, afterClear:atOrigin}
})
console.log(JSON.stringify(out,null,1))
console.log('ERRORS:',JSON.stringify(errs))
await b.close()
const bad=[out.baseline,out.afterSeek,out.afterPlay,out.afterLive].some(c=>c.atOrigin>0)||out.iso.afterFocus>0||out.iso.afterClear>0
process.exit(bad?1:0)
