// Independent Canvas/WebGL paint, typography and held-pan audit. No promotion.
// Usage: audit-renderers.mjs chromium|firefox|webkit FILE.html [quick]
import {chromium,firefox,webkit} from '@playwright/test';import {readFile,writeFile,mkdir} from 'node:fs/promises';import {createServer} from 'node:http';import {createHash} from 'node:crypto';
import {collectManagedInventory,checkManagedInventory} from '../tests/support/managed-map-adapter.js';
import {collectTypography,checkTypography} from '../tests/support/typography-audit.js';
const [engine,file,quick]=process.argv.slice(2),bytes=await readFile(file),server=createServer((q,r)=>{r.setHeader('Content-Type','text/html');r.end(bytes);});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await ({chromium,firefox,webkit}[engine]).launch({headless:process.env.HEADED!=='1'}),rows=[];
await mkdir('artifacts/renderers',{recursive:true});
try{for(const backend of ['canvas','webgl'])for(const theme of quick?['dark']:['light','dark'])for(const dpr of quick?[2]:[1,2]){
 const page=await browser.newPage({viewport:{width:1440,height:1200},deviceScaleFactor:dpr}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(theme=>localStorage.setItem('theme',theme),theme);await page.emulateMedia({colorScheme:theme});
 await page.goto(`http://127.0.0.1:${server.address().port}/?renderer=${backend}`,{timeout:120000});
 await page.evaluate(async()=>{await mapLayout.ready;await mapLayout.whenSettled();});await page.locator('.map-wrap').scrollIntoViewIfNeeded();
 const collect=async(z,phase)=>{const data=await page.evaluate(collectManagedInventory),issues={...checkManagedInventory(data),typography:checkTypography(await page.evaluate(collectTypography))};const state=await page.evaluate(()=>({backend:mapLayout.renderer?.backend||'svg',fallback:mapLayout.renderer?.fallbackReason,placed:mapLayout.result.placements.length,rgbaBytes:mapLayout.renderer?.rgbaBytes}));const row={requestedBackend:backend,theme,dpr,z,phase,...state,visible:data.visible.length,issues,errors:[...errors]};rows.push(row);console.log(JSON.stringify({...row,issues:Object.fromEntries(Object.entries(issues).map(([k,v])=>[k,v.length]))}));await writeFile(`artifacts/renderers/${engine}-audit.json`,JSON.stringify({file,sha256:createHash('sha256').update(bytes).digest('hex'),engine,version:browser.version(),rows},null,2));};
 for(const z of quick?[2,6]:[1,1.27,2,6,14]){
  await page.evaluate(async z=>{const l=mapLayout,W=l.manifest.map.width,H=l.manifest.map.height;l.requestView({x:W*(1-1/z)/2,y:H*(1-1/z)/2,w:W/z,h:H/z});await l.whenSettled();},z);await collect(z,'settled');
  if(z===2||z===6||z===14){await page.evaluate(()=>mapLayout.beginGesture('pointer'));for(let frame=1;frame<=3;frame++){await page.evaluate(async()=>{const l=mapLayout;l.requestView({...l.view,x:l.view.x+l.view.w*.002});await new Promise(requestAnimationFrame);});await collect(z,'pan'+frame);}await page.evaluate(async()=>{mapLayout.endGesture('pointer');await mapLayout.whenSettled();});}
  if(z===1||z===6)await page.locator('.map-wrap').screenshot({path:`artifacts/renderers/${engine}-${backend}-${theme}-${dpr}-${z}.png`});
 }
 // Layer-off coverage checks that the persistent paint surface clears.
 await page.evaluate(async()=>{for(const name of ['contours','water','relief','places','names'])if(name in mapLayout.layers)mapLayout.setLayer(name,false);await mapLayout.whenSettled();});await collect(quick?6:14,'layers-off');
 await page.close();
}}finally{await browser.close();await new Promise(r=>server.close(r));}
if(rows.some(r=>r.errors.length||Object.values(r.issues).some(v=>v.length)))process.exitCode=1;
