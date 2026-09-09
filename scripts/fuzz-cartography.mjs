import {parseHeadless,collectGraphics} from './browser-profile.mjs';
// Seeded interaction/visual fuzzing. FILE REPORT_DIR [seed] [steps] [engine] [backend]
import {chromium,firefox,webkit} from '@playwright/test';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {pathToFileURL} from 'node:url';

// Serialized into the page: normalize CSS footprints with the same meet camera
// transform used by the renderer, including document scrolling and letterboxing.
export function snapshotPan(){
 const l=mapLayout,r=l.svg.getBoundingClientRect(),v=l.view,s=Math.min(r.width/v.w,r.height/v.h),
  tx=r.x+(r.width-v.w*s)/2-v.x*s,ty=r.y+(r.height-v.h*s)/2-v.y*s;
 const placements={};
 for(const p of l.result.placements){
  if(!l.visibleIds.has(p.id))continue;
  placements[p.id]={candidateId:p.candidateId,application:p.application??null,textHTML:p.textHTML??null,
   paintTextHTML:l.elements.get(p.id)?.querySelector('text')?.innerHTML??null,
   geometry:[p.footprint.bounds,...p.footprint.parts].map(b=>[(b.x-tx)/s,(b.y-ty)/s,b.width/s,b.height/s])};
 }
 return {scale:s,placements};
}
export function assertStablePan(before,after){
 // 0.05 CSS px absorbs repeated affine floating-point conversion, while staying
 // below the existing 0.125 px backend rounding reserve and far below a pixel.
 const toleranceCssPx=.05;
 if(!Number.isFinite(before.scale)||!Number.isFinite(after.scale)||Math.abs(before.scale-after.scale)>1e-8)throw Error('Pan changed camera scale');
 let shared=0;
 for(const [id,a] of Object.entries(before.placements)){
  const b=after.placements[id];if(!b)continue;shared++;
  for(const key of ['candidateId','application','textHTML','paintTextHTML'])if(JSON.stringify(a[key])!==JSON.stringify(b[key]))throw Error('Pan changed '+key+': '+id);
  if(a.geometry.length!==b.geometry.length)throw Error('Pan changed geometry parts: '+id);
  for(let i=0;i<a.geometry.length;i++)for(let j=0;j<4;j++)if(!Number.isFinite(a.geometry[i][j])||!Number.isFinite(b.geometry[i][j])||Math.abs(a.geometry[i][j]-b.geometry[i][j])*before.scale>toleranceCssPx)throw Error('Pan changed geometry: '+id);
 }
 return {shared,toleranceCssPx};
}

export async function lifecycleBurst(page,a){
 await page.locator('.map-wrap').scrollIntoViewIfNeeded();
 // Hit a visible SVG point, not an overlaid control or an offscreen map center.
 const point=await page.evaluate(()=>{const svg=mapLayout.svg,r=svg.getBoundingClientRect();for(const u of [.5,.2,.8])for(const v of [.5,.7,.3]){const x=Math.max(0,r.left)+u*(Math.min(innerWidth,r.right)-Math.max(0,r.left)),y=Math.max(0,r.top)+v*(Math.min(innerHeight,r.bottom)-Math.max(0,r.top));if(svg.contains(document.elementFromPoint(x,y)))return{x,y};}throw Error('No visible map point for interruption gesture');});
 await page.mouse.move(point.x,point.y);await page.mouse.down();
 try{
  a.burst=await page.evaluate(a=>{
   const l=mapLayout;if(!l.gestures.size)throw Error('Interruption burst did not hold a map gesture');
   const keys=Object.keys(l.layers),layer=keys[Math.floor(a.u*keys.length)],theme=document.documentElement.dataset.theme==='dark'?'light':'dark',font=l.textScale===1.5?1:1.5;
   const old={...l.view},w=old.w*.97,h=old.h*.97;
   l.requestView({...old,w,h});document.documentElement.dataset.theme=theme;l.setTextScale(font);l.setLayer(layer,!l.layers[layer]);
   const cb=document.querySelector(`[data-layer="no-${layer}"]`);if(cb)cb.checked=l.layers[layer];
   return {layer,enabled:l.layers[layer],theme,font,view:{...l.view},gestures:l.gestures.size,pending:!!(l.frame||l.settlePending||l.settleJob)};
  },a);
  const previous=page.viewportSize(),target={width:previous.width===430?1440:430,height:a.v<.5?900:1200};
  await page.setViewportSize(target);a.burst.viewport=target;
  a.burst.afterResize=await page.evaluate(async()=>{await new Promise(requestAnimationFrame);return {gestures:mapLayout.gestures.size,pending:!!(mapLayout.frame||mapLayout.settlePending||mapLayout.settleJob)};});
 }finally{await page.mouse.up();}
}

