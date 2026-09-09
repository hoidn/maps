// Source -> catalog -> scene -> candidates -> paint coverage at shared ground scales.
import {chromium,firefox,webkit} from '@playwright/test';
import {readFile,writeFile,mkdir} from 'node:fs/promises';import {dirname} from 'node:path';
import {createServer} from 'node:http';import {createHash} from 'node:crypto';
const [file,output,engine='chromium']=process.argv.slice(2),bytes=await readFile(file),profiles=JSON.parse(await readFile('tests/fixtures/cartography-scenes.json'));
const server=createServer((q,r)=>{r.setHeader('Content-Type','text/html; charset=utf-8');r.end(bytes)});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await({chromium,firefox,webkit}[engine]).launch(),report={file,sha256:createHash('sha256').update(bytes).digest('hex'),browser:engine,version:browser.version(),profilesStatus:profiles.status,scenes:[],errors:[]};
try{
 const page=await browser.newPage({viewport:{width:1440,height:1200}});page.on('pageerror',e=>report.errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}`,{timeout:120000});await page.evaluate(()=>mapLayout.ready);await page.locator('.map-wrap').scrollIntoViewIfNeeded();
 const info=await page.evaluate(()=>({map:mapLayout.manifest.map,features:mapLayout.manifest.features,catalog:JSON.parse(document.getElementById('map-cartography-catalog').textContent)}));report.map=info.map;report.catalogCounts=info.catalog.counts;report.sources=info.catalog.sources;report.sceneOmissions=info.catalog.omissions;
 for(const profile of profiles.regions[info.map.region]||[]){
  const f=info.features.find(f=>f.name===profile.name);
  if(!f){report.scenes.push({profile,reason:'name-not-in-manifest'});continue;}
  for(const mpp of profiles.groundScalesMetersPerPixel){
   await page.evaluate(async({anchor,mpp})=>{const l=mapLayout,W=l.manifest.map.width,H=l.manifest.map.height,r=l.svg.getBoundingClientRect(),w=Math.min(W,Math.max(W/14,r.width*mpp/l.manifest.map.metersPerMapUnit)),h=w*H/W;l.requestView({x:Math.max(0,Math.min(W-w,anchor[0]-w/2)),y:Math.max(0,Math.min(H-h,anchor[1]-h/2)),w,h});await Promise.race([l.whenSettled(),new Promise((_,reject)=>setTimeout(()=>reject(Error('Idle completion timeout')),90000))]);},{anchor:f.anchor,mpp});
   const evidence=await page.evaluate(()=>{const l=mapLayout,r=l.getReport(),by=new Map(l.manifest.annotations.map(a=>[a.id,a])),visibleGeometry=(l.renderer?.scene.items||[]).filter(i=>l.renderer.scene.visible(i,l.layers,l.manifest.map.width/l.view.w,l.view)),geometry=visibleGeometry.reduce((o,i)=>{const e=i.element,kind=e.matches('.area-waterbody')?'waterbody':e.matches('.water-line')?'waterway':e.matches('.area-building')?'building':e.matches('.area-boundary')?'boundary':e.matches('.railway-core,.railway-ties')?'railway':e.matches('.barrier-line')?'barrier':i.layer==='roads'?'road':i.layer==='trails'?'trail':i.layer==='landcover'?'landcover':null;if(kind)(o[kind]??=[]).push(e.dataset.sourceId||kind);return o},{}),prepared=new Map(l.prepared.map(a=>[a.id,a]));return{geometrySourceIds:Object.fromEntries(Object.entries(geometry).map(([k,v])=>[k,[...new Set(v)]])),status:r.status,error:r.error,view:r.view,actualMetersPerPixel:l.manifest.map.metersPerMapUnit*l.view.w/l.svg.clientWidth,paintedIds:l.renderer?.painted.map(p=>p.id)||r.placements.map(p=>p.id),outcomes:r.outcomes.map(o=>{const a=by.get(o.id),p=prepared.get(o.id);return{...o,text:a.text,sourceId:a.sourceId,kind:a.kind,style:a.style,candidates:p?.candidates.length??0,preparationReason:p?.eligibleReason}})}});
   const poiIds=evidence.outcomes.filter(o=>o.kind==='symbol'&&evidence.paintedIds.includes(o.id)).map(o=>o.sourceId||o.id);evidence.geometrySourceIds.poi=poiIds;const missingKinds=profile.expectedKinds.filter(k=>!evidence.geometrySourceIds[k]?.length);const scene={profile:profile.name,expectedKinds:profile.expectedKinds,missingKinds,targetMetersPerPixel:mpp,...evidence};report.scenes.push(scene);
   await mkdir(dirname(output),{recursive:true});await page.screenshot({path:output.replace(/\.json$/,`-${report.scenes.length}.png`),fullPage:false});
  }
 }
 report.status=report.errors.length||report.scenes.some(s=>s.status!=='ready')?'failed':'review-required';if(report.status==='failed')process.exitCode=1;
}catch(e){report.status='failed';report.errors.push(e.message);process.exitCode=1;}
finally{await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,scenes:report.scenes.length,errors:report.errors}));await browser.close();await new Promise(r=>server.close(r));}
