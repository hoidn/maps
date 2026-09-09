// Seeded interaction/visual fuzzing. FILE REPORT_DIR [seed] [steps] [engine] [backend]
import {chromium,firefox,webkit} from '@playwright/test';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
const [file,dir,seedText='73191',stepsText='36',engine='chromium',backend='webgl']=process.argv.slice(2);
if(!file||!dir)throw Error('Usage: FILE REPORT_DIR [seed] [steps] [engine] [backend]');
const bytes=await readFile(file);await mkdir(dir,{recursive:true});
let state=Number(seedText)>>>0;const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296};
const server=createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(bytes)});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await({chromium,firefox,webkit}[engine]).launch();
const report={file:resolve(file),sha256:createHash('sha256').update(bytes).digest('hex'),seed:Number(seedText),engine,browserVersion:browser.version(),backend,deviceScaleFactor:Number(seedText)%2?1:2,screenshotScope:'visible viewport; no capture-induced scroll or resize',actions:[],errors:[],checks:[]};
const auditBundle=(await build({entryPoints:['scripts/release-browser-audit.js'],bundle:true,format:'iife',globalName:'releaseAudit',write:false})).outputFiles[0].text;
const page=await browser.newPage({viewport:{width:1440,height:1200},deviceScaleFactor:report.deviceScaleFactor});
await page.addInitScript({content:auditBundle+';window.releaseAudit=releaseAudit;'});
let watchdog;
function armWatchdog(){clearTimeout(watchdog);watchdog=setTimeout(()=>{report.errors.push({step:report.actions.length,kind:'watchdog',message:'Browser step exceeded 120 seconds'});browser.close().catch(()=>{});},120000);}
page.on('pageerror',e=>report.errors.push({step:report.actions.length,kind:'pageerror',message:e.message}));
page.on('console',m=>{if(m.type()==='error')report.errors.push({step:report.actions.length,kind:'console',message:m.text()})});
async function settled(){
 await page.evaluate(async()=>{
  const frame=()=>new Promise(requestAnimationFrame);
  const idle=async()=>{
   // External resize/scroll can resolve before ResizeObserver delivery. Let
   // those notifications enqueue controller work before awaiting its idle state.
   await frame();await frame();
   do{await mapLayout.whenSettled();await frame();}while(mapLayout.frame||mapLayout.settlePending||mapLayout.settleJob||mapLayout.gestures.size);
  };
  let timer;try{await Promise.race([idle(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Idle completion timeout')),90000)})]);}finally{clearTimeout(timer);}
  if(mapLayout.status!=='ready')throw Error(mapLayout.error||mapLayout.status);
 });
}
async function capture(step){
 const check=await page.evaluate(()=>{const l=mapLayout,r=l.getReport(),v=r.view,finite=Object.values(v).every(Number.isFinite)&&v.w>0&&v.h>0;const painted=l.renderer?.active?l.renderer.paintedView:v;const audit=releaseAudit.collectCompactAudit({policy:l.policy,scene:{},exampleLimit:5});return{paintAudit:{counts:audit.counts,overlaps:audit.overlaps,clipped:audit.clipped,missingRequired:audit.missingRequired,typography:audit.typography},finite,scroll:[scrollX,scrollY],viewport:{width:innerWidth,height:innerHeight},mapRect:l.svg.getBoundingClientRect().toJSON(),status:r.status,error:r.error,view:v,paintedView:painted,paintedCount:l.renderer?.active?l.renderer.painted.length:r.placements.length,backend:r.renderer.active,missingRequired:r.missingRequired,visibleIds:[...l.visibleIds],preparedReasons:l.prepared.reduce((o,a)=>(o[a.eligibleReason||'considered']=(o[a.eligibleReason||'considered']||0)+1,o),{})}});
 report.checks.push({step,...check});if(!check.finite||check.status!=='ready'||check.error)throw Error('Invalid map state');
 if(check.paintedView&&Object.keys(check.view).some(k=>Math.abs(check.view[k]-check.paintedView[k])>1e-6))throw Error('Stale painted camera');
 // Element screenshots may resize the viewport to fit a tall map, which
 // triggers label preparation after the audited state. Capture the actual
 // viewport without scrolling/resizing so pixels and audit share a state.
 await page.screenshot({path:join(dir,`frame-${String(step).padStart(3,'0')}.png`),fullPage:false,timeout:30000});
 if(report.errors.length)throw Error('Browser error captured');
 if(Object.values(check.paintAudit.counts).some(n=>n))throw Error('Independent paint audit findings: '+JSON.stringify(check.paintAudit.counts));
}
try{
 armWatchdog();
 await page.goto(`http://127.0.0.1:${server.address().port}/?renderer=${backend}`,{timeout:120000});await page.evaluate(()=>mapLayout.ready);await page.locator('.map-wrap').scrollIntoViewIfNeeded();await settled();await capture(0);
 const kinds=['zoom','pan','wheel','drag','font','layer','theme','resize','reset','reverse'];
 for(let i=0;i<Number(stepsText);i++){
  armWatchdog();
  const kind=i<kinds.length?kinds[i]:kinds[Math.floor(random()*kinds.length)],a={kind,u:random(),v:random(),w:random()};report.actions.push(a);
  const panBefore=kind==='pan'?await page.evaluate(()=>Object.fromEntries([...(mapLayout.panLayout?.placements||[])].map(([id,p])=>[id,p.candidateId]))):null;
  const rect=await page.locator('#mapsvg').boundingBox(),cx=rect.x+rect.width*(.2+.6*a.u),cy=rect.y+rect.height*(.2+.6*a.v);
  if(kind==='zoom'||kind==='pan'||kind==='reset'||kind==='reverse')await page.evaluate(a=>{const l=mapLayout,W=l.manifest.map.width,H=l.manifest.map.height,old={...l.view},z=a.kind==='reset'?1:a.kind==='pan'?W/old.w:1+a.w*13,w=W/z,h=H/z;let v={x:a.u*(W-w),y:a.v*(H-h),w,h};l.requestView(v);if(a.kind==='reverse'){l.requestView({...old});l.requestView(v)}},a);
  else if(kind==='wheel'){await page.mouse.move(cx,cy);for(let j=0;j<4;j++)await page.mouse.wheel(0,(a.w<.5?-1:1)*(80+j*20));}
  else if(kind==='drag'){await page.mouse.move(cx,cy);await page.mouse.down();await page.waitForTimeout(200);await page.mouse.move(cx+(a.u-.5)*180,cy+(a.v-.5)*150,{steps:6});if(a.w<.35)await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await page.mouse.up();}
  else if(kind==='font')await page.evaluate(v=>mapLayout.setTextScale(v),[1,1.25,1.5][Math.floor(a.u*3)]);
  else if(kind==='layer')await page.evaluate(u=>{const l=mapLayout,keys=Object.keys(l.layers),key=keys[Math.floor(u*keys.length)];l.setLayer(key,!l.layers[key]);const cb=document.querySelector(`[data-layer="no-${key}"]`);if(cb)cb.checked=l.layers[key]},a.u);
  else if(kind==='theme')await page.evaluate(v=>document.documentElement.dataset.theme=v,a.u<.5?'dark':'light');
  else if(kind==='resize'){await page.setViewportSize({width:a.u<.5?430:1440,height:a.v<.5?900:1200});await page.locator('.map-wrap').scrollIntoViewIfNeeded();}
  await settled();
  if(panBefore){const after=await page.evaluate(()=>Object.fromEntries([...(mapLayout.panLayout?.placements||[])].map(([id,p])=>[id,p.candidateId])));for(const [id,candidate] of Object.entries(panBefore))if(after[id]!==candidate)throw Error('Pan changed accepted candidate: '+id);}
  await capture(i+1);
  if(report.errors.length)throw Error('Browser error captured');
 }
 report.status='passed';
}catch(e){await writeFile(join(dir,'failed-input.html'),bytes);report.status='failed';report.failure={step:report.actions.length,message:e.message};await page.screenshot({path:join(dir,'failure.png'),fullPage:false}).catch(()=>{});process.exitCode=1;}
finally{
 clearTimeout(watchdog);
 await writeFile(join(dir,'report.json'),JSON.stringify(report,null,2));
 const frames=report.checks.map(c=>`<figure><img loading="lazy" src="frame-${String(c.step).padStart(3,'0')}.png"><figcaption>Step ${c.step}: ${c.step?report.actions[c.step-1].kind:'initial'} · ${c.paintedCount} labels</figcaption></figure>`).join('');
 await writeFile(join(dir,'contact-sheet.html'),`<!doctype html><meta charset="utf-8"><title>Fuzz seed ${report.seed}</title><style>body{font:14px system-ui}main{display:grid;grid-template-columns:repeat(3,1fr)}figure{margin:8px}img{width:100%;border:1px solid #999}</style><h1>${engine} / ${backend} · seed ${report.seed} · ${report.status}</h1><main>${frames}</main>`);
 console.log(JSON.stringify({status:report.status,seed:report.seed,steps:report.actions.length,errors:report.errors,failure:report.failure,report:join(dir,'report.json')}));await browser.close();await new Promise(r=>server.close(r));
}