export async function scrollAwayBack(page,a){
 a.scroll=await page.evaluate(async()=>{
  const before={x:scrollX,y:scrollY},limit=Math.max(0,document.documentElement.scrollHeight-innerHeight),target=before.y>limit/2?0:limit;
  // Force a pending preparation before leaving its screen coordinate frame.
  const l=mapLayout;l.setTextScale(l.textScale);const pending=!!(l.frame||l.settlePending||l.settleJob);
  scrollTo(before.x,target);await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);
  const away={x:scrollX,y:scrollY};scrollTo(before.x,before.y);await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);
  return {before,away,returned:{x:scrollX,y:scrollY},pending,moved:away.y!==before.y};
 });
 if(Math.abs(a.scroll.returned.x-a.scroll.before.x)>1||Math.abs(a.scroll.returned.y-a.scroll.before.y)>1)throw Error('Scroll return did not restore document position');
}

async function main(){
const [file,dir,seedText='73191',stepsText='36',engine='chromium',backend='webgl']=process.argv.slice(2);
if(!file||!dir)throw Error('Usage: FILE REPORT_DIR [seed] [steps] [engine] [backend] [--headed|--headless]');
const bytes=await readFile(file);await mkdir(dir,{recursive:true});
let state=Number(seedText)>>>0;const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296};
const server=createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(bytes)});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const headless=parseHeadless(process.argv.slice(8),{});
const browser=await({chromium,firefox,webkit}[engine]).launch({headless}),graphics=await collectGraphics(browser,engine);
const report={harnessVersion:2,file:resolve(file),sha256:createHash('sha256').update(bytes).digest('hex'),seed:Number(seedText),engine,browserVersion:browser.version(),headless,graphics,backend,deviceScaleFactor:Number(seedText)%2?1:2,screenshotScope:'visible viewport; no capture-induced scroll or resize',actions:[],errors:[],checks:[]};
const auditBundle=(await build({entryPoints:['scripts/release-browser-audit.js'],bundle:true,format:'iife',globalName:'releaseAudit',write:false})).outputFiles[0].text;
const page=await browser.newPage({viewport:{width:1440,height:1200},deviceScaleFactor:report.deviceScaleFactor});
await page.addInitScript({content:auditBundle+';window.releaseAudit=releaseAudit;'});
await page.addInitScript(()=>{window.fuzzCaptureState=()=>{
 const l=mapLayout,r=l.renderer,rect=l.svg.getBoundingClientRect();
 return JSON.stringify({status:l.status,error:l.error,fontStatus:document.fonts.status,fontGeneration:l.fontGeneration,
  revision:l.revision,view:l.view,layers:l.layers,textScale:l.textScale,theme:document.documentElement.dataset.theme,mapRect:[rect.x,rect.y,rect.width,rect.height],scroll:[scrollX,scrollY],viewport:[innerWidth,innerHeight],
  frame:!!l.frame,settlePending:!!l.settlePending,settleJob:!!l.settleJob,gestures:l.gestures.size,
  refreshPending:r?.refreshPending,generation:r?.generation,sprites:r?.labels.size,
  painted:r?.painted.map(p=>p.id),visible:[...l.visibleIds]});
};});
let watchdog;
function armWatchdog(){clearTimeout(watchdog);watchdog=setTimeout(()=>{report.errors.push({step:report.actions.length,kind:'watchdog',message:'Browser step exceeded 120 seconds'});browser.close().catch(()=>{});},120000);}
page.on('pageerror',e=>report.errors.push({step:report.actions.length,kind:'pageerror',message:e.message}));
page.on('console',m=>{if(m.type()==='error')report.errors.push({step:report.actions.length,kind:'console',message:m.text()})});
async function settled(){
 await page.evaluate(async()=>{
  const frame=()=>new Promise(requestAnimationFrame);
  const idle=async()=>{
   await releaseAudit.loadAuditFonts(mapLayout.policy.fontFamilies);
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
 // Font measurement and asynchronous screenshots can themselves start font
 // recovery. Retain only a capture whose audited generation survives the shot.
 for(let attempt=1;attempt<=10;attempt++){
  await settled();
 const check=await page.evaluate(()=>{const stamp=fuzzCaptureState(),l=mapLayout,r=l.getReport(),v=r.view,finite=Object.values(v).every(Number.isFinite)&&v.w>0&&v.h>0;const painted=l.renderer?.active?l.renderer.paintedView:v;const audit=releaseAudit.collectCompactAudit({policy:l.policy,scene:{},exampleLimit:5});return{stamp,pointNameCoverage:audit.pointNameCoverage,paintAudit:{counts:audit.counts,overlaps:audit.overlaps,clipped:audit.clipped,missingRequired:audit.missingRequired,typography:audit.typography},finite,scroll:[scrollX,scrollY],viewport:{width:innerWidth,height:innerHeight},mapRect:l.svg.getBoundingClientRect().toJSON(),status:r.status,error:r.error,view:v,paintedView:painted,paintedCount:l.renderer?.active?l.renderer.painted.length:r.placements.length,backend:r.renderer.active,missingRequired:r.missingRequired,visibleIds:[...l.visibleIds],preparedReasons:l.prepared.reduce((o,a)=>(o[a.eligibleReason||'considered']=(o[a.eligibleReason||'considered']||0)+1,o),{})}});
  if(check.stamp!==await page.evaluate(()=>fuzzCaptureState()))continue;
  await page.screenshot({path:join(dir,`frame-${String(step).padStart(3,'0')}.png`),fullPage:false,timeout:30000});
  if(report.errors.length)throw Error('Browser error captured');
  if(check.stamp!==await page.evaluate(()=>fuzzCaptureState()))continue;
  delete check.stamp;report.checks.push({step,captureAttempts:attempt,...check});
  if(!check.finite||check.status!=='ready'||check.error)throw Error('Invalid map state');
  if(check.paintedView&&Object.keys(check.view).some(k=>Math.abs(check.view[k]-check.paintedView[k])>1e-6))throw Error('Stale painted camera');
  if(Object.values(check.paintAudit.counts).some(n=>n))throw Error('Independent paint audit findings: '+JSON.stringify(check.paintAudit.counts));
  return;
 }
 throw Error('Visual capture never stabilized across audit and screenshot');
}

try{
 armWatchdog();
 await page.goto(`http://127.0.0.1:${server.address().port}/?renderer=${backend}`,{timeout:120000});await page.evaluate(()=>mapLayout.ready);await page.locator('.map-wrap').scrollIntoViewIfNeeded();await settled();await capture(0);
 const kinds=['zoom','pan','wheel','drag','font','layer','theme','resize','reset','reverse','interrupt','scroll'];
 for(let i=0;i<Number(stepsText);i++){
  armWatchdog();
  const kind=i<kinds.length?kinds[i]:kinds[Math.floor(random()*kinds.length)],a={kind,u:random(),v:random(),w:random()};report.actions.push(a);
  const panBefore=kind==='pan'?await page.evaluate(snapshotPan):null;
  const rect=await page.locator('#mapsvg').boundingBox(),cx=rect.x+rect.width*(.2+.6*a.u),cy=rect.y+rect.height*(.2+.6*a.v);
  if(kind==='zoom'||kind==='pan'||kind==='reset'||kind==='reverse')await page.evaluate(a=>{const l=mapLayout,W=l.manifest.map.width,H=l.manifest.map.height,old={...l.view},z=a.kind==='reset'?1:a.kind==='pan'?W/old.w:1+a.w*13,w=W/z,h=H/z;let v={x:a.u*(W-w),y:a.v*(H-h),w,h};l.requestView(v);if(a.kind==='reverse'){l.requestView({...old});l.requestView(v)}},a);
  else if(kind==='wheel'){await page.mouse.move(cx,cy);for(let j=0;j<4;j++)await page.mouse.wheel(0,(a.w<.5?-1:1)*(80+j*20));}
  else if(kind==='drag'){await page.mouse.move(cx,cy);await page.mouse.down();await page.waitForTimeout(200);await page.mouse.move(cx+(a.u-.5)*180,cy+(a.v-.5)*150,{steps:6});if(a.w<.35)await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await page.mouse.up();}
  else if(kind==='font')await page.evaluate(v=>mapLayout.setTextScale(v),[1,1.25,1.5][Math.floor(a.u*3)]);
  else if(kind==='layer')await page.evaluate(u=>{const l=mapLayout,keys=Object.keys(l.layers),key=keys[Math.floor(u*keys.length)];l.setLayer(key,!l.layers[key]);const cb=document.querySelector(`[data-layer="no-${key}"]`);if(cb)cb.checked=l.layers[key]},a.u);
  else if(kind==='theme')await page.evaluate(v=>document.documentElement.dataset.theme=v,a.u<.5?'dark':'light');
  else if(kind==='resize'){await page.setViewportSize({width:a.u<.5?430:1440,height:a.v<.5?900:1200});await page.locator('.map-wrap').scrollIntoViewIfNeeded();}
  else if(kind==='interrupt')await lifecycleBurst(page,a);
  else if(kind==='scroll')await scrollAwayBack(page,a);
  await settled();
  if(panBefore)a.panStability=assertStablePan(panBefore,await page.evaluate(snapshotPan));
  await capture(i+1);
  if(report.errors.length)throw Error('Browser error captured');
 }
 report.status='passed';
}catch(e){await writeFile(join(dir,'failed-input.html'),bytes);report.status='failed';report.failure={step:report.actions.length,message:e.message};await page.screenshot({path:join(dir,'failure.png'),fullPage:false}).catch(()=>{});process.exitCode=1;}
finally{
 clearTimeout(watchdog);
 report.visualReview={status:'pending',required:true,flaggedFrames:report.checks.filter(c=>c.pointNameCoverage?.reviewRequired).map(c=>c.step)};
 await writeFile(join(dir,'report.json'),JSON.stringify(report,null,2));
 const frames=report.checks.map(c=>`<figure><img loading="lazy" src="frame-${String(c.step).padStart(3,'0')}.png"><figcaption>Step ${c.step}: ${c.step?report.actions[c.step-1].kind:'initial'} · ${c.paintedCount} labels</figcaption></figure>`).join('');
 await writeFile(join(dir,'contact-sheet.html'),`<!doctype html><meta charset="utf-8"><title>Fuzz seed ${report.seed}</title><style>body{font:14px system-ui}main{display:grid;grid-template-columns:repeat(3,1fr)}figure{margin:8px}img{width:100%;border:1px solid #999}</style><h1>${engine} / ${backend} · seed ${report.seed} · automated ${report.status}</h1><p>Visual review pending. Flagged frames: ${report.visualReview.flaggedFrames.join(", ")||"none"}. Every contact sheet still requires review.</p><main>${frames}</main>`);
 console.log(JSON.stringify({status:report.status,visualReview:report.visualReview,seed:report.seed,steps:report.actions.length,errors:report.errors,failure:report.failure,report:join(dir,'report.json')}));await browser.close();await new Promise(r=>server.close(r));
}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await main();
