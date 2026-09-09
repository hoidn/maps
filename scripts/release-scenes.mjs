import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import * as playwright from '@playwright/test';
import {collectManagedInventory,checkManagedInventory} from '../tests/support/managed-map-adapter.js';
const config=JSON.parse(await readFile(new URL('../tests/fixtures/layout-scenes.json',import.meta.url),'utf8'));
const hash=b=>createHash('sha256').update(b).digest('hex');
const defaultViewports=[{width:360,height:800},{width:768,height:1024},{width:1440,height:1000}];
export function releaseStates({width,height,features=[],sampleCount=250,seed=0xC0FFEE,scenes=config.scenes}) {
  let state=seed>>>0;const random=()=>{state=(1664525*state+1013904223)>>>0;return state/4294967296;};
  const view=(zoom,x=.5,y=.5)=>({zoom,x:x*(width-width/zoom),y:y*(height-height/zoom)});
  const result=[{id:'overview',kind:'overview',...view(1),...config.overview}];
  for(const boundary of [1.02,2,4.5])for(const delta of [-.0001,0,.0001])result.push({id:`boundary-${boundary}-${delta}`,kind:'boundary',...view(boundary+delta)});
  result.push({id:'maximum-14',kind:'boundary',...view(14)});
  for(const scene of scenes){const f=features.find(f=>f.name===scene.feature&&f.directory);result.push({...scene,kind:'dense',...(f?{x:Math.max(0,Math.min(width-width/scene.zoom,f.anchor[0]-width/scene.zoom/2)),y:Math.max(0,Math.min(height-height/scene.zoom,f.anchor[1]-height/scene.zoom/2))}:{missingFeature:scene.feature})});}
  for(let i=0;i<sampleCount;i++)result.push({id:'random-'+i,kind:'random',...view(Math.exp(random()*Math.log(14)),random(),random()),layers:{places:random()>.15,names:random()>.15,contours:random()>.15}});
  return result;
}
export function checkSceneCoverage(data,scene) {
  const visible=new Set(data.visible),counts={};for(const a of data.manifest.annotations)if(visible.has(a.id))counts[a.kind]=(counts[a.kind]??0)+1;
  return Object.entries(scene.minima??{}).filter(([kind,n])=>(counts[kind]??0)<n).map(([kind,minimum])=>({kind,minimum,visible:counts[kind]??0}));
}
async function settled(page){await page.evaluate(async()=>{await window.mapLayout?.ready;await window.mapLayout?.whenSettled?.();});}
async function setView(page,view){await page.evaluate(async view=>{const m=JSON.parse(document.querySelector('#map-label-manifest').textContent),w=m.map.width/view.zoom,h=m.map.height/view.zoom;if(!window.mapLayout?.requestView)throw new Error('Missing managed camera API');for(const layer of ['places','names','contours'])window.mapLayout.setLayer?.(layer,view.layers?.[layer]??true);window.mapLayout.requestView({x:view.x??(m.map.width-w)/2,y:view.y??(m.map.height-h)/2,w,h});await window.mapLayout.whenSettled?.();},view);}

/** Expensive artifact gate. Full defaults cover 36 browser/viewport/DPR/theme profiles,
 * 250 reproducible random states distributed across profiles, named scenes and tier boundaries.
 * Reduced options are explicitly marked releaseComplete:false and never constitute
 * evidence that the full release matrix passed. Artifact bytes are served unchanged. */
