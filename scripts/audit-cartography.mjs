// Source -> catalog -> scene -> candidates -> paint coverage at shared ground scales.
import {chromium,firefox,webkit} from '@playwright/test';
import {readFile,writeFile,mkdir} from 'node:fs/promises';import {dirname,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createServer} from 'node:http';import {createHash} from 'node:crypto';
export function selectProfiles(profiles,region){
 if(!Object.hasOwn(profiles.regions||{},region))throw Error('Unknown region: '+region);
 const selected=profiles.regions[region];
 if(!Array.isArray(selected)||!selected.length)throw Error('No coverage profiles for region: '+region);
 if(!Array.isArray(profiles.groundScalesMetersPerPixel)||!profiles.groundScalesMetersPerPixel.length||profiles.groundScalesMetersPerPixel.some(value=>!Number.isFinite(value)||value<=0))throw Error('Invalid or empty ground scales');
 for(const profile of selected)if(!profile.name||!Array.isArray(profile.expectedKinds)||!profile.expectedKinds.length)throw Error('Each coverage profile requires a name and expected kinds');
 return selected;
}
export function findProfileFeature(profile,features){
 return features.find(feature=>profile.sourceId?feature.sourceId===profile.sourceId:feature.name===profile.name);
}
export function checkProfileEvidence(profile,evidence){
 const missingFeature=!evidence.featureFound,missingKinds=profile.expectedKinds.filter(kind=>!evidence.geometrySourceIds?.[kind]?.length);
 const missingPaintedSource=!!profile.sourceId&&!profile.expectedKinds.some(kind=>evidence.geometrySourceIds?.[kind]?.includes(profile.sourceId));
 const target=evidence.targetMetersPerPixel,actual=evidence.actualMetersPerPixel;
 const scaleMismatch=target!==undefined&&(!Number.isFinite(actual)||Math.abs(actual-target)>target*.01);
 return {missingFeature,missingKinds,missingPaintedSource,scaleMismatch,mechanicalStatus:missingFeature||missingKinds.length||missingPaintedSource||scaleMismatch||evidence.status!=='ready'||evidence.error?'failed':'passed'};
}
export function coverageStatus(scenes,errors=[],reviewed=false){
 return !scenes.length||errors.length||scenes.some(scene=>scene.mechanicalStatus!=='passed')?'failed':reviewed?'passed':'review-required';
}
// Serialized into the page. Canvas/WebGL paint evidence belongs to the
// completed draw; native SVG evidence comes from its visible paint elements.
export function collectProfileEvidence(){
 const l=mapLayout,r=l.getReport(),renderer=l.renderer?.active?l.renderer:null,viewport=l.svg.getBoundingClientRect();
 const by=new Map(l.manifest.annotations.map(a=>[a.id,a])),prepared=new Map(l.prepared.map(a=>[a.id,a]));
 const hasPaint=s=>Number(s.opacity)>0&&(s.fill!=='none'&&Number(s.fillOpacity)>0||s.stroke!=='none'&&Number(s.strokeOpacity)>0&&(typeof s.width==='number'?s.width:parseFloat(s.strokeWidth))>0);
 const shown=e=>{
  if(!e||e.closest('defs,.hits'))return false;
  for(let p=e;p?.nodeType===1;p=p.parentElement){const s=getComputedStyle(p);if(p.hidden||s.display==='none'||s.visibility==='hidden'||Number(s.opacity)===0)return false;}
  const s=getComputedStyle(e),b=e.getBoundingClientRect();
  if(!hasPaint(s)||!b.width&&!b.height)return false;
  const m=e.getScreenCTM(),pad=s.stroke==='none'?0:parseFloat(s.strokeWidth)*Math.max(Math.hypot(m.a,m.b),Math.hypot(m.c,m.d))/2;
  return b.right+pad>=viewport.left&&b.left-pad<=viewport.right&&b.bottom+pad>=viewport.top&&b.top-pad<=viewport.bottom;
 };
 const elements=renderer?(renderer.paintedGeometry||[]).filter(i=>i.kind==='image'?(i.opacity??1)>0:i.commands.some(c=>hasPaint(c.style))).map(i=>i.element):
  [...l.svg.querySelectorAll('.area-waterbody,.water-line,.area-building,.area-boundary,.railway-core,.railway-ties,.barrier-line,.roads path,.trails path,.landcover')].filter(e=>!e.closest('[data-layout-id]')&&shown(e));
 const geometry={};
 for(const e of elements){
  const kind=e.matches('.area-waterbody')?'waterbody':e.matches('.water-line')?'waterway':e.matches('.area-building')?'building':e.matches('.area-boundary')?'boundary':e.matches('.railway-core,.railway-ties')?'railway':e.matches('.barrier-line')?'barrier':e.closest('.roads')?'road':e.closest('.trails')?'trail':e.matches('.landcover')?'landcover':null;
  if(kind)(geometry[kind]??=[]).push(e.dataset.sourceId||kind);
 }
 const paintedIds=renderer?renderer.painted.map(p=>p.id):l.manifest.annotations.filter(a=>[...l.elements.get(a.id).querySelectorAll('path,rect,circle,ellipse,line,polygon,polyline,text,use')].some(shown)).map(a=>a.id);
 const painted=new Set(paintedIds);geometry.poi=l.manifest.annotations.filter(a=>a.kind==='symbol'&&painted.has(a.id)).map(a=>a.sourceId||a.id);
 return {geometrySourceIds:Object.fromEntries(Object.entries(geometry).map(([k,v])=>[k,[...new Set(v)]])),status:r.status,error:r.error,view:r.view,actualMetersPerPixel:l.manifest.map.metersPerMapUnit*l.view.w/l.svg.clientWidth,paintedIds,outcomes:r.outcomes.map(o=>{const a=by.get(o.id),p=prepared.get(o.id);return{...o,text:a.text,sourceId:a.sourceId,kind:a.kind,style:a.style,candidates:p?.candidates.length??0,preparationReason:p?.eligibleReason}})};
}
async function main(){
const [file,output,engine='chromium']=process.argv.slice(2);
if(!file||!output||!['chromium','firefox','webkit'].includes(engine))throw Error('Usage: audit-cartography.mjs FILE OUTPUT.json [chromium|firefox|webkit]');
const bytes=await readFile(file),profiles=JSON.parse(await readFile('tests/fixtures/cartography-scenes.json'));
const server=createServer((q,r)=>{r.setHeader('Content-Type','text/html; charset=utf-8');r.end(bytes)});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await({chromium,firefox,webkit}[engine]).launch(),report={file,sha256:createHash('sha256').update(bytes).digest('hex'),browser:engine,version:browser.version(),profilesStatus:profiles.status,scenes:[],errors:[]};
try{
 const page=await browser.newPage({viewport:{width:1440,height:1200}});page.on('pageerror',e=>report.errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}`,{timeout:120000});await page.evaluate(()=>mapLayout.ready);await page.locator('.map-wrap').scrollIntoViewIfNeeded();
 const info=await page.evaluate(()=>({map:mapLayout.manifest.map,features:mapLayout.manifest.features,catalog:JSON.parse(document.getElementById('map-cartography-catalog').textContent),requestedBackend:mapLayout.svg.dataset.renderer||'svg',renderer:mapLayout.getReport().renderer}));report.map=info.map;report.catalogCounts=info.catalog.counts;report.sources=info.catalog.sources;report.sceneOmissions=info.catalog.omissions;
 report.backend={...info.renderer,requested:info.requestedBackend};
 if(info.requestedBackend!==info.renderer.active)report.errors.push(`Requested ${info.requestedBackend} backend used ${info.renderer.active}: ${info.renderer.fallback||'fallback'}`);
 for(const profile of selectProfiles(profiles,info.map.region)){
  const f=findProfileFeature(profile,info.features);
  if(!f){report.scenes.push({profile:profile.name,expectedSourceId:profile.sourceId,reason:'feature-not-in-manifest',...checkProfileEvidence(profile,{featureFound:false})});continue;}
  for(const mpp of profiles.groundScalesMetersPerPixel){
   await page.evaluate(async({anchor,mpp})=>{const l=mapLayout,W=l.manifest.map.width,H=l.manifest.map.height,r=l.svg.getBoundingClientRect(),w=Math.min(W,Math.max(W/14,r.width*mpp/l.manifest.map.metersPerMapUnit)),h=w*H/W;l.requestView({x:Math.max(0,Math.min(W-w,anchor[0]-w/2)),y:Math.max(0,Math.min(H-h,anchor[1]-h/2)),w,h});await Promise.race([l.whenSettled(),new Promise((_,reject)=>setTimeout(()=>reject(Error('Idle completion timeout')),90000))]);},{anchor:f.anchor,mpp});
   const evidence=await page.evaluate(collectProfileEvidence);
   const scene={profile:profile.name,featureId:f.id,sourceId:f.sourceId,anchor:f.anchor,expectedKinds:profile.expectedKinds,targetMetersPerPixel:mpp,...evidence,...checkProfileEvidence(profile,{...evidence,featureFound:true,targetMetersPerPixel:mpp})};report.scenes.push(scene);
   await mkdir(dirname(output),{recursive:true});await page.screenshot({path:output.replace(/\.json$/,`-${report.scenes.length}.png`),fullPage:false});
  }
 }
 const review=profiles.reviews?.[info.map.region];
 report.review={status:review?.status||'pending',artifactSha256:review?.artifactSha256||null};
 report.status=coverageStatus(report.scenes,report.errors,review?.status==='reviewed'&&review.artifactSha256===report.sha256);if(report.status==='failed')process.exitCode=1;
}catch(e){report.status='failed';report.errors.push(e.message);process.exitCode=1;}
finally{await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,scenes:report.scenes.length,errors:report.errors}));await browser.close();await new Promise(r=>server.close(r));}

}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await main().catch(error=>{console.error(error.message);process.exitCode=1;});
