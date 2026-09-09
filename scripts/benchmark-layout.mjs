import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import os from 'node:os';
import * as browsers from '@playwright/test';
const percentile=values=>values.length?[...values].sort((a,b)=>a-b)[Math.ceil(values.length*.95)-1]:null;
export function summarizeTimings({transactions,frames,settled,completionStatus},limits){
 const camera={transactionP95Ms:percentile(transactions),frameP95Ms:percentile(frames)};
 const labelCompletion={status:completionStatus==='ready'&&Number.isFinite(settled)?'complete':'incomplete',measurement:'Elapsed time from the final wheel animation frame to whenSettled: includes input quiet delay, animation frames and progressive idle label preparation.',informational:true};
 const incomplete=Object.entries(camera).some(([k,v])=>!Number.isFinite(v)||!Number.isFinite(limits[k]))||labelCompletion.status!=='complete';
 const unmet=Object.keys(camera).filter(k=>camera[k]>limits[k]);
 return {...camera,settledMs:settled,labelCompletion,limits:{transactionP95Ms:limits.transactionP95Ms,frameP95Ms:limits.frameP95Ms},unmet,status:incomplete?'incomplete':unmet.length?'fail':'pass'};
}
async function measureFile({input,browserName,viewport,steps}){
 const bytes=await readFile(resolve(input)),server=createServer((request,response)=>{response.setHeader('content-type','text/html');response.end(bytes);});
 await new Promise((ok,fail)=>{server.once('error',fail);server.listen(0,'127.0.0.1',ok);});let browser;
 try{
  browser=await browsers[browserName].launch();const page=await browser.newPage({viewport}),errors=[];let graphics={source:'not-exposed-by-browser-api'};
  if(browserName==='chromium'){
   const session=await browser.newBrowserCDPSession(),info=await session.send('SystemInfo.getInfo');
   graphics={renderer:info.gpu.auxAttributes?.glRenderer,backend:info.gpu.auxAttributes?.skiaBackendType,featureStatus:info.gpu.featureStatus};await session.detach();
  }
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:'load',timeout:120000});
  await page.evaluate(async()=>{await document.fonts.ready;if(window.mapLayout){await window.mapLayout.whenSettled();await window.mapLayout.preview?.ready;}});
  const raw=await page.evaluate(async steps=>{
   const layout=window.mapLayout,svg=document.querySelector('#mapsvg,svg.map'),r=svg.getBoundingClientRect();
   const cold=layout?.samples?.find(s=>s.kind==='settled')||null,begin=layout?.samples?.length||0,frames=[];
   let previous=performance.now();
   for(let i=0;i<steps;i++){
    svg.dispatchEvent(new WheelEvent('wheel',{clientX:r.x+r.width*.55,clientY:r.y+r.height*.45,deltaY:i<steps/2?-35:35,bubbles:true,cancelable:true}));
    // The small self-contained fixture has no historical wheel handler.
    if(layout&&!layout.onCameraChange){const z=1+4*Math.sin(Math.PI*i/(steps-1));layout.requestView({x:0,y:0,w:layout.manifest.map.width/z,h:layout.manifest.map.height/z});}
    await new Promise(requestAnimationFrame);const now=performance.now();if(i)frames.push(now-previous);previous=now;
   }
   const end=performance.now(),midGestureSettled=layout?.samples?.slice(begin).filter(s=>s.kind==='settled').length??null;
   if(layout){let timeout;try{await Promise.race([layout.whenSettled(),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(new Error('Labels did not complete within 120 seconds')),120000);})]);}finally{clearTimeout(timeout);}}
   return {diagnostics:layout?.result?.diagnostics,preview:layout?.preview?{buildMs:layout.preview.buildMs,rgbaBytes:layout.preview.rgbaBytes,error:layout.preview.error,warmup:'awaited preview decode before warm gesture'}:null,frames,settled:performance.now()-end,midGestureSettled,samples:layout?.samples?.slice(begin)||[],cold,status:layout?.status||'legacy',cacheEntries:layout?{point:layout.cache.entries.size,line:layout.lineCache.size}:null,visible:layout?.result?.placements.length??null};
  },steps);
  return {input,artifactSha256:createHash('sha256').update(bytes).digest('hex'),browser:browserName,browserVersion:browser.version(),viewport,graphics,headless:true,errors,...raw};
 }finally{await browser?.close();await new Promise(ok=>server.close(ok));}
}
export async function benchmarkLayout({input,reportDir,baseline,browserName='chromium',viewport={width:1440,height:1000},steps=90}){
 const policy=JSON.parse(await readFile(new URL('../pipeline/labels/policy.json',import.meta.url),'utf8')),result=await measureFile({input,browserName,viewport,steps});
 const summary=summarizeTimings({transactions:result.samples.filter(s=>s.kind==='fast').map(s=>s.total),frames:result.frames,settled:result.settled,completionStatus:result.status},policy.performance);
 const report={schemaVersion:2,...result,...summary,profile:{name:'desktop-reference-draft',cpu:os.cpus()[0]?.model,platform:process.platform,architecture:process.arch,steps,gesture:'centered wheel zoom in/out, one update per animation frame',provisional:true},policySha256:createHash('sha256').update(JSON.stringify(policy)).digest('hex')};
 if(result.errors.length||result.status==='error')report.status='incomplete';
 if(baseline)report.baseline=await measureFile({input:baseline,browserName,viewport,steps});
 await mkdir(reportDir,{recursive:true});await writeFile(resolve(reportDir,'performance.json'),JSON.stringify(report,null,2)+'\n');return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const args=process.argv.slice(2),value=k=>args[args.indexOf(k)+1];
 try{if(!args.includes('--input')||!args.includes('--report'))throw new Error('Usage: --input FILE --report DIR [--baseline FILE] [--browser chromium|firefox|webkit]');
  const report=await benchmarkLayout({input:value('--input'),reportDir:value('--report'),baseline:args.includes('--baseline')?value('--baseline'):undefined,browserName:args.includes('--browser')?value('--browser'):'chromium'});
  console.log(JSON.stringify({status:report.status,transactionP95Ms:report.transactionP95Ms,frameP95Ms:report.frameP95Ms,settledMs:report.settledMs,unmet:report.unmet}));process.exitCode=report.status==='pass'?0:1;
 }catch(error){console.error(error.message);process.exitCode=1;}
}
