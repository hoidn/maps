import {MapScene,captureCommands,commandBounds,paintCommands,createPaintState,viewMatrix,matrixArray} from './scene.js';
import {WebGLContours} from './webgl-contours.js';
import {moveShape} from '../labels/geometry.js';
const ORDER=['boundaries','buildings','contour-labels','hydro','roads','trails','regions','hydro-labels','boundary-labels','peaks','symbols','trail-labels','labels','fixed-ui','coordinate-grid','neatline','other'];
const center=b=>[b.x+b.width/2,b.y+b.height/2];
const EMPTY_CANDIDATES=Object.freeze([]);
/** Persistent Canvas paint surface. SVG is retained as a non-painted measurement
 * source; it is not the camera or the hit-test surface during fast frames. */
export class CanvasMapRenderer{
 constructor(controller,backend='canvas'){
  this.controller=controller;this.svg=controller.svg;this.backend=backend;this.requestedBackend=backend;this.scene=new MapScene(this.svg,controller.manifest.map);this.labels=new Map();this.painted=[];this.paintedGeometry=[];this.active=false;this.canvases=[];this.generation=0;this.refreshGeneration=0;this.refreshPending=0;
  for(const name of ['terrain','contours','foreground']){
   const canvas=document.createElement('canvas');canvas.dataset.mapCanvas=name;canvas.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:1';this.canvases.push(canvas);
  }
  [this.background,this.contourCanvas,this.foreground]=this.canvases;
  this.bg=this.background.getContext('2d');this.contourContext=backend==='webgl'?null:this.contourCanvas.getContext('2d');this.fg=this.foreground.getContext('2d');
  if(!this.bg||(!this.contourContext&&backend!=='webgl')||!this.fg)throw new Error('Canvas 2D unavailable');
  this.hitContext=document.createElement('canvas').getContext('2d');
  this.geometryPending=1;this.baseReady=this.prepare();
  this.ready=this.baseReady.then(()=>this.ensureView(controller.view));this.ready.catch(()=>{});
  this.complete=Promise.all([this.baseReady,controller.preview.contours.ready]).then(async()=>{if(this.gpu){const gpu=this.gpu;try{await gpu.prepare();}catch(error){if(this.gpu===gpu)this.useCanvas(error);}}this.geometryComplete=true;}).catch(error=>{if(this.controller.renderer===this)this.fallback(error);}).finally(()=>{this.geometryPending=0;this.controller.resolveWaiters();});
  this.baseReady.then(()=>{if(this.controller.renderer===this)this.controller.schedule();},()=>{}); // The initial transaction awaits and reports preparation failure.
  this.themeObserver=new MutationObserver(()=>this.refresh());this.themeObserver.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme','style','class']});
  this.media=matchMedia('(prefers-color-scheme: dark)');this.themeChanged=()=>this.refresh();this.media.addEventListener('change',this.themeChanged);
  this.pageHidden=event=>{if(!event.persisted)this.destroy();};window.addEventListener('pagehide',this.pageHidden,{once:true});
 }
 async prepare(){
  // Independent scene/image work can progress while contour chunks prepare.
  await Promise.all([this.controller.preview.backgroundReady??this.controller.preview.ready,this.scene.prepare()]);
  if([...this.svg.children].some(e=>e.matches('.contours')&&!this.controller.preview.contours.layers.includes(e)))throw new Error('Unsupported Canvas contour group');
  if(this.requestedBackend==='webgl')try{this.gpu=new WebGLContours(this.contourCanvas,this.controller.preview.contours,error=>this.useCanvas(error));}catch(error){this.useCanvas(error);}
  this.basePrepared=true;
 }
 isViewReady(view){
  if(!this.basePrepared||this.controller.preview.contours.failure)return false;
  if(!this.controller.layers.contours||this.geometryComplete)return true;
  const z=this.controller.manifest.map.width/view.w;
  return this.controller.preview.contours.isReady(view)&&(!this.gpu||this.gpu.isReadyFor(z));
 }
 async ensureView(view){
  await this.baseReady;
  if(this.controller.layers.contours){
   await this.controller.preview.contours.readyFor(view);
   if(this.gpu){const gpu=this.gpu;try{await gpu.prepare(this.controller.manifest.map.width/view.w);}catch(error){if(this.gpu===gpu)this.useCanvas(error);}}
  }
 }
 requestCamera(view){
  if(this.isViewReady(view))return true;
  const key=view.w+':'+this.controller.layers.contours;
  if(this.pendingCameraKey!==key){this.pendingCameraKey=key;this.ensureView({...view}).then(()=>{if(this.pendingCameraKey===key)this.pendingCameraKey=null;if(this.controller.renderer===this)this.controller.schedule();},error=>{if(this.controller.renderer===this)this.fallback(error);});}
  return false;
 }
 useCanvas(error){
  this.fallbackReason=error?.message||String(error);this.gpu?.destroy();this.gpu=null;
  const old=this.contourCanvas,canvas=document.createElement('canvas');canvas.dataset.mapCanvas='contours';canvas.style.cssText=old.style.cssText;
  old.replaceWith(canvas);this.contourCanvas=canvas;this.canvases[1]=canvas;this.contourContext=canvas.getContext('2d');this.backend='canvas';
  if(this.active){this.svg.dataset.mapRenderer='canvas';if(this.last)this.draw(this.last.result,this.last.m);}
 }
 async refresh(){
  // Clearing font-dependent sprites must not cancel pending theme geometry.
  const generation=++this.refreshGeneration;this.generation++;this.refreshPending++;
  try{
   await this.ready;const scene=new MapScene(this.svg,this.controller.manifest.map);await scene.prepare();
   if(generation!==this.refreshGeneration)return;
   this.scene=scene;this.controller.preview.contours.refreshStyles();
   // Theme only changes ink; geometry buffers remain valid and are not uploaded.
   if(this.gpu)this.gpu.refreshStyles();
   this.labels.clear();this.controller.invalidateLayout();this.controller.schedule();
  }catch(error){if(generation===this.refreshGeneration)this.fallback(error);}
  finally{
   // A refresh can still be decoding resources after the placement queue drains.
   // Count every generation, including superseded work and failed preparations.
   this.refreshPending--;this.controller.resolveWaiters();
  }
 }
 clearLabels(){this.labels.clear();this.generation++;if(this.last)this.draw({placements:[]},this.last.m);}

