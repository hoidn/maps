// Trusted wheel input and slow pointer dragging, including gaps between moves.
// Usage: benchmark-gestures.mjs chromium|firefox|webkit FILE.html [FILE.html ...]
import {chromium,firefox,webkit} from '@playwright/test';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
const [engine,...files]=process.argv.slice(2),engines={chromium,firefox,webkit};
if(!engines[engine]||!files.length)throw new Error('Expected browser name and HTML path(s)');
await mkdir('artifacts/pan-layout',{recursive:true});
const browser=await engines[engine].launch(),results=[];
try{
 for(const file of files){
  const bytes=await readFile(file),server=createServer((q,r)=>{r.setHeader('Content-Type','text/html');r.end(bytes);});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  try{
   const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.goto(`http://127.0.0.1:${server.address().port}`,{timeout:120000});
   await page.evaluate(async()=>{await mapLayout.ready;await mapLayout.preview.ready;await mapLayout.whenSettled();});
   // Drain initial observer notifications before isolating warm gestures.
   await page.waitForTimeout(350);
   await page.evaluate(()=>{
    const l=mapLayout;window.gestureTrace={held:false,events:0,renders:[]};
    l.svg.addEventListener('wheel',()=>gestureTrace.events++,{capture:true,passive:true});
    const render=l.render.bind(l);l.render=full=>{const start=performance.now(),held=gestureTrace.held;try{return render(full);}finally{gestureTrace.renders.push({full,held,ms:performance.now()-start});}};
   });
   await page.mouse.move(700,500);
   await page.evaluate(()=>{gestureTrace.renders=[];});
   await page.mouse.wheel(0,-300);
   await page.waitForFunction(()=>gestureTrace.events>0);
   await page.evaluate(()=>mapLayout.whenSettled());
   const wheel=await page.evaluate(()=>gestureTrace.renders);
   await page.evaluate(async()=>{const l=mapLayout,W=l.manifest.map.width,H=l.manifest.map.height;l.requestView({x:W/4,y:H/4,w:W/2,h:H/2});await l.whenSettled();});
   await page.waitForTimeout(150);
   await page.mouse.down();
   await page.evaluate(()=>{gestureTrace.held=true;gestureTrace.renders=[];});
   for(let i=1;i<=12;i++){await page.mouse.move(700+i*3,500);await page.waitForTimeout(50);}
   await page.evaluate(()=>{gestureTrace.held=false;});
   await page.mouse.up();await page.evaluate(()=>mapLayout.whenSettled());
   const drag=await page.evaluate(()=>gestureTrace.renders);
   const held=drag.filter(r=>r.held),fast=held.filter(r=>!r.full);
   const summary={heldSettled:held.filter(r=>r.full).length,heldRenderMs:held.reduce((n,r)=>n+r.ms,0),heldMaxMs:Math.max(0,...held.map(r=>r.ms)),fastMaxMs:Math.max(0,...fast.map(r=>r.ms)),wheelFirstFastMs:wheel.find(r=>!r.full)?.ms};
   const row={file,sha256:createHash('sha256').update(bytes).digest('hex'),engine,version:browser.version(),summary,wheel,drag,errors};
   results.push(row);console.log(JSON.stringify({file,engine,...summary,errors}));
   await writeFile(`artifacts/pan-layout/${engine}-gestures.json`,JSON.stringify(results,null,2));
   await page.close();
  }finally{await new Promise(r=>server.close(r));}
 }
}finally{await browser.close();}
