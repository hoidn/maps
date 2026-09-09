import {parseHeadless,collectGraphics,describeBrowserProfile} from './browser-profile.mjs';
// Immutable inputs, interleaved runs. A completed matching draw + next rAF is an
// honest presentation proxy, not GPU completion or hardware scanout timing.
import {chromium,firefox,webkit} from '@playwright/test';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {cpus,platform,arch} from 'node:os';
import {interleavedRuns,startupProbeSource} from './startup-probe.mjs';
const [engine,...args]=process.argv.slice(2),engines={chromium,firefox,webkit};
const files=args.filter(a=>!a.startsWith('--')),option=(name,fallback)=>args.find(a=>a.startsWith(`--${name}=`))?.split('=').slice(1).join('=')??fallback;
if(!engines[engine]||!files.length)throw Error('Usage: benchmark-startup.mjs chromium|firefox|webkit BASELINE.html [CANDIDATE.html] [--backend=native|svg|canvas|webgl] [--repetitions=3]');
const backend=option('backend','native');if(!['native','svg','canvas','webgl'].includes(backend))throw Error('Unsupported backend');
const runs=interleavedRuns(files,Number(option('repetitions','3'))),reportDir=process.env.STARTUP_REPORT_DIR||`artifacts/startup/${new Date().toISOString().replaceAll(':','-')}`,results=[];
// Read every file once before launching; rebuilding a candidate cannot change a run.
const sources=await Promise.all(files.map(async file=>{const bytes=await readFile(file);return {file,bytes,sha256:createHash('sha256').update(bytes).digest('hex')};}));
const server=createServer((req,res)=>{const source=sources[Number(new URL(req.url,'http://localhost').pathname.slice(1))];if(!source){res.writeHead(404).end();return;}res.setHeader('content-type','text/html; charset=utf-8');res.end(source.bytes);});
await mkdir(reportDir,{recursive:true});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
await writeFile(`${reportDir}/inputs.json`,JSON.stringify(sources.map(({bytes,...s})=>({...s,bytes:bytes.length})),null,2)+'\n');
const headless=parseHeadless(args),browser=await engines[engine].launch({headless}),host={platform:platform(),arch:arch(),cpu:cpus()[0]?.model,node:process.version};
try{const graphics=await collectGraphics(browser,engine);for(const run of runs){
 const source=sources.find(s=>s.file===run.file),page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript({content:startupProbeSource({offset:run.offset})});
 const profile=process.env.STARTUP_PROFILE==='1'&&engine==='chromium'?await page.context().newCDPSession(page):null;
 if(profile){await profile.send('Profiler.enable');await profile.send('Profiler.start');await profile.send('Performance.enable');}
 let initial,final,failure;
 try{
  await page.goto(`http://127.0.0.1:${server.address().port}/${sources.indexOf(source)}${backend==='native'?'':`?renderer=${backend}`}`,{waitUntil:'domcontentloaded',timeout:120000});
  await page.waitForFunction(()=>window.startupProbe.painted||window.startupProbe.error,null,{timeout:120000});
  initial=await page.evaluate(()=>structuredClone(startupProbe));
  if(initial.error)throw Error(initial.error);
  if(profile){const cpu=await profile.send('Profiler.stop'),metrics=await profile.send('Performance.getMetrics');await writeFile(`${reportDir}/${engine}-${run.repeat}-${run.offset}-${sources.indexOf(source)}-cpu.json`,JSON.stringify({cpu,metrics}));}
  await page.evaluate(async()=>{await mapLayout.ready;await mapLayout.whenSettled();await mapLayout.renderer?.ready;});
  final=await page.evaluate(()=>({fullyLabeled:performance.now(),status:mapLayout.status,view:mapLayout.view,actualBackend:mapLayout.renderer?.active?mapLayout.renderer.backend:'svg',fallback:mapLayout.renderer?.fallbackReason||mapLayout.rendererError||null,outcomes:mapLayout.result?.outcomes,placements:mapLayout.result?.placements.map(p=>p.id),samples:mapLayout.samples,probe:startupProbe,navigation:performance.getEntriesByType('navigation')[0]?.toJSON(),paint:performance.getEntriesByType('paint').map(e=>e.toJSON()),fonts:[...document.fonts].map(f=>({family:f.family,status:f.status})),images:[...document.images].map(i=>({complete:i.complete,width:i.naturalWidth}))}));
 }catch(error){failure=error.message;errors.push(failure);}
 const row={...run,sha256:source.sha256,bytes:source.bytes.length,engine,version:browser.version(),host,headed:!headless,profile:describeBrowserProfile({headless,graphics}),backend,profiled:Boolean(profile),latency:initial?.painted-initial?.due,queueDelay:initial?.dispatched-initial?.due,handlerToPaint:initial?.painted-initial?.dispatched,initial,final,errors};
 results.push(row);await writeFile(`${reportDir}/${engine}-measure.json`,JSON.stringify(results,null,2)+'\n');
 console.log(JSON.stringify({file:run.file,repeat:run.repeat,offset:run.offset,actual:final?.actualBackend,latency:row.latency,queueDelay:row.queueDelay,interactive:final?.probe.interactive,fullyLabeled:final?.fullyLabeled,errors}));
 await page.close();if(failure)process.exitCode=1;
}}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
