import {test,expect} from '@playwright/test';
import {build} from 'esbuild';import {execFileSync} from 'node:child_process';
import {fixtureHTML} from '../support/browser-fixture.js';
test.beforeEach(async({page})=>{page.packedErrors=[];page.on('pageerror',error=>page.packedErrors.push(error.message));});
test.afterEach(async({page})=>{expect(page.packedErrors).toEqual([]);});
async function mount(page,backend,{workerFailure,corrupt=false,zoom=1,unsupported=false,holdFine=false,contourLabel=false}={}){
 let worker=(await build({entryPoints:['pipeline/labels/packed-contour-worker.js'],bundle:true,format:'iife',write:false})).outputFiles[0].text;
 if(holdFine)worker+=`;{const original=self.onmessage,send=self.postMessage.bind(self);let held;self.postMessage=(data,transfer)=>{if((data.items?.some(item=>item.id===1)||data.error)&&!self.released){held=[data,transfer];send({held:true});}else send(data,transfer);};self.onmessage=event=>{if(event.data.release){self.released=true;send(...held);}else original(event);};}`;
 const bundle=(await build({entryPoints:['pipeline/labels/browser.js'],bundle:true,format:'iife',write:false,loader:{'.txt':'text'},plugins:[{name:'fixture-worker',setup(b){b.onResolve({filter:/packed-contour-worker\.txt$/},()=>({path:'packed-worker',namespace:'fixture-worker'}));b.onLoad({filter:/.*/,namespace:'fixture-worker'},()=>({contents:worker,loader:'text'}));}}]})).outputFiles[0].text;
 const contours='<g class="contours" fill="none" stroke-width="4" stroke-linejoin="round"><g class="g-finest"><path id="packed-finest" stroke="green" d="M10.000,20.000 90.000,20.000"/></g><g class="g-fine"><path id="packed-fine" stroke="blue" d="M10.000,40.000 90.000,40.000"/></g><path id="packed-coarse" stroke="red" d="M10.000,60.000 90.000,60.000"/></g>';
 let html=(await fixtureHTML());if(contourLabel)html=html.replaceAll('geometryId":"waterpath','geometryId":"packed-fine').replaceAll('href="#waterpath','href="#packed-fine');html=html.replace('id="mapsvg"',`id="mapsvg" data-renderer="${backend}"`).replace('<defs>',(unsupported?contours.replace('<g class="contours"','<g class="contours" transform="translate(0,0)"'):contours)+'<defs>');const svg=html.match(/<svg[\s\S]*?<\/svg>/)[0];
 const packed=JSON.parse(execFileSync('python3',['-c',"import sys,json;sys.path.insert(0,'pipeline');from cartography.contour_payload import pack_contours;print(json.dumps(pack_contours(sys.stdin.read())))"],{input:svg,encoding:'utf8'}));
 html=html.replace(svg,packed[0])+packed[1];await page.setContent(html);
 await page.evaluate(({workerFailure,corrupt,holdFine})=>{window.DecompressionStream=undefined;
  if(holdFine){const Native=window.Worker;window.Worker=class{constructor(...args){const worker=new Native(...args);worker.addEventListener('message',event=>{if(event.data.held)window.releasePackedFine=()=>worker.postMessage({release:true});});return worker;}};}
  if(workerFailure==='constructor')window.Worker=class{constructor(){throw Error('Unavailable Worker');}};
  if(workerFailure==='async')window.Worker=class{postMessage(){queueMicrotask(()=>this.onerror?.({message:'Asynchronous worker load failure',preventDefault(){}}));}terminate(){}};
  if(corrupt){const e=document.getElementById('map-contour-payload'),p=JSON.parse(e.textContent);p.tiers[corrupt==='fine'?1:0].crc32^=1;e.textContent=JSON.stringify(p);}
 },{workerFailure,corrupt,holdFine});
 await page.addScriptTag({content:bundle});if(zoom!==1)await page.evaluate(zoom=>mapLayout.requestView({x:0,y:0,w:500/zoom,h:400/zoom}),zoom);
 if(holdFine){await page.waitForFunction(()=>window.releasePackedFine&&mapLayout.renderer?.paintedView);return;}
 await page.evaluate(async corrupt=>{if(corrupt){await mapLayout.ready.catch(()=>{});return;}await mapLayout.ready;await mapLayout.whenSettled();},corrupt);
}
for(const backend of ['canvas','webgl','svg'])test(`${backend} packed geometry preserves complete pixels and native fallback without compression APIs`,async({page})=>{
 await mount(page,backend);expect(await page.evaluate(()=>mapLayout.status)).toBe('ready');
 if(backend!=='svg'){
  const color=await page.evaluate(()=>{const r=mapLayout.renderer;r.draw(r.last.result,r.last.m);if(r.gpu){const bytes=new Uint8Array(4);r.gpu.gl.readPixels(50,r.contourCanvas.height-60,1,1,r.gpu.gl.RGBA,r.gpu.gl.UNSIGNED_BYTE,bytes);return [...bytes];}return [...r.contourContext.getImageData(50,60,1,1).data];});expect(color).toEqual([255,0,0,255]);
  await page.evaluate(async()=>{mapLayout.renderer.fallback(Error('Intentional native fallback'));await mapLayout.whenSettled();});
 }
 expect(await page.evaluate(()=>['packed-finest','packed-fine','packed-coarse'].map(id=>document.getElementById(id).getAttribute('d')))).toEqual(['M10.000,20.000 90.000,20.000','M10.000,40.000 90.000,40.000','M10.000,60.000 90.000,60.000']);
 expect(await page.evaluate(()=>mapLayout.renderer)).toBeFalsy();
});
for(const workerFailure of ['constructor','async'])test(`packed deep view survives ${workerFailure} worker failure`,async({page})=>{
 await mount(page,'canvas',{workerFailure,zoom:5});expect(await page.evaluate(()=>({status:mapLayout.status,view:mapLayout.renderer.paintedView,pending:mapLayout.renderer.geometryPending,items:mapLayout.preview.contours.items.length}))).toEqual({status:'ready',view:{x:0,y:0,w:100,h:80},pending:0,items:3});
 const colors=await page.evaluate(()=>{const r=mapLayout.renderer;r.draw(r.last.result,r.last.m);return [100,200,300].map(y=>[...r.contourContext.getImageData(250,y,1,1).data]);});expect(colors).toEqual([[0,128,0,255],[0,0,255,255],[255,0,0,255]]);
});
test('corrupt packed geometry reports an error instead of a complete camera frame',async({page})=>{
 await mount(page,'canvas',{corrupt:true});expect(await page.evaluate(()=>mapLayout.status)).toBe('error');expect(await page.evaluate(()=>mapLayout.error)).toMatch(/contour/i);expect(await page.evaluate(()=>mapLayout.renderer?.paintedView)).toBeUndefined();
});

