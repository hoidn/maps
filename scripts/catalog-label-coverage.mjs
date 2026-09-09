// Read-only label preparation/paint evidence. Usage: FILE.html REPORT.json [browser]
import {chromium,firefox,webkit} from '@playwright/test';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname} from 'node:path';import {createServer} from 'node:http';import {createHash} from 'node:crypto';
const [file,report,engine='chromium']=process.argv.slice(2),bytes=await readFile(file);
const server=createServer((q,r)=>{r.setHeader('Content-Type','text/html; charset=utf-8');r.end(bytes)});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await({chromium,firefox,webkit}[engine]).launch(),rows=[];
try{const page=await browser.newPage({viewport:{width:1440,height:1200}});await page.goto(`http://127.0.0.1:${server.address().port}`,{timeout:120000});await page.evaluate(()=>mapLayout.ready);await page.locator('.map-wrap').scrollIntoViewIfNeeded();
for(const zoom of [1,2,6,14]){
 await page.evaluate(async z=>{const l=mapLayout,W=l.manifest.map.width,H=l.manifest.map.height;l.requestView({x:W*(1-1/z)/2,y:H*(1-1/z)/2,w:W/z,h:H/z});await l.whenSettled()},zoom);
 rows.push(await page.evaluate(()=>{const l=mapLayout,r=l.getReport(),by=new Map(l.manifest.annotations.map(a=>[a.id,a]));return{view:r.view,status:r.status,error:r.error,renderer:r.renderer,prepared:l.prepared.map(a=>({id:a.id,kind:a.kind,text:a.text,style:a.style,candidateCount:a.candidates.length,reason:a.eligibleReason,diagnostics:a.candidateDiagnostics})),outcomes:r.outcomes.map(o=>({...o,text:by.get(o.id)?.text,style:by.get(o.id)?.style})),painted:l.renderer?.painted.map(p=>p.id)??r.placements.map(p=>p.id)}}));
}
await mkdir(dirname(report),{recursive:true});await writeFile(report,JSON.stringify({file,sha256:createHash('sha256').update(bytes).digest('hex'),browser:engine,version:browser.version(),rows},null,2));console.log(rows.map(r=>({view:r.view,status:r.status,error:r.error,painted:r.painted.length,hydro:r.outcomes.filter(o=>['l-hydro','l-river'].includes(o.style)&&o.reason==='placed').map(o=>o.text)})));
}finally{await browser.close();await new Promise(r=>server.close(r));}