export async function runReleaseScenes({input,reportDir,browsers=['chromium','firefox','webkit'],viewports=defaultViewports,dprs=[1,2],themes=['light','dark'],sampleCount=250,frameCount=120,seed=0xC0FFEE,states,interactions=true,policy,sceneConfig=config,onProgress}={}) {
  const bytes=await readFile(resolve(input)),artifactSha256=hash(bytes),policyBytes=policy?Buffer.from(JSON.stringify(policy)):await readFile(new URL('../pipeline/labels/policy.json',import.meta.url));policy=JSON.parse(policyBytes);
  await mkdir(reportDir,{recursive:true});
  const server=createServer((req,res)=>{if(new URL(req.url,'http://localhost').pathname!=='/'){res.writeHead(404);res.end();return;}res.setHeader('Content-Type','text/html');res.end(bytes);});
  await new Promise(ok=>server.listen(0,'127.0.0.1',ok));const url=`http://127.0.0.1:${server.address().port}/`;
  const profileTotal=browsers.length*viewports.length*dprs.length*themes.length;
  const counts={profiles:0,states:0,frames:0,overlaps:0,clipped:0,unknown:0,missingRequired:0,coverage:0,interactionFailures:0,incomplete:0},profiles=[];
  async function audit(page,profile,scene,data){data??=await page.evaluate(collectManagedInventory);const checks=checkManagedInventory(data,policy),coverage=checkSceneCoverage(data,scene);for(const k of ['overlaps','clipped','unknown','missingRequired'])counts[k]+=checks[k].length;counts.coverage+=coverage.length;
    const observed={};for(const a of data.manifest.annotations)if(data.visible.includes(a.id))observed[a.kind]=(observed[a.kind]??0)+1;
    const result={id:scene.id,kind:scene.kind,viewBox:data.viewBox,visible:data.visible.length,coverageByClass:observed,...checks,coverage};profile.samples.push(result);
    if(data.fontStatus!=='loaded'||data.fonts.some(f=>f.status!=='loaded')){counts.incomplete++;result.fontStatus=data.fontStatus;}
    return result;
  }
  try{for(const browserName of browsers){const browser=await playwright[browserName].launch();try{for(const viewport of viewports)for(const dpr of dprs)for(const theme of themes){
    const id=`${browserName}-${viewport.width}-dpr${dpr}-${theme}`,profile={id,browser:browserName,browserVersion:browser.version(),viewport,dpr,theme,samples:[],interactions:[]},page=await browser.newPage({viewport,deviceScaleFactor:dpr,colorScheme:theme});counts.profiles++;profiles.push(profile);onProgress?.({profile:id,status:'start'});
    try{
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.goto(url,{waitUntil:'load'});await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);await settled(page);
      const manifest=await page.evaluate(()=>JSON.parse(document.querySelector('#map-label-manifest').textContent));
      const randomForProfile=Math.floor(sampleCount/profileTotal)+(counts.profiles<=sampleCount%profileTotal?1:0);
      const views=states??releaseStates({...manifest.map,features:manifest.features,sampleCount:randomForProfile,seed:seed+counts.profiles-1,scenes:sceneConfig.scenes});
      for(const scene of views){counts.states++;if(scene.missingFeature){counts.coverage++;profile.samples.push({id:scene.id,missingFeature:scene.missingFeature});continue;}await setView(page,scene);const result=await audit(page,profile,scene);
        if(['overview','dense'].includes(scene.kind)){const file=`${id}-${scene.id}.png`;await page.screenshot({path:join(reportDir,file)});result.screenshot=file;}
      }
      if(interactions){
        async function check(name,action){try{const detail=await action();profile.interactions.push({name,status:'pass',detail});}catch(e){counts.interactionFailures++;profile.interactions.push({name,status:'fail',error:e.message});}}
        await check('directory',async()=>{const result=await page.evaluate(()=>{const m=JSON.parse(document.querySelector('#map-label-manifest').textContent),options=[...document.querySelector('#goto').options].map(o=>o.value);return m.features.filter(f=>f.directory&&!options.includes(f.id)).map(f=>f.id);});if(result.length)throw new Error('Directory omitted '+result.join(','));const option=await page.locator('#goto option').nth(1).getAttribute('value');await page.selectOption('#goto',option);await settled(page);if(await page.evaluate(()=>!document.querySelector('[data-layout-details]')?.textContent.trim()))throw new Error('No selected-feature details');});
        await check('layers',async()=>{for(const layer of ['places','names']){await page.evaluate(layer=>window.mapLayout.setLayer(layer,false),layer);await settled(page);const data=await page.evaluate(collectManagedInventory);if(data.manifest.annotations.some(a=>a.layer===layer&&data.visible.includes(a.id)))throw new Error('Hidden layer still paints '+layer);await page.evaluate(layer=>window.mapLayout.setLayer(layer,true),layer);await settled(page);}});
        await check('reset',async()=>{await page.locator('#zreset').click();await settled(page);const v=await page.evaluate(()=>window.mapLayout.view);if(Math.abs(v.x)>1e-6||Math.abs(v.y)>1e-6||Math.abs(v.w-manifest.map.width)>1e-6)throw new Error('Reset camera mismatch');});
        await check('native-drag',async()=>{await setView(page,{zoom:2});const box=await page.locator('#mapsvg').boundingBox(),before=await page.locator('#mapsvg').getAttribute('viewBox');await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+30,box.y+box.height/2+20,{steps:5});await page.mouse.up();await settled(page);if(before===await page.locator('#mapsvg').getAttribute('viewBox'))throw new Error('Native drag did not move camera');});
        await check('hash-restore',async()=>{const box=await page.locator('#mapsvg').boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.wheel(0,-120);await settled(page);await page.waitForTimeout(300);const before=await page.evaluate(()=>({hash:location.hash,view:window.mapLayout.view}));if(!before.hash.startsWith('#v='))throw new Error('Missing view hash');await page.reload();await settled(page);const after=await page.evaluate(()=>window.mapLayout.view);if(Math.abs(before.view.x-after.x)>2||Math.abs(before.view.y-after.y)>2||Math.abs(before.view.w-after.w)>manifest.map.width*.01)throw new Error('Hash restore mismatch');});
        await check('pin-readout',async()=>{const result=await page.evaluate(()=>{const hit=document.querySelector('.hit');if(!hit)return {error:'Missing trail hit target'};const r=document.querySelector('#mapsvg').getBoundingClientRect();hit.dispatchEvent(new MouseEvent('click',{bubbles:true,clientX:r.x+r.width/2,clientY:r.y+r.height/2}));document.querySelector('#mapsvg').dispatchEvent(new MouseEvent('mousemove',{bubbles:true,clientX:r.x+r.width/2,clientY:r.y+r.height/2}));return {readout:document.querySelector('.readout')?.textContent,tooltip:document.querySelector('#ttip')?.textContent};});if(result.error||!result.readout?.trim()||!result.tooltip?.trim())throw new Error(result.error??'Pin/readout did not expose information');});
      }
      // Capture inventory after the camera's preceding rAF commit, then inject the
      // next event. This samples painted transitions, not settled solver flags.
      if(frameCount&&viewport.width===viewports.at(-1).width&&dpr===dprs[0]&&theme===themes[0]){await page.evaluate(`window.__releaseCollect=(${collectManagedInventory.toString()})`);
        for(const gesture of ['wheel','drag','pinch']){
          await setView(page,{zoom:2});
          const frames=await page.evaluate(async({gesture,frameCount})=>{
            const svg=document.querySelector('#mapsvg'),r=svg.getBoundingClientRect(),cx=r.x+r.width/2,cy=r.y+r.height/2,frames=[];
            // Synthetic pointers cannot be captured as OS pointers. Keep the event
            // handlers under test, but replace capture only for this synthetic run.
            const capture=svg.setPointerCapture;svg.setPointerCapture=()=>{};
            const send=(type,id,x,y)=>svg.dispatchEvent(new PointerEvent(type,{bubbles:true,pointerId:id,pointerType:gesture==='pinch'?'touch':'mouse',clientX:x,clientY:y,buttons:type==='pointerup'?0:1}));
            try{if(gesture==='drag')send('pointerdown',71,cx,cy);if(gesture==='pinch'){send('pointerdown',71,cx-40,cy);send('pointerdown',72,cx+40,cy);}
              for(let i=0;i<frameCount;i++){await new Promise(requestAnimationFrame);const frame=window.__releaseCollect();frame.viewBox=svg.getAttribute('viewBox');frames.push(frame);const offset=Math.sin(i*.08)*25;
                if(gesture==='wheel')svg.dispatchEvent(new WheelEvent('wheel',{bubbles:true,cancelable:true,clientX:cx,clientY:cy,deltaY:Math.sin(i*.08)*10}));
                else if(gesture==='drag')send('pointermove',71,cx+offset,cy+offset/2);
                else {send('pointermove',71,cx-40-offset,cy);send('pointermove',72,cx+40+offset,cy);}
              }
            }finally{send('pointerup',71,cx,cy);send('pointerup',72,cx,cy);svg.setPointerCapture=capture;}return frames;
          },{gesture,frameCount});
          if(new Set(frames.map(f=>f.viewBox)).size<2){counts.interactionFailures++;profile.interactions.push({name:gesture+'-frames',status:'fail',error:'Gesture did not change rendered viewBox'});}
          for(let i=0;i<frames.length;i++){counts.frames++;await audit(page,profile,{id:`${gesture}-frame-${i}`,kind:'frame'},frames[i]);}
          await settled(page);
        }
      }
      if(errors.length){counts.incomplete+=errors.length;profile.errors=errors;}
    }catch(e){counts.incomplete++;profile.error=e.message;}finally{await page.close();}
    await writeFile(join(reportDir,id+'.json'),JSON.stringify(profile,null,2));onProgress?.({profile:id,status:'complete',counts:{...counts}});
  }}finally{await browser.close();}}}finally{await new Promise(ok=>server.close(ok));}
  const releaseComplete=!states&&sampleCount>=250&&frameCount>=100&&interactions&&['chromium','firefox','webkit'].every(b=>browsers.includes(b))&&defaultViewports.every(v=>viewports.some(p=>p.width===v.width&&p.height===v.height))&&[1,2].every(d=>dprs.includes(d))&&['light','dark'].every(t=>themes.includes(t));
  const coverageFrozen=sceneConfig.coverageReview==='frozen';
  const status=Object.entries(counts).some(([k,v])=>!['profiles','states','frames','incomplete'].includes(k)&&v)?'findings':counts.incomplete||releaseComplete&&!coverageFrozen?'incomplete':'pass';
  const report={schemaVersion:1,status,releaseComplete,coverageFrozen,artifactSha256,policySha256:hash(policyBytes),sceneConfigSha256:hash(JSON.stringify(sceneConfig)),counts,seed,sampleCount,frameCount,profiles,limitations:['Pointer pinch/drag frame scenarios are synthetic; OS pointer capture is bypassed only during those samples. Native wheel and controls are separately exercised. Real touch-device testing remains outside this automated gate.']};
  await writeFile(join(reportDir,'release-scenes.json'),JSON.stringify(report,null,2));
  const escape=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
  await writeFile(join(reportDir,'release-scenes.html'),`<!doctype html><meta charset="utf-8"><title>Release map scenes</title><h1>${status}</h1><pre>${escape(JSON.stringify({artifactSha256,releaseComplete,coverageFrozen,counts},null,2))}</pre>${profiles.map(p=>`<h2>${escape(p.id)}</h2>${p.samples.filter(s=>s.screenshot).map((s,i)=>`<h3>${i+1}. ${escape(s.id)}</h3><img width="640" src="${s.screenshot}">`).join('')}`).join('')}`);
  return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const args=process.argv.slice(2),get=k=>args[args.indexOf(k)+1];try{if(!args.includes('--input')||!args.includes('--report'))throw new Error('Usage: --input MAP.html --report DIR [--smoke]');const report=await runReleaseScenes({input:get('--input'),reportDir:get('--report'),...(args.includes('--smoke')?{browsers:['chromium'],viewports:[defaultViewports[2]],dprs:[1],themes:['light'],sampleCount:5,frameCount:0,interactions:false}:{}),onProgress:p=>console.log(JSON.stringify(p))});console.log(JSON.stringify({status:report.status,counts:report.counts,releaseComplete:report.releaseComplete,artifactSha256:report.artifactSha256}));process.exitCode=report.status==='pass'?0:1;}catch(error){console.error(error);process.exitCode=1;}}
