// Sequential backend comparison; rAF latency approximates presentation, not hardware display timing.
// Usage: ... chromium|firefox|webkit BASELINE.html CANDIDATE.html [repetitions=3]
import {chromium,firefox,webkit} from '@playwright/test';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {startupProbeSource} from './startup-probe.mjs';
import {createServer} from 'node:http';import {createHash} from 'node:crypto';import {cpus} from 'node:os';
const [engine,baseline,candidate,repetitions='3']=process.argv.slice(2),engines={chromium,firefox,webkit};
if(!engines[engine]||!baseline||!candidate)throw Error('Usage: benchmark-renderers.mjs chromium|firefox|webkit BASELINE.html CANDIDATE.html [repetitions=3]');
if(!Number.isInteger(Number(repetitions))||Number(repetitions)<3)throw Error('At least three repetitions are required');
const browser=await engines[engine].launch({headless:process.env.HEADED!=='1'}),results=[];
await mkdir('artifacts/renderers',{recursive:true});
const sources=await Promise.all([baseline,candidate].map(p=>readFile(p))),server=createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(sources[req.url.startsWith('/baseline')?0:1]);});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`;
try{for(let repeat=0;repeat<Number(repetitions);repeat++)for(const backend of ['canvas','webgl','svg'])for(const variant of (repeat%2?['candidate','baseline']:['baseline','candidate'])){
 const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript({content:startupProbeSource({offset:25})});
 await page.goto(`${base}/${variant}?renderer=${backend}`,{waitUntil:'domcontentloaded',timeout:120000});
 await page.waitForFunction(()=>window.startupProbe.painted||window.startupProbe.error,null,{timeout:120000});
 await page.evaluate(()=>{window.backendProbe=startupProbe;if(backendProbe.error)throw Error(backendProbe.error);});
 await page.evaluate(async()=>{await mapLayout.ready;await mapLayout.whenSettled();backendProbe.ready=performance.now();});await page.waitForTimeout(250);
 await page.evaluate(()=>{const l=mapLayout;window.backendFrames=[];const render=l.render.bind(l);l.render=full=>{const start=performance.now();try{return render(full);}finally{if(!full)backendFrames.push(performance.now()-start);}};});
 const phases={};
 for(const z of [2,6,14]){
  await page.evaluate(async z=>{const l=mapLayout,W=l.manifest.map.width,H=l.manifest.map.height;l.requestView({x:W*(1-1/z)/2,y:H*(1-1/z)/2,w:W/z,h:H/z});await l.whenSettled();},z);
  phases['pan'+z]=await page.evaluate(async()=>{const l=mapLayout;backendFrames=[];const times=[];l.beginGesture('pointer');for(let i=0;i<40;i++){l.requestView({...l.view,x:l.view.x+l.view.w*.0008});await new Promise(r=>requestAnimationFrame(t=>{times.push(t);r();}));}l.endGesture('pointer');const samples={cpu:backendFrames.slice(),frames:times.slice(1).map((t,i)=>t-times[i])};await l.whenSettled();return samples;});
 }
 await page.evaluate(async()=>{const l=mapLayout,W=l.manifest.map.width,H=l.manifest.map.height;l.requestView({x:0,y:0,w:W,h:H});await l.whenSettled();backendFrames=[];});
 await page.mouse.move(700,500);await page.evaluate(()=>{window.wheelSeen=new Promise(resolve=>mapLayout.svg.addEventListener('wheel',()=>resolve(),{once:true}));});const wheelStart=Date.now();await page.mouse.wheel(0,-300);await page.evaluate(async()=>{await wheelSeen;await mapLayout.whenSettled();});phases.wheel={cpu:await page.evaluate(()=>backendFrames.slice()),wall:Date.now()-wheelStart};
 phases.zoom=await page.evaluate(async()=>{const l=mapLayout;backendFrames=[];const times=[];l.beginGesture('pointer');for(let i=0;i<24;i++){const v=l.view,w=v.w*.975,h=v.h*.975;l.requestView({x:v.x+(v.w-w)/2,y:v.y+(v.h-h)/2,w,h});await new Promise(r=>requestAnimationFrame(t=>{times.push(t);r();}));}l.endGesture('pointer');const samples={cpu:backendFrames.slice(),frames:times.slice(1).map((t,i)=>t-times[i])};await l.whenSettled();return samples;});
 await page.evaluate(async()=>{const l=mapLayout,W=l.manifest.map.width,H=l.manifest.map.height;l.requestView({x:W/4,y:H/4,w:W/2,h:H/2});await l.whenSettled();});
 await page.mouse.move(700,500);await page.mouse.down();await page.evaluate(()=>{backendFrames=[];});
 for(let i=1;i<=12;i++){await page.mouse.move(700+i*3,500);await page.waitForTimeout(50);}
 phases.slowDrag={cpu:await page.evaluate(()=>backendFrames.slice())};await page.mouse.up();await page.evaluate(async()=>{await mapLayout.whenSettled();});
 const state=await page.evaluate(()=>({probe:backendProbe,actual:mapLayout.renderer?.active?mapLayout.renderer.backend:'svg',fallback:mapLayout.renderer?.fallbackReason,rgbaBytes:mapLayout.renderer?.rgbaBytes,gpuBytes:mapLayout.renderer?.gpu?.bufferBytes,gpu:mapLayout.renderer?.gpu?(()=>{const g=mapLayout.renderer.gpu.gl,e=g.getExtension('WEBGL_debug_renderer_info');return e?g.getParameter(e.UNMASKED_RENDERER_WEBGL):g.getParameter(g.RENDERER);})():null}));
 const row={engine,headed:process.env.HEADED==='1',version:browser.version(),cpu:cpus()[0].model,repeat,backend,variant,file:variant==='baseline'?baseline:candidate,sha256:createHash('sha256').update(sources[variant==='baseline'?0:1]).digest('hex'),...state,phases,errors};results.push(row);await writeFile(`artifacts/renderers/${engine}-benchmark.json`,JSON.stringify(results,null,2));
 const median=a=>[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)];console.log(JSON.stringify({variant,backend,repeat,actual:state.actual,fallback:state.fallback,ready:state.probe.ready,early:state.probe.painted-state.probe.due,phases:Object.fromEntries(Object.entries(phases).map(([k,v])=>[k,{cpu:median(v.cpu),frame:v.frames?median(v.frames):null}])),errors}));await page.close();
}}finally{await browser.close();await new Promise(r=>server.close(r));}
