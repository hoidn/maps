// Sequential, immutable-file startup comparison. Camera paint is approximated by
// the rAF after the viewBox change; this is not hardware presentation timing.
import {chromium,firefox,webkit} from '@playwright/test';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {cpus,platform,arch} from 'node:os';

const [engine,...files]=process.argv.slice(2),engines={chromium,firefox,webkit};
if(!engines[engine]||!files.length)throw new Error('Usage: benchmark-startup.mjs chromium|firefox|webkit BASELINE.html [CANDIDATE.html ...]');
const reportDir='artifacts/startup',results=[],browser=await engines[engine].launch();
const host={platform:platform(),arch:arch(),cpu:cpus()[0]?.model,node:process.version};
await mkdir(reportDir,{recursive:true});
try{
  for(const file of files){
    const bytes=await readFile(file),server=createServer((req,res)=>{res.setHeader('content-type','text/html');res.end(bytes);});
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    try{
      for(const offset of [25,100,250]){
        const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1}),errors=[];
        page.on('pageerror',error=>errors.push(error.message));
        await page.addInitScript(offset=>{
          window.startupProbe={longs:[]};
          if(PerformanceObserver.supportedEntryTypes.includes('longtask'))
            new PerformanceObserver(list=>startupProbe.longs.push(...list.getEntries().map(e=>({start:e.startTime,duration:e.duration})))).observe({type:'longtask',buffered:true});
          document.addEventListener('DOMContentLoaded',()=>{
            startupProbe.dom=performance.now();startupProbe.due=startupProbe.dom+offset;
            setTimeout(()=>{
              startupProbe.dispatched=performance.now();
              const svg=document.getElementById('mapsvg'),before=svg.getAttribute('viewBox'),r=svg.getBoundingClientRect();
              svg.dispatchEvent(new WheelEvent('wheel',{clientX:r.x+r.width*.55,clientY:r.y+r.height*.45,deltaY:-150,bubbles:true,cancelable:true}));
              function painted(){
                if(svg.getAttribute('viewBox')!==before)requestAnimationFrame(()=>startupProbe.painted=performance.now());
                else requestAnimationFrame(painted);
              }
              requestAnimationFrame(painted);
            },offset);
          });
        },offset);
        await page.goto(`http://127.0.0.1:${server.address().port}/`,{timeout:120000});
        await page.waitForFunction(()=>window.startupProbe.painted,{},{timeout:120000});
        const initial=await page.evaluate(()=>({...startupProbe,readyAtProbe:mapLayout.status}));
        await page.evaluate(async()=>{await mapLayout.ready;await mapLayout.whenSettled();await mapLayout.preview?.ready;});
        const final=await page.evaluate(()=>({ready:performance.now(),status:mapLayout.status,view:mapLayout.view,outcomes:mapLayout.result.outcomes,placements:mapLayout.result.placements.map(p=>p.id),samples:mapLayout.samples,probe:startupProbe}));
        const row={file,sha256:createHash('sha256').update(bytes).digest('hex'),engine,version:browser.version(),host,offset,latency:initial.painted-initial.due,queueDelay:initial.dispatched-initial.due,initial,final,errors};
        results.push(row);
        await writeFile(`${reportDir}/${engine}-measure.json`,JSON.stringify(results,null,2)+'\n');
        console.log(JSON.stringify({file,offset,latency:row.latency,queueDelay:row.queueDelay,ready:final.ready,placed:final.placements.length,errors}));
        await page.close();
      }
    }finally{await new Promise(resolve=>server.close(resolve));}
  }
}finally{await browser.close();}