test('initial Canvas failure restores the complete packed native SVG before idle',async({page})=>{
 await mount(page,'canvas',{unsupported:true});expect(await page.evaluate(()=>({status:mapLayout.status,backend:mapLayout.renderer?.backend||'svg',lengths:['packed-finest','packed-fine','packed-coarse'].map(id=>document.getElementById(id).getTotalLength())}))).toEqual({status:'ready',backend:'svg',lengths:[80,80,80]});
});

test('unrecognized renderer selection retains the complete native SVG fallback',async({page})=>{
 await mount(page,'unknown');expect(await page.evaluate(()=>({status:mapLayout.status,backend:mapLayout.renderer?.backend||'svg',lengths:['packed-finest','packed-fine','packed-coarse'].map(id=>document.getElementById(id).getTotalLength())}))).toEqual({status:'ready',backend:'svg',lengths:[80,80,80]});
});

test('held packed detail survives camera, theme and layer changes without premature idle or stale text metrics',async({page})=>{
 await mount(page,'canvas',{holdFine:true,contourLabel:true});
 await page.evaluate(()=>{window.packedIdle=false;mapLayout.whenSettled().then(()=>{packedIdle=true;});});
 const before=await page.evaluate(()=>mapLayout.renderer.paintedView);
 await page.addStyleTag({content:':root[data-theme="dark"] .g-fine path{stroke:rgb(255,0,255)}'});
 await page.evaluate(async()=>{document.documentElement.dataset.theme='dark';mapLayout.setLayer('contours',false);mapLayout.setLayer('contours',true);mapLayout.requestView({x:0,y:0,w:100,h:80});await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);});
 expect(await page.evaluate(()=>packedIdle)).toBe(false);expect(await page.evaluate(()=>mapLayout.renderer.paintedView)).toEqual(before);
 await page.evaluate(async()=>{releasePackedFine();await mapLayout.whenSettled();});
 const result=await page.evaluate(()=>{const r=mapLayout.renderer;r.draw(r.last.result,r.last.m);return {pixel:[...r.contourContext.getImageData(250,200,1,1).data],view:r.paintedView,pending:r.geometryPending,line:mapLayout.result.outcomes.find(o=>o.id==='curve')};});
 expect(result.pixel).toEqual([255,0,255,255]);expect(result.view).toEqual({x:0,y:0,w:100,h:80});expect(result.pending).toBe(0);expect(result.line.reason).toBe('placed');
});

test('pagehide during held initial geometry closes workers and rejects startup without retries',async({page})=>{
 await mount(page,'canvas',{holdFine:true,contourLabel:true});
 const result=await page.evaluate(async()=>{const ready=mapLayout.ready.then(()=>null,error=>error.name);window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:false}));return {error:await ready,unloaded:mapLayout.unloaded,storeClosed:mapLayout.packedContours.closed,placementClosed:mapLayout.initialPlacer.closed,pending:mapLayout.packedContours.client.pending.size,worker:!!mapLayout.packedContours.client.worker};});
 expect(result).toEqual({error:'AbortError',unloaded:true,storeClosed:true,placementClosed:true,pending:0,worker:false});
});

test('late corrupt detail preserves the last complete camera and settles with an explicit error',async({page})=>{
 await mount(page,'canvas',{holdFine:true,corrupt:'fine'});await page.evaluate(()=>mapLayout.ready);
 const before=await page.evaluate(()=>mapLayout.renderer.paintedView);
 await page.evaluate(async()=>{mapLayout.requestView({x:0,y:0,w:100,h:80});await new Promise(requestAnimationFrame);releasePackedFine();await mapLayout.whenSettled();});
 expect(await page.evaluate(()=>({status:mapLayout.status,error:mapLayout.error,view:mapLayout.renderer?.paintedView,closed:mapLayout.packedContours.closed,pending:mapLayout.renderer?.geometryPending,refresh:mapLayout.renderer?.refreshPending}))).toEqual({status:'error',error:expect.stringMatching(/contour/i),view:before,closed:true,pending:0,refresh:0});
});