 activate(){
  if(this.active)return;this.originalOpacity=this.svg.style.opacity;this.svg.style.opacity='0';this.svg.dataset.mapRenderer=this.backend;
  this.pointerStyle=document.createElement('style');this.pointerStyle.textContent='#mapsvg[data-map-renderer] *{pointer-events:none!important}';this.svg.after(this.pointerStyle,...this.canvases);this.active=true;
 }
 fallback(error){
  const packed=this.controller.packedContours;
  if(packed&&!packed.allHydrated){
   if(!this.packedFallback){this.refreshPending++;this.packedFallback=packed.hydrateAll().then(()=>{this.refreshPending--;this.fallback(error);},failure=>{this.refreshPending--;this.controller.status='error';this.controller.error=failure.message;this.controller.details.textContent='Map geometry unavailable: '+failure.message;this.clearLabels();this.controller.visibleIds.clear();packed.close();this.controller.resolveWaiters();});}
   return;
  }
  this.error=error?.message||String(error);this.destroy();this.controller.renderer=null;this.controller.invalidateLayout();this.controller.schedule();}
 destroy(){if(this.controller.renderer===this)this.controller.renderer=null;window.removeEventListener('pagehide',this.pageHidden);this.gpu?.destroy();this.active=false;this.generation++;this.refreshGeneration++;this.canvases.forEach(c=>{c.remove();c.width=c.height=1;});this.labels.clear();this.painted=[];this.paintedGeometry=[];this.pointerStyle?.remove();this.svg.style.opacity=this.originalOpacity||'';delete this.svg.dataset.mapRenderer;this.themeObserver?.disconnect();this.media?.removeEventListener('change',this.themeChanged);}
 camera(view){
  const r=this.svg.getBoundingClientRect(),m=viewMatrix(view,r),z=this.controller.manifest.map.width/view.w;
  const badge=document.getElementById('zlabel'),text=z.toFixed(1)+'× · contours '+((this.controller.manifest.map.contourIntervalsFeet||[250,100,50])[z>=4.5?2:z>=2?1:0])+' ft';if(badge&&badge.textContent!==text)badge.textContent=text;
  const hint=this.svg.parentElement.querySelector('.hint');if(hint)hint.style.display=z>1.02?'block':'none';
  return {m,s:m.a,z};
 }
 prepareFast(m,viewport,z){
  const l=this.controller,pixelsPerMapUnit=l.svg.clientWidth/l.view.w;
  // The authored manifest is immutable for this controller. Only camera-dependent
  // fields change between synchronous fast solves; settled preparation owns its
  // separate items, and solver results copy candidate geometry out of these items.
  const items=this.fastItems??=(l.manifest.annotations.map(a=>({...a,required:false,candidates:EMPTY_CANDIDATES,eligibleReason:undefined,
   ...(a.kind==='symbol'?{anchorTrailRadius:6,anchorTrailFootprint:true}:{})})));
  for(let i=0;i<items.length;i++){
   const a=l.manifest.annotations[i],item=items[i],anchor=[m.a*a.anchor[0]+m.c*a.anchor[1]+m.e,m.b*a.anchor[0]+m.d*a.anchor[1]+m.f];
   item.anchor=anchor;item.candidates=EMPTY_CANDIDATES;item.areaPolygons=a.areaPolygons;item.areaTransform=undefined;
   item.eligibleReason=l.eligible(a,anchor,viewport,z,pixelsPerMapUnit);
   if(a.kind==='line-label')item.repeatDistance=l.policy.repeatDistance;
   if(item.eligibleReason)continue;
   const record=this.labels.get(a.id);
   if(!record){item.eligibleReason='budget-deferred';continue;}
   if(a.areaPolygons)item.areaTransform={a:m.a,b:m.b,c:m.c,d:m.d,e:m.e,f:m.f};
   const [x,y]=record.worldCenter,dx=m.a*x+m.c*y+m.e-record.center[0],dy=m.b*x+m.d*y+m.f-record.center[1];
   item.candidates=[{...record.placement,id:record.placement.candidateId,shape:moveShape(record.placement.footprint,dx,dy)}];
  }
  return items;
 }
 capture(result,m){
  const l=this.controller,scale=Math.hypot(m.a,m.b),key=scale+':'+l.textScale+':'+this.generation+':'+Math.min(devicePixelRatio||1,2);
  if(this.labelScale!==key){this.labels.clear();this.labelScale=key;}
  for(const p of result.placements){
   const e=l.elements.get(p.id),signature=JSON.stringify([p.candidateId,p.application,p.textHTML,p.dx,p.dy]);
   if(this.labels.get(p.id)?.signature===signature)continue;
   const c=center(p.footprint.bounds),w=new DOMPoint(...c).matrixTransform(m.inverse());let top=e;while(top.parentElement!==this.svg)top=top.parentElement;
   const commands=captureCommands(e,this.svg),record={signature,placement:p,commands,center:c,worldCenter:[w.x,w.y],layer:[...top.classList].find(c=>ORDER.includes(c))||'other'};
   this.labels.set(p.id,record);this.sprite(record);
  }
  // Fixed furniture can have been display:none when a zoomed initial URL loaded.
  if(l.manifest.map.width/l.view.w<=1.02){for(const item of this.scene.items)if(item.layer==='fixed-ui'){
   item.commands=captureCommands(item.element,this.svg,{world:true});
   // A hidden refresh can leave empty bounds; recaptured ink needs fresh culling bounds too.
   item.bounds=commandBounds(item.commands);
  }}
 }
 sprite(record){
  const dpr=Math.min(devicePixelRatio||1,2),b=record.placement.footprint.bounds,pad=2,
   x=Math.floor((b.x-pad)*dpr)/dpr,y=Math.floor((b.y-pad)*dpr)/dpr,
   canvas=document.createElement('canvas');canvas.width=Math.ceil((b.x+b.width+pad-x)*dpr);canvas.height=Math.ceil((b.y+b.height+pad-y)*dpr);
  paintCommands(canvas.getContext('2d'),record.commands,new DOMMatrix([dpr,0,0,dpr,-x*dpr,-y*dpr]));
  record.sprite={canvas,x,y,dpr};
 }
 draw(result,m,{foregroundOnly=false}={}){
  if(!this.requestCamera(this.controller.view))return;
  if(!this.active)return;
  const l=this.controller,r=this.svg.getBoundingClientRect(),z=l.manifest.map.width/l.view.w,dpr=Math.min(devicePixelRatio||1,2),width=Math.max(1,Math.ceil(r.width*dpr)),height=Math.max(1,Math.ceil(r.height*dpr));
  m=viewMatrix(l.view,r);this.scene.metersPerPixel=(l.manifest.map.metersPerMapUnit||0)/m.a;
  for(const canvas of this.canvases)if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;foregroundOnly=false;}
  const device=new DOMMatrix([dpr,0,0,dpr,-r.x*dpr,-r.y*dpr]),world=device.multiply(m);
  for(const ctx of (foregroundOnly?[this.fg]:[this.bg,this.contourContext,this.fg]).filter(Boolean)){ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,width,height);}
  const contours=l.preview.contours;
  if(!foregroundOnly){
  this.paintedGeometry=[];
  this.bg.setTransform(...matrixArray(world));this.bg.globalAlpha=1;
  for(const item of this.scene.images)if(this.scene.visible(item,l.layers,z)){this.bg.globalAlpha=item.opacity??1;this.bg.drawImage(item.image,item.x,item.y,item.width,item.height);this.paintedGeometry.push(item);}this.bg.globalAlpha=1;
  if(this.gpu){try{this.gpu.render(l.view,world,z,l.layers.contours);}catch(error){this.useCanvas(error);return;}}
  else if(l.layers.contours)contours.render(l.view,r,l.preview.maxBytes/3,{hidden:false});
  if(!this.gpu&&l.layers.contours&&contours.cached){const c=contours.cached;this.contourContext.setTransform(...matrixArray(world));this.contourContext.globalAlpha=1;this.contourContext.drawImage(contours.canvas,c.x,c.y,c.w,c.h);}
  }
  this.painted=[];this.paintedGeometry=this.paintedGeometry.filter(item=>item.kind==='image');
  const placementsByLayer=new Map();
  for(const p of result.placements){const record=this.labels.get(p.id);if(!record)continue;let entries=placementsByLayer.get(record.layer);if(!entries){entries=[];placementsByLayer.set(record.layer,entries);}entries.push([p,record]);}
  const deviceValues=matrixArray(device),paintState=createPaintState(this.fg);
  const view={x:-world.e/world.a,y:-world.f/world.d,w:width/world.a,h:height/world.d};
  for(const layer of ORDER){
   for(const item of this.scene.byLayer.get(layer)||[])if(this.scene.visible(item,l.layers,z,view)){
    paintCommands(this.fg,item.commands,world,{state:paintState,strokeFactor:item.constantStroke?1/z:1,opacity:layer==='trails'&&this.highlighted&&(this.highlighted instanceof Set?!this.highlighted.has(item.element.dataset.sourceId||item.element.dataset.featureId||item.element.id):item.name!==this.highlighted)?0.25:1});
    this.paintedGeometry.push(item);
   }
   const entries=placementsByLayer.get(layer);
   if(entries){this.fg.setTransform(...deviceValues);this.fg.globalAlpha=1;}
   for(const [p,record] of entries||[]){
    const [x,y]=record.worldCenter,dx=m.a*x+m.c*y+m.e-record.center[0],dy=m.b*x+m.d*y+m.f-record.center[1];
    if(record.sprite.dpr!==dpr)this.sprite(record);const sprite=record.sprite;
    this.fg.drawImage(sprite.canvas,sprite.x+dx,sprite.y+dy,sprite.canvas.width/dpr,sprite.canvas.height/dpr);
    this.painted.push({id:p.id,commands:record.commands,offset:[dx,dy],sprite});
   }
  }
  this.paintedView={...l.view};this.paintedRevision=l.revision;this.paintViewport={x:r.x,y:r.y};this.last={result,m};this.rgbaBytes=this.canvases.reduce((n,c)=>n+c.width*c.height*4,0)+[...this.labels.values()].reduce((n,r)=>n+r.sprite.canvas.width*r.sprite.canvas.height*4,0)+(this.gpu?this.gpu.rgbaBytes-this.contourCanvas.width*this.contourCanvas.height*4:contours.rgbaBytes);
 }
 highlight(selection){if(this.highlighted===selection)return;this.highlighted=selection;if(this.last)this.draw(this.last.result,this.last.m,{foregroundOnly:true});}
 pickTrail(x,y){
  if(!this.active)return null;const l=this.controller,m=viewMatrix(l.view,this.svg.getBoundingClientRect()),p=new DOMPoint(x,y).matrixTransform(m.inverse()),z=l.manifest.map.width/l.view.w,pad=7/z;
  this.hitContext.lineWidth=14/z;this.hitContext.lineCap='round';this.hitContext.lineJoin='round';
  const metersPerPixel=(l.manifest.map.metersPerMapUnit||0)/m.a;
  for(const hit of [...this.scene.hits].reverse()){const limit=Number(hit.element.dataset.maxMpp);if(limit&&metersPerPixel>limit)continue;const b=hit.bounds;if(p.x<b.x-pad||p.x>b.x+b.width+pad||p.y<b.y-pad||p.y>b.y+b.height+pad)continue;if(this.hitContext.isPointInStroke(hit.path,p.x,p.y))return hit.element;}
  return null;
 }
}
