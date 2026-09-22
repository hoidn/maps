import {PackedContourStore} from './packed-contour-store.js';
import packedContourWorker from './dist/packed-contour-worker.txt';
import {RoundFailures} from './round-failures.js';
import {PLACEMENT_ROUNDS,roundEligibility} from './placement-rounds.js';
import {initialBatch} from './initial-batch.js';
import {textEligibility} from './text-importance.js';
import {projectAreaPolygons} from './geometry.js';
import {InitialPlacementClient} from './initial-placement-client.js';
import {pointFallback} from './point-fallback.js';
import {MotionPreview} from './motion-preview.js';
import {CanvasMapRenderer} from '../render/canvas-renderer.js';
import {validateManifest} from './schema.js';
import {ensureFonts,measureElement,MetricCache,createMeasurementHost} from './measure.js';
import {moveShape,intersects,anchorDistance} from './geometry.js';
import {pointCandidates,regionCandidates} from './candidates.js';
import {measurePointVariants} from './point-variants.js';
import {solveLayout} from './place.js';
import {SpatialIndex} from './spatial-index.js';
import {createTrailQuery} from './trail-query.js';
import {buildLineCandidates,applyLineCandidate,reprojectLineCandidate} from './line-candidates.js';
const rectangle=r=>({x:r.x,y:r.y,width:r.width,height:r.height});
const shape=r=>({parts:[r],bounds:r});
const project=(m,[x,y])=>[m.a*x+m.c*y+m.e,m.b*x+m.d*y+m.f];

/** Owns all camera/layer/annotation mutations. A new view is never painted with
 * old visibility: every synchronous transaction hides, validates, then commits. */
export class LayoutController {
  constructor(svg,manifest,policy) {
    this.svg=svg;this.manifest=validateManifest(manifest);this.policy=policy;
    this.textScale=1;try{const value=Number(localStorage.getItem('map-text-scale'));if(value>=1&&value<=1.5)this.textScale=value;}catch{}
    this.mode=manifest.map.mode;this.gestures=new Set();this.revision=0;this.view={x:0,y:0,w:manifest.map.width,h:manifest.map.height};
    this.layers={places:true,peaks:true,names:true,contours:true,water:true,relief:true,landcover:true,boundaries:true,grid:false};
    this.elements=new Map();this.cache=new MetricCache();this.previous=null;this.waiters=[];this.timings=[];this.status='loading';
    this.byId=new Map(manifest.annotations.map(a=>[a.id,a]));this.visibleIds=new Set();this.lineCache=new Map();this.samples=[];
    for(const a of manifest.annotations){const e=document.getElementById(a.elementId);if(!e)throw new Error('Missing annotation '+a.id);this.elements.set(a.id,e);e.style.visibility='hidden';e.style.display='none';
      const t=e.querySelector('text');a.originalTextStyle=t?.getAttribute('style')||'';a.originalTextHTML=t?.innerHTML||'';a.originalOffset=t?.querySelector('textPath')?.getAttribute('startOffset')||'0';
    }
    const topScope=e=>{while(e.parentElement&&e.parentElement!==svg)e=e.parentElement;return e;};
    this.fontScopes=[...new Set([...this.elements.values()].map(topScope))];
    this.strokeScopes=[...new Set([...svg.querySelectorAll('.trails,.hits,.contours,.hydro,.roads,.boundaries,.buildings,[data-layout-obstacle="trail"]')].map(topScope))];
    const details=document.createElement('div');details.dataset.layoutDetails='';details.setAttribute('role','status');details.style.cssText='padding:8px 12px;min-height:20px;font:13px var(--sans,sans-serif)';
    svg.parentElement.after(details);this.details=details;
    this.pointers=new Set();
    if(this.mode==='interactive')this.trackGestures();
    this.createDirectory();
    const textControl=document.getElementById('text-size');if(textControl){textControl.value=String(this.textScale);textControl.addEventListener('change',()=>this.setTextScale(Number(textControl.value)));}
    this.pageHidden=event=>{if(event.persisted)return;this.unloaded=true;this.packedContours?.close();this.initialPlacer?.close();this.renderer?.destroy();this.cancelSettling();clearTimeout(this.settleTimer);cancelAnimationFrame(this.quietFrame);cancelAnimationFrame(this.frame);cancelAnimationFrame(this.fontWatch);this.frame=null;this.settlePending=false;this.observer?.disconnect();window.removeEventListener('pagehide',this.pageHidden);};
    window.addEventListener('pagehide',this.pageHidden);
    this.ready=this.initialize();
  }
  trackGestures(){
    // A pause between pointer events is still part of the same drag. Wheel
    // gestures have no release event, so give their next input a short window.
    this.svg.addEventListener('pointerdown',event=>{
      this.pointers.add(event.pointerId);this.beginGesture('pointer');
    },true);
    const release=event=>{
      if(this.pointers.delete(event.pointerId)&&!this.pointers.size)this.endGesture('pointer');
    };
    for(const type of ['pointerup','pointercancel','lostpointercapture'])window.addEventListener(type,release,true);
    window.addEventListener('blur',()=>{if(this.pointers.size){this.pointers.clear();this.endGesture('pointer');}});
    this.svg.addEventListener('wheel',()=>{this.wheelGesture();},{capture:true,passive:true});
  }
  createDirectory(){
    let select=document.getElementById('goto');
    if(!select){select=document.createElement('select');select.setAttribute('aria-label','Find a place');this.details.before(select);}
    select.replaceChildren(new Option('Go to…',''));
    for(const f of [...this.manifest.features].filter(f=>f.directory).sort((a,b)=>a.name.localeCompare(b.name)))select.add(new Option(f.name,f.id));
    // Existing builders may install their historical onchange after this constructor.
    select.addEventListener('change',event=>{event.stopImmediatePropagation();if(select.value)this.select(select.value);select.value='';},true);
    this.directory=select;
  }
  async initialize(){
    try {
      if(this.mode==='interactive'){this.packedContours=PackedContourStore.from(this.svg,this.manifest.map,packedContourWorker);this.packedContours?.prefetch(this.view);}
      await ensureFonts(this.policy.fontFamilies);
      if(this.unloaded)throw new DOMException('Map unloaded','AbortError');
      if(this.mode==='interactive'){
        this.starting=true;this.initialPlacer=new InitialPlacementClient();
        const backend=new URLSearchParams(location.search).get('renderer')||this.svg.dataset.renderer||'svg';
        if(!['canvas','webgl'].includes(backend))await this.packedContours?.hydrateAll();
        this.preview=new MotionPreview(this.svg,{...this.manifest.map,packedContours:this.packedContours});
        if(['canvas','webgl'].includes(backend))try{this.renderer=new CanvasMapRenderer(this,backend);}catch(error){this.rendererError=error.message;await this.packedContours?.hydrateAll();}
        const renderer=this.renderer;
        renderer?.ready.then(()=>{
          if(this.renderer===renderer){this.startupRendererReady=renderer;if(this.starting)this.schedule();}
        },()=>{}); // The initial transaction reports renderer preparation failure.
        this.preview.ready.catch(()=>{}); // The initial transaction reports preparation failures.
        try{let committed=false;while(!committed){if(this.unloaded)throw new DOMException('Map unloaded','AbortError');this.status='ready';committed=await this.render(true);if(this.status==='error')throw new Error(this.error);if(!committed){this.cache.invalidate();this.lineCache.clear();await ensureFonts(this.policy.fontFamilies);}}}
        finally{this.starting=false;}
      }else{this.status='ready';this.render(true);}
      this.observer=new ResizeObserver(()=>{
        if(this.status!=='ready')return;
        const r=this.svg.getBoundingClientRect(),resized=!this.lastViewport||r.width!==this.lastViewport.width||r.height!==this.lastViewport.height;
        if(resized){this.invalidateLayout();this.cache.invalidate();this.lineCache.clear();this.previous=null;}
        // Rendering mutates observed controls; doing it in the notification
        // delivery itself can create ResizeObserver loops in WebKit.
        this.schedule();
      });
      this.observer.observe(this.svg);
      if(this.mode==='interactive')this.scheduleSettled(0);
      for(const e of this.svg.parentElement.querySelectorAll('.ctl,.layers .box,.readout,.hint,.zlabel,.live-scale'))this.observer.observe(e);
      for(const e of this.svg.parentElement.querySelectorAll('details'))e.addEventListener('toggle',()=>{this.render(false);this.scheduleSettled();});
      document.fonts.addEventListener('loading',()=>this.fontsChanged());
      for(const event of ['loadingdone','loadingerror'])document.fonts.addEventListener(event,()=>{if(this.status==='ready')this.fontsChanged();});
      // Face deletion or replacement need not start a loading cycle. Detect face
      // identity changes before paint; loading events above own real load cycles.
      // WebKit stylesheet synchronization can mark unchanged, unused faces
      // unloaded without a load event. Their cached glyph metrics remain valid.
      let known=[...document.fonts];
      const watchFonts=()=>{
        const current=[...document.fonts];
        if(current.length!==known.length||current.some((face,i)=>face!==known[i])){
          known=current;if(this.status==='ready')this.fontsChanged();
        }
        this.fontWatch=requestAnimationFrame(watchFonts);
      };
      this.fontWatch=requestAnimationFrame(watchFonts);
      return this.getReport();
    } catch(error){this.status='error';this.error=error.message;this.details.textContent='Map labels unavailable: '+error.message;throw error;}
  }
  fontsChanged(){
    this.invalidateLayout();
    this.renderer?.clearLabels();
    this.preview?.restore();
    this.panLayout=null;
    const generation=this.fontGeneration=(this.fontGeneration??0)+1;this.status='loading';
    this.cache.invalidate();this.lineCache.clear();this.previous=null;
    clearTimeout(this.settleTimer);cancelAnimationFrame(this.frame);cancelAnimationFrame(this.quietFrame);
    this.settleTimer=null;this.frame=null;this.quietFrame=null;this.settlePending=false;this.settleGeneration=(this.settleGeneration??0)+1;
    for(const e of this.elements.values()){e.style.visibility='hidden';e.style.display='none';}this.visibleIds.clear();
    this.fontReady=document.fonts.ready.then(()=>ensureFonts(this.policy.fontFamilies)).then(()=>{
      if(generation!==this.fontGeneration)return;
      this.status='ready';return this.render(true).then(committed=>{
        if(generation!==this.fontGeneration)return;
        // Scroll or control changes can invalidate font recovery between slices.
        // Keep recovery pending until a current placement actually commits.
        if(committed===false&&this.status==='ready')this.scheduleSettled(0);
        else this.resolveWaiters();
      });
    }).catch(error=>{
      if(generation!==this.fontGeneration)return;
      this.status='error';this.error=error.message;this.details.textContent='Map labels unavailable: '+error.message;this.resolveWaiters();
    });
  }
  requestView(view){if(this.panLayout&&view.w===this.view.w&&view.h===this.view.h&&(view.x!==this.view.x||view.y!==this.view.y))this.panLayout.provisional=false;this.revision++;this.cancelSettling();if(view.w!==this.view.w||view.h!==this.view.h)this.panLayout=null;this.view={...view};this.onCameraChange?.(this.view);this.schedule();}
  setLayer(layer,visible){if(!(layer in this.layers))throw new Error('Unknown layer');this.invalidateLayout();this.layers[layer]=visible;this.preview?.restore();this.preview?.release();this.previewDirty=true;this.schedule();}
  select(id){const f=this.manifest.features.find(f=>f.id===id);if(!f)throw new Error('Unknown feature');this.details.textContent=f.name;this.selected=id;
    if(this.mode==='interactive'){const w=this.manifest.map.width/4.5,h=this.manifest.map.height/4.5;this.requestView({x:Math.max(0,Math.min(this.manifest.map.width-w,f.anchor[0]-w/2)),y:Math.max(0,Math.min(this.manifest.map.height-h,f.anchor[1]-h/2)),w,h});}
  }
  startupSnapshot(){const r=this.svg.getBoundingClientRect();return JSON.stringify([this.view,this.layers,this.textScale,this.revision,r.x,r.y,r.width,r.height,this.controls()]);}
  paintStartupCamera(){
    const renderer=this.renderer;
    if(renderer&&renderer.basePrepared&&!renderer.refreshPending&&renderer.requestCamera(this.view)){
      // Geometry is complete for this camera before any annotation is exposed.
      // Readiness continues to mean initial labels; camera paint is independent.
      this.preview?.restore();renderer.activate();renderer.draw({placements:[]},renderer.camera(this.view).m);
    }else if(renderer){
      // Scene preparation walks live SVG sources across asynchronous image work.
      // Keep its backgrounds attached until the persistent surface is ready.
      this.camera(false);
    }else{this.preview?.show();this.camera(false);this.preview?.render(this.view,this.svg.getBoundingClientRect());}
  }
  schedule(){
    if(this.unloaded)return;
    if(this.status==='loading'&&this.starting){
      if(!this.frame)this.frame=requestAnimationFrame(()=>{this.frame=null;if(this.status==='loading')this.paintStartupCamera();else this.render(false);});
      return;
    }
    if(this.status!=='ready')return;
    if(!this.frame)this.frame=requestAnimationFrame(()=>{this.frame=null;this.render(false);});
    this.scheduleSettled();
  }
  cancelSettling(preserveRound=null){
    if(this.roundJob&&this.roundJob!==preserveRound){this.roundJob.cancelled=true;this.roundJob=null;}
    const job=this.settleJob;if(!job)return;
    job.cancelled=true;job.cleanup?.();this.settleJob=null;this.initialPlacer?.cancel();
  }
  invalidateLayout(){this.revision++;this.panLayout=null;this.cancelSettling();}
  beginGesture(kind){
    if(this.settleJob||this.roundJob)this.settlePending=true;
    this.gestures.add(kind);this.cancelSettling();
    clearTimeout(this.settleTimer);cancelAnimationFrame(this.quietFrame);
    this.settleTimer=null;this.quietFrame=null;this.settleGeneration=(this.settleGeneration??0)+1;
  }
  endGesture(kind){
    if(this.gestures.delete(kind)&&!this.gestures.size){
      if(this.settlePending)this.scheduleSettled(0);else this.resolveWaiters();
    }
  }
  wheelGesture(){this.beginGesture('wheel');clearTimeout(this.wheelTimer);this.wheelTimer=setTimeout(()=>{this.wheelTimer=null;this.endGesture('wheel');},120);}
  scheduleSettled(delay=80){
    if(this.unloaded)return;
    const generation=this.settleGeneration=(this.settleGeneration??0)+1;
    clearTimeout(this.settleTimer);cancelAnimationFrame(this.quietFrame);
    this.settleTimer=null;this.quietFrame=null;this.settlePending=true;
    if(this.gestures.size)return;
    this.settleTimer=setTimeout(()=>{
      this.quietFrame=requestAnimationFrame(()=>{
        if(generation!==this.settleGeneration||this.gestures.size)return;
        this.quietFrame=requestAnimationFrame(async()=>{
          if(generation!==this.settleGeneration||this.gestures.size)return;
          this.settleTimer=null;this.quietFrame=null;
          const committed=await this.render(true);
          if(generation!==this.settleGeneration||this.gestures.size)return;
          if(committed===false&&this.status==='ready')this.scheduleSettled();
          else{this.settlePending=false;this.resolveWaiters();}
        });
      });
    },delay);
  }
  whenSettled(){return this.ready.then(()=>this.fontReady).then(()=>this.frame||this.settlePending||this.settleJob||this.roundJob||this.gestures.size||this.renderer?.refreshPending||this.renderer?.geometryPending?new Promise(resolve=>this.waiters.push(resolve)):this.getReport());}
  resolveWaiters(){if(this.frame||this.settlePending||this.settleJob||this.roundJob||this.gestures.size||this.renderer?.refreshPending||this.renderer?.geometryPending)return;for(const resolve of this.waiters.splice(0))resolve(this.getReport());}
  getReport(){return {textScale:this.textScale,renderer:{requested:this.renderer?.requestedBackend||'svg',active:this.renderer?.backend||'svg',fallback:this.renderer?.fallbackReason||this.rendererError,rgbaBytes:this.renderer?.rgbaBytes,gpuBufferBytes:this.renderer?.gpu?.bufferBytes},status:this.status,error:this.error,view:{...this.view},diagnostics:this.result?.diagnostics,outcomes:this.result?.outcomes||[],missingRequired:this.result?.missingRequired||[],placements:this.result?.placements||[],timings:this.timings.slice(-200),samples:this.samples.slice(-200),transactionKind:this.transactionKind};}
  camera(readAfter=true){
    if(this.renderer?.active&&this.transactionKind==='fast')return this.renderer.camera(this.view);
    const v=this.view,W=this.manifest.map.width;
    // Read the old, internally consistent camera before writing either scale.
    // A layout read between viewBox and --k makes Firefox shape text at a
    // transient zoom, so nominally constant screen fonts acquire different metrics.
    const before=this.svg.getScreenCTM(),old=this.svg.viewBox.baseVal,oldX=old.x,oldY=old.y;
    const translating=this.cameraView&&this.cameraView.w===v.w&&this.cameraView.h===v.h;
    const width=this.svg.clientWidth,height=this.svg.clientHeight;
    const oldFit=Math.min(width/old.width,height/old.height),newFit=Math.min(width/v.w,height/v.h);
    const s=Math.hypot(before.a,before.b)*newFit/oldFit,z=W/v.w;
    this.svg.setAttribute('viewBox',`${v.x} ${v.y} ${v.w} ${v.h}`);
    this.fontScaleValue=(this.mode==='interactive'||this.manifest.map.print)?(translating&&Math.abs(Number(this.fontScaleValue)-1/s)<1e-12?this.fontScaleValue:String(1/s)):'1';
    for(const scope of this.fontScopes)if(scope.style.getPropertyValue('--k')!==this.fontScaleValue)scope.style.setProperty('--k',this.fontScaleValue);
    const strokeScale=this.manifest.map.print?1/s:1/z;
    for(const scope of this.strokeScopes)if(scope.style.getPropertyValue('--s')!==String(strokeScale))scope.style.setProperty('--s',String(strokeScale));
    this.svg.classList.toggle('zoomed',z>1.02);this.svg.classList.toggle('z2',z>=2);this.svg.classList.toggle('z5',z>=4.5);
    for(const [layer,on] of Object.entries(this.layers))this.svg.classList.toggle('no-'+layer,!on);
    this.updateDetail(s);
    const badge=document.getElementById('zlabel');if(badge)badge.textContent=z.toFixed(1)+'× · contours '+((this.manifest.map.contourIntervalsFeet||[250,100,50])[z>=4.5?2:z>=2?1:0])+' ft';
    const current=this.svg.viewBox.baseVal;
    const m=translating?new DOMMatrix([before.a,before.b,before.c,before.d,before.e-before.a*(current.x-oldX)-before.c*(current.y-oldY),before.f-before.b*(current.x-oldX)-before.d*(current.y-oldY)]):readAfter?this.svg.getScreenCTM():null;
    this.cameraView={...v};return {m,s:m?Math.hypot(m.a,m.b):s,z};
  }
  updateDetail(scale){
    const meters=this.manifest.map.metersPerMapUnit;if(!meters)return;
    const mpp=meters/scale;
    this.detailElements??=[...this.svg.querySelectorAll('[data-max-mpp]')].map(e=>({e,limit:Number(e.dataset.maxMpp)}));
    for(const item of this.detailElements){const visible=mpp<=item.limit;if(item.visible!==visible){item.e.style.visibility=visible?'':'hidden';item.visible=visible;}}
  }
  setTextScale(value){
    if(!Number.isFinite(value)||value<1||value>1.5)throw new Error('Text scale must be between 1 and 1.5');
    this.textScale=value;try{localStorage.setItem('map-text-scale',String(value));}catch{}
    this.cache.invalidate();this.lineCache.clear();this.invalidateLayout();this.schedule();
  }
  textSizes(s){
    if(this.manifest.map.print)return Object.fromEntries(Object.entries(this.manifest.map.print.points).map(([key,value])=>[key,value*96/72]));
    const typography=this.policy.typography||{},z=this.manifest.map.width/this.view.w;
    const meters=this.manifest.map.metersPerMapUnit;
    const detail=meters?Math.max(1,(typography.referenceMetersPerPixel??32)/(meters/s)):z;
    const growth=1+((typography.maximumZoomGrowth??1.18)-1)*Math.min(1,Math.max(0,Math.log2(detail))/(typography.growthStops??2));
    return Object.fromEntries(Object.entries(this.policy.sizes).map(([key,value])=>[key,value*growth*this.textScale]));
  }
  normalize(a,e,s){
    if(this.mode!=='interactive'&&!this.manifest.map.print)return;
    const t=e.querySelector('text');if(!t)return;
    const sizes=this.textSizes(s),size=a.style?.startsWith('l-contour')?sizes.contour:a.kind==='region-label'?sizes.region:a.style?.startsWith('l-trail')?sizes.trail:a.style==='l-settlement'?(sizes.settlement??sizes.place):a.style==='l-road'?(sizes.road??sizes.secondary):a.style==='l-road-major'?(sizes.roadMajor??sizes.trail):a.style==='l-road-ref'?(sizes.roadRef??sizes.trail):a.style==='l-major'?(sizes.major??sizes.region):a.style==='l-minor'||a.style==='l-peak'?sizes.secondary:sizes.place;
    t.style.fontSize=(a.geometryId?size/s:size)+'px';t.style.strokeWidth=(a.geometryId?2.8/s:2.8)+'px';
    for(const sub of t.querySelectorAll('tspan:not([data-layout-primary])')){sub.style.fontSize=sizes.secondary+'px';sub.setAttribute('dy',String(sizes.secondary*1.3));}
  }
  controls(){
    const out=[];let i=0;
    const selector='.ctl,.layers .box,.hint,.readout,.zlabel,.live-scale';
    // HTML controls may be added or replaced, but traversing their sibling SVG
    // walks the entire immutable artwork tree on every camera frame.
    const controls=[];for(const root of this.svg.parentElement.children){if(root===this.svg)continue;if(root.matches(selector))controls.push(root);controls.push(...root.querySelectorAll(selector));}
    for(const e of controls){
      const r=rectangle(e.getBoundingClientRect());if(r.width&&r.height&&getComputedStyle(e).display!=='none')out.push({id:'control-'+i++,kind:'control',shape:shape(r)});
    }
    let fixedIndex=0;
    for(const e of this.fixedControlElements??=(Array.from(this.svg.querySelectorAll('.cartouche,.scale')))){
      const reserve=this.policy.fixedControlReserves?.[fixedIndex++];
      if(this.renderer?.active&&this.manifest.map.width/this.view.w>1.02)continue;
      if(getComputedStyle(e.parentElement).display==='none')continue;
      const r=rectangle(e.getBoundingClientRect());if(r.width&&r.height){
        if(reserve){r.x-=reserve.left;r.y-=reserve.top;r.width+=reserve.left+reserve.right;r.height+=reserve.top+reserve.bottom;}
        out.push({id:'fixed-'+i++,kind:'control',shape:shape(r)});
      }
    }
    return out;
  }
  trailQuery(m,s,z){
    if(!this.trailIndex){
      this.trailIndex=new SpatialIndex(32);this.trailSegments=[];this.maxTrailWidth=0;
      for(const e of this.svg.querySelectorAll('[data-layout-obstacle="trail"]')){
        const d=e.getAttribute('d');if(/[CQAHVSTZcqahvstz]/.test(d))throw new Error('Protected trail must be an absolute polyline');
        const numbers=(d.match(/[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g)||[]).map(Number);
        const width=parseFloat(getComputedStyle(e).strokeWidth)*(this.manifest.map.print?s:this.mode==='interactive'?z:1);
        if(!Number.isFinite(width))throw new Error('Invalid protected trail stroke');
        this.maxTrailWidth=Math.max(this.maxTrailWidth,width);
        for(let i=2;i<numbers.length;i+=2){
          const a=[numbers[i-2],numbers[i-1]],b=[numbers[i],numbers[i+1]],id=e.id+':'+i/2;
          const bounds={x:Math.min(a[0],b[0]),y:Math.min(a[1],b[1]),width:Math.abs(a[0]-b[0]),height:Math.abs(a[1]-b[1])};
          const segment={id,a,b,width,bounds,maxMpp:Number(e.dataset.maxMpp)||null};this.trailSegments.push(segment);
          this.trailIndex.insert(this.trailSegments.length-1,bounds);
        }
      }
    }
    return createTrailQuery({segments:this.trailSegments,index:this.trailIndex,matrix:m,inverse:m.inverse(),
      strokeScale:this.manifest.map.print?1/s:this.mode==='interactive'?1/z:1,scale:s,maxWidth:this.maxTrailWidth,metersPerPixel:this.manifest.map.metersPerMapUnit/s});
  }

  eligible(a,anchor,viewport,z,pixelsPerMapUnit){
    if(!this.layers[a.layer])return 'layer-off';
    const textReason=textEligibility(a,this.manifest.map.metersPerMapUnit/(pixelsPerMapUnit??this.svg.clientWidth/this.view.w));if(textReason)return textReason;
    if(a.geometryBounds){const b=a.geometryBounds,pad=64/(pixelsPerMapUnit??this.svg.clientWidth/this.view.w);if(b[2]+pad<this.view.x||b[0]-pad>this.view.x+this.view.w||b[3]+pad<this.view.y||b[1]-pad>this.view.y+this.view.h)return 'outside-view';}
    if(a.maxMetersPerPixel&&this.manifest.map.metersPerMapUnit&&this.manifest.map.metersPerMapUnit/(pixelsPerMapUnit??this.svg.clientWidth/this.view.w)>a.maxMetersPerPixel)return 'below-detail';
    if(/(?:^| )l-contour-f(?: |$)/.test(a.style||'')&&z<2||/(?:^| )l-contour-ff(?: |$)/.test(a.style||'')&&z<4.5)return 'below-detail';
    if(['point-label','symbol','region-label','edge-pointer'].includes(a.kind)&&!intersects({x:anchor[0]-.5,y:anchor[1]-.5,width:1,height:1},viewport))return 'outside-view';
  }
  panKey(m,viewport){return JSON.stringify([this.view.w,this.view.h,viewport.width,viewport.height,m.a,m.b,m.c,m.d].map(v=>Math.round(v*1e8)/1e8));}
  fixedPlacements(m,key,settled=false){
    if(this.mode!=='interactive'||this.panLayout?.key!==key||settled&&this.panLayout?.provisional)return null;
    const {matrix,placements}=this.panLayout,dx=m.e-matrix.e,dy=m.f-matrix.f;
    return new Map([...placements].map(([id,p])=>[id,{...p,footprint:moveShape(p.footprint,dx,dy)}]));
  }
  rememberPlacements(result,m,key){
    if(this.mode!=='interactive')return;
    if(this.panLayout?.key!==key||this.panLayout?.provisional&&!this.starting)this.panLayout={key,matrix:{e:m.e,f:m.f},placements:new Map()};
    this.panLayout.provisional=!!this.starting;
    const {matrix,placements}=this.panLayout;
    for(const p of result.placements)if(!placements.has(p.id))placements.set(p.id,{...p,footprint:moveShape(p.footprint,matrix.e-m.e,matrix.f-m.f)});
  }
  fastPrepared(m,viewport,z,fixed=null,pixelsPerMapUnit=this.svg.clientWidth/this.view.w){
    if(this.renderer?.active)return this.renderer.prepareFast(m,viewport,z);
    const previous=new Map((this.previous?.placements||[]).map(p=>[p.id,p]));
    return this.manifest.annotations.map(a=>{
      const anchor=project(m,a.anchor),item={...a,anchor,candidates:[],required:false};
      if(a.kind==='symbol'){item.anchorTrailRadius=6;item.anchorTrailFootprint=true;}
      item.eligibleReason=this.eligible(a,anchor,viewport,z,pixelsPerMapUnit);if(item.eligibleReason)return item;
      item.areaPolygons=projectAreaPolygons(a.areaPolygons,m);
      if(fixed){const p=fixed.get(a.id);if(p)item.candidates=[{...p,id:p.candidateId,shape:p.footprint}];else item.eligibleReason='budget-deferred';if(a.kind==='line-label')item.repeatDistance=this.policy.repeatDistance;return item;}
      const old=previous.get(a.id),retained=this.retained?.get(a.id);
      if(!old||!retained){item.eligibleReason='budget-deferred';return item;}
      if(old.application){
        try{item.candidates=[reprojectLineCandidate({...old,id:old.candidateId,shape:old.footprint},retained.parentMatrix,this.elements.get(a.id).parentElement.getScreenCTM())];}
        catch{item.eligibleReason='budget-deferred';}
      }else{
        // Screen font hinting/rounding can vary between engines at fractional
        // transforms. Retain the candidate, never an unvalidated stale footprint.
        try{const current=measureElement(this.elements.get(a.id),0,{canvasInk:!!this.renderer});item.candidates=[{...old,id:old.candidateId,shape:moveShape(current,old.dx??0,old.dy??0)}];}
        catch{item.eligibleReason='invalid-metrics';}
      }
      if(a.kind==='line-label')item.repeatDistance=this.policy.repeatDistance;
      return item;
    });
  }
  commit(result,m,s,normalizeText=false){
    if(this.renderer?.active&&!normalizeText){this.visibleIds=new Set(result.placements.map(p=>p.id));this.previous=result;this.renderer.draw(result,m);return;}
    const next=new Set(result.placements.map(p=>p.id));
    for(const [id,e] of this.elements)if(!next.has(id)&&e.style.display!=='none'){e.style.visibility='hidden';e.style.display='none';}
    const retained=new Map();
    for(const placement of result.placements){
      const e=this.elements.get(placement.id),a=this.byId.get(placement.id),text=e.querySelector('text');
      if(e.style.display!=='inline')e.style.display='inline';
      if(text&&!placement.application){const html=placement.textHTML??a.originalTextHTML;if(text.innerHTML!==html)text.innerHTML=html;}
      if(normalizeText)this.normalize(a,e,s);
      const application=placement.application,transform=application?.transform??`translate(${placement.dx/s} ${placement.dy/s})`;
      if(application){
        const signature=JSON.stringify([application,placement.textHTML]);
        if(e.appliedLineSignature!==signature||e.getAttribute('transform')!==transform||application.startOffset!==undefined&&text.querySelector('textPath')?.getAttribute('startOffset')!==String(application.startOffset)){applyLineCandidate(e,placement);e.appliedLineSignature=signature;}
      }else if(e.getAttribute('transform')!==transform)e.setAttribute('transform',transform);
      // applyLineCandidate owns the text HTML and chosen startOffset together.
      // Restoring raw textHTML here would reset that measured offset to50%.
      if(e.style.visibility!=='visible')e.style.visibility='visible';
    }
    const parents=new Map();
    for(const placement of result.placements){
      const e=this.elements.get(placement.id),a=this.byId.get(placement.id),parent=e.parentElement;
      if(placement.application&&!parents.has(parent)){
        const old=this.retained?.get(a.id)?.parentMatrix,delta=this.commitMatrix&&['a','b','c','d'].every(k=>Math.abs(m[k]-this.commitMatrix[k])<1e-9);
        parents.set(parent,old&&delta?new DOMMatrix([old.a,old.b,old.c,old.d,old.e+m.e-this.commitMatrix.e,old.f+m.f-this.commitMatrix.f]):parent.getScreenCTM());
      }
      retained.set(a.id,{anchor:project(m,a.anchor),parentMatrix:placement.application?parents.get(parent):null});
    }
    this.visibleIds=next;this.retained=retained;this.previous=result;this.commitMatrix=m;
    if(this.renderer){this.renderer.capture(result,m);this.renderer.activate();this.renderer.draw(result,m);}
  }
  pickTrail(x,y){return this.renderer?.pickTrail(x,y)||null;}
  async render(includeCurves){
    if(!includeCurves||this.mode!=='interactive'||this.starting)return this.renderPass(includeCurves);
    if(this.status!=='ready'||this.rendering||this.roundJob)return false;
    this.cancelSettling();
    const token={revision:this.revision,fontGeneration:this.fontGeneration,failures:new RoundFailures()};this.roundJob=token;let completed=false;
    const current=()=>this.roundJob===token&&!token.cancelled&&this.revision===token.revision&&this.fontGeneration===token.fontGeneration&&this.status==='ready'&&!this.gestures.size&&(!token.snapshot||token.snapshot===this.startupSnapshot());
    try{
      for(const [index,round] of PLACEMENT_ROUNDS.entries()){
        if(!current())return false;
        if(!await this.renderPass(true,round,token)||!current())return false;
        token.snapshot=this.startupSnapshot();
        // Two animation boundaries leave a real browser paint opportunity before
        // the next tier performs DOM measurements. Idle stays pending throughout.
        if(index<PLACEMENT_ROUNDS.length-1){await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);}
      }
      completed=true;return true;
    }finally{
      const owned=this.roundJob===token;if(owned)this.roundJob=null;
      // A direct settled request (for example font recovery) may lack the usual
      // settle timer. A changed scroll/control snapshot must not resolve idle
      // with only earlier tiers painted; arrange a current retry when unowned.
      if(!completed&&owned&&this.status==='ready'&&!this.settlePending)this.scheduleSettled(0);
      this.resolveWaiters();
    }
  }
  async renderPass(includeCurves,round=null,roundJob=null){
    if(this.status!=='ready'||this.rendering)return;
    this.rendering=true;const started=performance.now(),settled=includeCurves||this.mode==='static';
    this.transactionKind=settled?'settled':'fast';
    const cooperative=settled&&this.mode==='interactive',asyncSettled=cooperative&&!this.starting;
    let job;if(cooperative){this.cancelSettling(roundJob);job={revision:this.revision};if(this.starting)job.fonts=[...document.fonts].map(face=>[face,face.status]);this.settleJob=job;}
    const current=()=>!job||!job.cancelled&&job.revision===this.revision;
    const validSnapshot=()=>{
      if(!current())return false;
      const fonts=job.fonts&&[...document.fonts];
      const fontsMatch=!fonts||fonts.length===job.fonts.length&&fonts.every((face,i)=>face===job.fonts[i][0]&&face.status===job.fonts[i][1]);
      if(fontsMatch&&job.snapshot===this.startupSnapshot())return true;
      // Live DOM measurements can cross a scroll/control change between slices.
      // Only the current job may discard these caches; an obsolete job must not
      // invalidate measurements belonging to a newer camera transaction.
      this.cache.invalidate();this.lineCache.clear();return false;
    };
    const pause=async()=>{
      this.rendering=false;await new Promise(resolve=>setTimeout(resolve,0));
      // Scrolling can change DOM measurement coordinates without changing the
      // map view. Reject the slice before inserting metrics with an old anchor
      // and a new screen footprint, even if a later scroll restores the frame.
      if(!validSnapshot())throw new DOMException('Placement cancelled','AbortError');
      this.rendering=true;
    };
    try {
      if(this.starting&&settled)this.status='loading';
      if(settled)this.preview?.restore();else if(!this.renderer?.active)this.preview?.show(this.panLayout?.placements);
      // With no retained labels, no painted annotation needs geometry validation.
      // Keep the camera write atomic and defer its layout to normal browser paint.
      const dormant=!settled&&this.previous?.placements.length===0&&!!this.lastViewport&&!this.panLayout?.placements.size;
      const {m,s,z}=this.camera(!dormant),viewport=dormant?this.lastViewport:rectangle(this.svg.getBoundingClientRect()),obstacles=dormant?[]:this.controls();
      // Label style writes below must not force layout again for every scale gate.
      const pixelsPerMapUnit=dormant?null:this.svg.clientWidth/this.view.w;
      if(job)job.snapshot=this.startupSnapshot();
      const key=m?this.panKey(m,viewport):null,fixed=m?this.fixedPlacements(m,key,asyncSettled):null;
      // Pure translation preserves prior trail clearance. Only the viewport,
      // fixed controls and the retained-label visibility need checking again.
      const queryObstacles=dormant||!settled&&fixed?undefined:this.trailQuery(m,s,z);
      if(!settled&&!fixed&&!this.renderer?.active)for(const p of this.previous?.placements||[])if(!p.application)this.elements.get(p.id).setAttribute('transform','');
      // Preserve occupied map positions even while their text is clipped or under
      // a control. Newly revealed labels must not displace existing placements.
      if(settled&&fixed)for(const [id,p] of fixed)obstacles.push({id:'pan-reserved:'+id,kind:'label',shape:p.footprint});
      if(!settled&&!this.renderer?.active)this.preview?.render(this.view,viewport);
      if(this.previewDirty){this.previewDirty=false;this.preview?.invalidate();}
      const cameraDone=performance.now();let prepared,batch;
      if(dormant)prepared=this.manifest.annotations.map(a=>({...a,required:false,candidates:[],eligibleReason:this.layers[a.layer]?'budget-deferred':'layer-off'}));
      else if(!settled)prepared=this.fastPrepared(m,viewport,z,fixed,pixelsPerMapUnit);
      else {
        // Fractional zoom can change browser glyph advances despite inverse CSS
        // scaling. Keep only metrics measured at this exact screen scale.
        const metricScaleKey=s+':'+this.fontScaleValue;
        if(this.metricScaleKey!==metricScaleKey){this.cache.invalidate();this.lineCache.clear();this.metricScaleKey=metricScaleKey;}
        const measuring=new Map();let measurementHost;
        const measurementElement=a=>{
          if(!cooperative)return this.elements.get(a.id);
          if(measuring.has(a.id))return measuring.get(a.id);
          const original=this.elements.get(a.id),e=original.cloneNode(true);e.removeAttribute('id');e.removeAttribute('data-layout-id');e.dataset.layoutMeasurement='';
          for(const child of e.querySelectorAll('[id]'))child.removeAttribute('id');
          e.style.visibility='hidden';e.style.display='inline';e.setAttribute('transform','');
          const text=e.querySelector('text');if(text)text.innerHTML=a.originalTextHTML;
          (measurementHost??=createMeasurementHost(this.svg)).parentFor(original.parentElement).append(e);measuring.set(a.id,e);this.normalize(a,e,s);return e;
        };
        if(job)job.cleanup=()=>{measurementHost?.remove();measuring.clear();};
        let deadline=performance.now()+8;
        for(const a of this.starting||cooperative?[]:this.manifest.annotations){
          const e=this.elements.get(a.id),text=e.querySelector('text');e.style.visibility='hidden';
          if(fixed?.has(a.id))continue;
          if(this.eligible(a,project(m,a.anchor),viewport,z,pixelsPerMapUnit)){e.style.display='none';continue;}
          e.style.display='inline';e.setAttribute('transform','');
          if(text&&text.innerHTML!==a.originalTextHTML)text.innerHTML=a.originalTextHTML;
          this.normalize(a,e,s);
        }
        prepared=[];
        const facilityCounts=new Map();for(const a of this.manifest.annotations)if(a.kind==='symbol')facilityCounts.set(a.featureId,(facilityCounts.get(a.featureId)||0)+1);
        // Startup has a small first-paint budget. Idle preparation resumes through
        // the cancellable 8 ms slices above until every eligible label is considered.
        const candidateDeadline=this.mode==='interactive'&&!asyncSettled?performance.now()+(this.policy.interactiveCandidateBudgetMs??24):Infinity;
        batch=this.starting?initialBatch(this.manifest.annotations,{eligible:a=>!this.eligible(a,project(m,a.anchor),viewport,z,pixelsPerMapUnit)}):null;
        const ordered=batch?.ordered??[...this.manifest.annotations].sort((a,b)=>(b.priority??0)-(a.priority??0)||a.id.localeCompare(b.id));
        for(const a of ordered){
          if(cooperative&&performance.now()>=deadline){await pause();deadline=performance.now()+8;}
          let e=measuring.get(a.id)||this.elements.get(a.id);
          const anchor=project(m,a.anchor),item={...a,anchor,candidates:[],required:this.mode==='static'&&a.requiredProfiles.includes('static-default')};
          if(a.kind==='symbol'){item.anchorTrailRadius=6;item.anchorTrailFootprint=true;}
          if(a.kind==='line-label')item.repeatDistance=this.policy.repeatDistance;
          item.eligibleReason=this.eligible(a,anchor,viewport,z,pixelsPerMapUnit)||roundEligibility(a,round,fixed?.has(a.id));
          if(item.eligibleReason){prepared.push(item);continue;}
          if(roundJob?.failures.has(a.id)){item.cachedFailure=roundJob.failures.get(a.id);prepared.push(item);continue;}
          item.areaPolygons=projectAreaPolygons(a.areaPolygons,m);
          if(fixed?.has(a.id)){
            const p=fixed.get(a.id);item.candidates=[{...p,id:p.candidateId,shape:p.footprint}];
            item.allowedObstacleIds=[...(item.allowedObstacleIds||[]),'pan-reserved:'+a.id];
            item.repeatDistance=a.kind==='line-label'?this.policy.repeatDistance:(a.repeatDistance??0);
            prepared.push(item);continue;
          }
          if((this.starting||a.kind==='line-label')&&!batch?.minimumIds.has(a.id)&&performance.now()>=candidateDeadline&&!this.cache.entries.has(a.id)&&!this.lineCache.has(a.id)){item.eligibleReason='budget-deferred';prepared.push(item);continue;}
          try {
            const line=a.kind==='line-label'&&(a.geometryId||a.geometryIds?.length);
            if(line){
              if(this.packedContours?.needsAnnotation(a)){this.rendering=false;await this.packedContours.ensureAnnotation(a);if(cooperative&&!validSnapshot())throw new DOMException('Placement cancelled','AbortError');this.rendering=true;}
              const parentMatrix=e.parentElement.getScreenCTM(),cached=this.lineCache.get(a.id);
              if(cached)try{
                // Empty results also belong to a particular scale: a path too
                // short at overview may fit after zoom. An empty map() would
                // otherwise skip reprojectLineCandidate's matrix validation.
                if(['a','b','c','d'].some(k=>!Number.isFinite(cached.parentMatrix[k])||!Number.isFinite(parentMatrix[k])||Math.abs(cached.parentMatrix[k]-parentMatrix[k])>1e-9))throw new Error('Line scale changed');
                item.candidates=cached.candidates.map(c=>reprojectLineCandidate(c,cached.parentMatrix,parentMatrix));
              }catch{this.lineCache.delete(a.id);}
              if(!this.lineCache.has(a.id)&&!batch?.minimumIds.has(a.id)&&performance.now()>=candidateDeadline){item.eligibleReason='budget-deferred';prepared.push(item);continue;}
              if(!this.lineCache.has(a.id)){
                e=measurementElement(a);
                // Only the current clone is attached to the isolated host. The
                // static setup pass normalizes its original element in place.
                item.candidateDiagnostics={};item.candidates=buildLineCandidates({annotation:a,element:e,measurement:{canvasInk:!!this.renderer},diagnostics:item.candidateDiagnostics,policy:{...this.policy,maxLineCandidates:this.mode==='interactive'?Math.min(this.policy.maxLineCandidates??24,4):this.policy.maxLineCandidates}});
              }
              this.lineCache.set(a.id,{candidates:item.candidates,parentMatrix});
              item.repeatDistance=this.policy.repeatDistance;
            }else{
              let cached=this.cache.entries.get(a.id);
              if(!cached){e=measurementElement(a);cached={anchor,scale:s,metric:measureElement(e,0,{canvasInk:!!this.renderer}),pointVariants:a.variants?.length?measurePointVariants(e,a,{canvasInk:!!this.renderer}):[]};this.cache.entries.set(a.id,cached);}
              const dx=anchor[0]-cached.anchor[0],dy=anchor[1]-cached.anchor[1],metric=moveShape(cached.metric,dx,dy);
              if(a.kind==='region-label')item.candidates=regionCandidates(item,metric,this.policy);
              else {
                if(a.kind==='symbol'&&facilityCounts.get(a.featureId)>1)item.facilityOffsets=[[16,0],[-16,0],[0,16],[0,-16],[12,12],[-12,12],[12,-12],[-12,-12]];
                const policy={...this.policy,densePointCandidates:item.required,pointPaintReserve:(this.mode==='interactive'||this.manifest.map.print)?.125:0};item.candidates=pointCandidates(item,metric,policy);
                for(const v of cached.pointVariants||[])item.candidates.push(...pointCandidates(item,moveShape(v.shape,dx,dy),policy).map(c=>({...c,id:v.id+'-'+c.id,textHTML:v.textHTML})));
                if(a.kind==='point-label'&&!policy.densePointCandidates){
                  item.fallbackData={annotation:{kind:item.kind,anchor:item.anchor},metric,variants:(cached.pointVariants||[]).map(v=>({...v,shape:moveShape(v.shape,dx,dy)})),policy};
                  item.fallbackCandidates=()=>pointFallback(item.fallbackData);
                }
              }
            }
          }catch(error){if(error.name==='AbortError')throw error;item.eligibleReason=error.message.includes('overflow')?'no-valid-candidate':'invalid-metrics';item.metricError=error.message;}
          finally{if(cooperative){measuring.get(a.id)?.remove();measuring.delete(a.id);}}
          prepared.push(item);
        }
      }
      job?.cleanup?.();
      if(job&&!validSnapshot())return false;
      this.prepared=prepared;this.lastObstacles=obstacles;
      const preparedDone=performance.now();
      const repeatReservations=settled&&fixed?[...fixed].map(([id,p])=>({id,featureId:this.byId.get(id).featureId,repeatGroup:this.byId.get(id).repeatGroup,distance:this.byId.get(id).kind==='line-label'?this.policy.repeatDistance:(this.byId.get(id).repeatDistance??0),shape:p.footprint})):[];
      const args={annotations:prepared,obstacles,queryObstacles,repeatReservations,viewport,previous:this.previous,policy:{...this.policy,reuseRoundFailures:!!roundJob,exhaustiveDiagnostics:this.mode!=='interactive',repairMaxNeighbors:this.mode==='interactive'?0:2,requiredGroups:this.mode==='static'?(this.manifest.map.requiredRoutes??this.policy.requiredRoutes):[]}};
      const finish=result=>{
        if(roundJob)roundJob.failures.capture(prepared,result);
        if(settled)this.preview?.restore();
        this.transactionKind=settled?'settled':'fast';this.result=result;
        const solvedDone=performance.now();this.commit(this.result,m,s,settled);
        if(batch||!this.firstUsefulLabels&&this.initialLabelBatch){
          const names=result.placements.map(p=>this.byId.get(p.id)).filter(a=>a.kind.endsWith('-label')&&a.text?.trim()&&!a.style?.startsWith('l-contour'));
          const namedFeatures=new Set(names.map(a=>a.featureId));
          const stats={paintedAt:performance.now(),selectedNames:batch?.namedIds.size??this.initialLabelBatch.selectedNames,eligibleNamedFeatures:batch?.eligibleNamedFeatures??this.initialLabelBatch.eligibleNamedFeatures,paintedNames:namedFeatures.size,primaryNames:new Set(names.filter(a=>(a.textImportance??a.priority??0)>=800).map(a=>a.featureId)).size,symbols:result.placements.filter(p=>this.byId.get(p.id).kind==='symbol').length,useful:namedFeatures.size>=Math.min(8,batch?.eligibleNamedFeatures??this.initialLabelBatch.eligibleNamedFeatures)};
          if(batch)this.initialLabelBatch=stats;if(stats.useful&&!this.firstUsefulLabels)this.firstUsefulLabels={...stats};
        }
        if(settled)this.rememberPlacements(result,m,key);
        this.phases={camera:cameraDone-started,prepare:preparedDone-cameraDone,solve:solvedDone-preparedDone,commit:performance.now()-solvedDone};
        const elapsed=performance.now()-started;this.timings.push(elapsed);this.samples.push({kind:this.transactionKind,...(round?{round:round.name}:{}),total:elapsed,...this.phases,placements:this.result.placements.length,candidates:prepared.reduce((n,a)=>n+a.candidates.length,0)});
        if(this.timings.length>500)this.timings.shift();if(this.samples.length>500)this.samples.shift();
        this.lastViewport=viewport;
        this.svg.dataset.layoutState=this.result.missingRequired.length?'missing-required':'ready';
        return true;
      };
      if(asyncSettled){
        const matrix=m=>Object.fromEntries(['a','b','c','d','e','f'].map(k=>[k,m[k]]));
        const {queryObstacles:unused,...payload}=args;payload.annotations=prepared.map(({fallbackCandidates,...a})=>a);
        payload.trail={segments:this.trailSegments,matrix:matrix(m),inverse:matrix(m.inverse()),strokeScale:1/z,scale:s,maxWidth:this.maxTrailWidth,metersPerPixel:this.manifest.map.metersPerMapUnit/s};
        this.rendering=false;
        const result=await this.initialPlacer.solve(payload);
        if(!validSnapshot())return false;
        await this.renderer?.ensureView(this.view);
        if(!validSnapshot())return false;
        return finish(result);
      }
      if(settled&&this.starting){
        const faces=[...document.fonts].map(face=>[face,face.status]);
        const snapshot=this.startupSnapshot(),matrix=m=>Object.fromEntries(['a','b','c','d','e','f'].map(k=>[k,m[k]]));
        const {queryObstacles:unused,...payload}=args;
        payload.annotations=prepared.map(({fallbackCandidates,...a})=>a);
        payload.trail={segments:this.trailSegments,matrix:matrix(m),inverse:matrix(m.inverse()),strokeScale:1/z,scale:s,maxWidth:this.maxTrailWidth,metersPerPixel:this.manifest.map.metersPerMapUnit/s};
        this.status='loading';this.rendering=false;
        return await this.initialPlacer.solve(payload).then(async result=>{
          // Read the current preparation promise: a layer/theme change can replace it.
          if(this.renderer){const renderer=this.renderer;try{await renderer.ensureView(this.view);}catch(error){this.rendererError=error.message;if(this.packedContours?.error)throw error;if(this.renderer===renderer)renderer.fallback(error);}}
          if(!this.renderer){let ready;do{ready=this.preview.ready;await ready;}while(ready!==this.preview.ready);}
          const current=[...document.fonts];
          if(current.length!==faces.length||current.some((face,i)=>face!==faces[i]?.[0]||face.status!==faces[i]?.[1])){
            this.cache.invalidate();this.lineCache.clear();this.previous=null;
            await ensureFonts(this.policy.fontFamilies);return false;
          }
          if(snapshot!==this.startupSnapshot())return false;
          this.status='ready';return finish(result);
        });
      }
      return finish(solveLayout(args));
    }catch(error){if(error.name==='AbortError')return false;for(const e of this.elements.values())e.style.visibility='hidden';this.visibleIds.clear();this.renderer?.clearLabels();this.status='error';this.error=error.message;this.details.textContent='Map labels unavailable: '+error.message;}
    finally{job?.cleanup?.();if(this.settleJob===job)this.settleJob=null;this.rendering=false;}
  }
}
