import {InitialPlacementClient} from './initial-placement-client.js';
import {pointFallback} from './point-fallback.js';
import {MotionPreview} from './motion-preview.js';
import {validateManifest} from './schema.js';
import {ensureFonts,measureElement,MetricCache} from './measure.js';
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
    this.mode=manifest.map.mode;this.view={x:0,y:0,w:manifest.map.width,h:manifest.map.height};
    this.layers={places:true,peaks:true,names:true,contours:true,water:true,relief:true};
    this.elements=new Map();this.cache=new MetricCache();this.previous=null;this.waiters=[];this.timings=[];this.status='loading';
    this.byId=new Map(manifest.annotations.map(a=>[a.id,a]));this.visibleIds=new Set();this.lineCache=new Map();this.samples=[];
    for(const a of manifest.annotations){const e=document.getElementById(a.elementId);if(!e)throw new Error('Missing annotation '+a.id);this.elements.set(a.id,e);e.style.visibility='hidden';e.style.display='none';
      const t=e.querySelector('text');a.originalTextStyle=t?.getAttribute('style')||'';a.originalTextHTML=t?.innerHTML||'';a.originalOffset=t?.querySelector('textPath')?.getAttribute('startOffset')||'0';
    }
    const topScope=e=>{while(e.parentElement&&e.parentElement!==svg)e=e.parentElement;return e;};
    this.fontScopes=[...new Set([...this.elements.values()].map(topScope))];
    this.strokeScopes=[...new Set([...svg.querySelectorAll('.trails,.hits,.contours,.hydro,.roads,[data-layout-obstacle="trail"]')].map(topScope))];
    const details=document.createElement('div');details.dataset.layoutDetails='';details.setAttribute('role','status');details.style.cssText='padding:8px 12px;min-height:20px;font:13px var(--sans,sans-serif)';
    svg.parentElement.after(details);this.details=details;
    this.pointers=new Set();this.wheelQuietUntil=0;
    if(this.mode==='interactive')this.trackGestures();
    this.createDirectory();this.ready=this.initialize();
  }
  trackGestures(){
    // A pause between pointer events is still part of the same drag. Wheel
    // gestures have no release event, so give their next input a short window.
    this.svg.addEventListener('pointerdown',event=>{
      this.pointers.add(event.pointerId);if(this.settlePending)this.scheduleSettled();
    },true);
    const release=event=>{
      if(this.pointers.delete(event.pointerId)&&!this.pointers.size&&this.settlePending)this.scheduleSettled();
    };
    for(const type of ['pointerup','pointercancel','lostpointercapture'])window.addEventListener(type,release,true);
    window.addEventListener('blur',()=>{if(this.pointers.size){this.pointers.clear();if(this.settlePending)this.scheduleSettled();}});
    this.svg.addEventListener('wheel',()=>{this.wheelQuietUntil=performance.now()+120;this.scheduleSettled();},{capture:true,passive:true});
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
      await ensureFonts(this.policy.fontFamilies);
      if(this.mode==='interactive'){
        this.starting=true;this.initialPlacer=new InitialPlacementClient();
        this.preview=new MotionPreview(this.svg,this.manifest.map);
        this.preview.ready.catch(()=>{}); // The initial transaction reports preparation failures.
        try{let committed=false;while(!committed){this.status='ready';committed=await this.render(true);if(this.status==='error')throw new Error(this.error);}}
        finally{this.initialPlacer.close();this.starting=false;}
      }else{this.status='ready';this.render(true);}
      this.observer=new ResizeObserver(()=>{
        if(this.status!=='ready')return;
        const r=this.svg.getBoundingClientRect(),resized=!this.lastViewport||r.width!==this.lastViewport.width||r.height!==this.lastViewport.height;
        if(resized){this.cache.invalidate();this.lineCache.clear();this.previous=null;}
        this.render(false);this.scheduleSettled();
      });
      this.observer.observe(this.svg);
      for(const e of this.svg.parentElement.querySelectorAll('.ctl,.layers .box,.readout,.hint,.zlabel'))this.observer.observe(e);
      for(const e of this.svg.parentElement.querySelectorAll('details'))e.addEventListener('toggle',()=>{this.render(false);this.scheduleSettled();});
      document.fonts.addEventListener('loading',()=>this.fontsChanged());
      for(const event of ['loadingdone','loadingerror'])document.fonts.addEventListener(event,()=>{if(this.status==='ready')this.fontsChanged();});
      // Face deletion or replacement need not start a loading cycle. Detect face
      // identity/status changes before paint; this does not force DOM layout.
      let known=[...document.fonts].map(face=>[face,face.status]);
      const watchFonts=()=>{
        const current=[...document.fonts];
        if(current.length!==known.length||current.some((face,i)=>face!==known[i]?.[0]||face.status!==known[i]?.[1])){
          known=current.map(face=>[face,face.status]);if(this.status==='ready')this.fontsChanged();
        }
        this.fontWatch=requestAnimationFrame(watchFonts);
      };
      this.fontWatch=requestAnimationFrame(watchFonts);
      return this.getReport();
    } catch(error){this.status='error';this.error=error.message;this.details.textContent='Map labels unavailable: '+error.message;throw error;}
  }
  fontsChanged(){
    this.preview?.restore();
    this.panLayout=null;
    const generation=this.fontGeneration=(this.fontGeneration??0)+1;this.status='loading';
    this.cache.invalidate();this.lineCache.clear();this.previous=null;
    clearTimeout(this.settleTimer);cancelAnimationFrame(this.frame);cancelAnimationFrame(this.quietFrame);
    this.settleTimer=null;this.frame=null;this.quietFrame=null;this.settlePending=false;this.settleGeneration=(this.settleGeneration??0)+1;
    for(const e of this.elements.values()){e.style.visibility='hidden';e.style.display='none';}this.visibleIds.clear();
    this.fontReady=document.fonts.ready.then(()=>ensureFonts(this.policy.fontFamilies)).then(()=>{
      if(generation!==this.fontGeneration)return;
      this.status='ready';this.render(true);this.resolveWaiters();
    }).catch(error=>{
      if(generation!==this.fontGeneration)return;
      this.status='error';this.error=error.message;this.details.textContent='Map labels unavailable: '+error.message;this.resolveWaiters();
    });
  }
  requestView(view){this.view={...view};this.onCameraChange?.(this.view);this.schedule();}
  setLayer(layer,visible){if(!(layer in this.layers))throw new Error('Unknown layer');if(this.layers[layer]!==visible)this.panLayout=null;this.layers[layer]=visible;this.preview?.restore();this.preview?.release();this.previewDirty=true;this.schedule();}
  select(id){const f=this.manifest.features.find(f=>f.id===id);if(!f)throw new Error('Unknown feature');this.details.textContent=f.name;this.selected=id;
    if(this.mode==='interactive'){const w=this.manifest.map.width/4.5,h=this.manifest.map.height/4.5;this.requestView({x:Math.max(0,Math.min(this.manifest.map.width-w,f.anchor[0]-w/2)),y:Math.max(0,Math.min(this.manifest.map.height-h,f.anchor[1]-h/2)),w,h});}
  }
  startupSnapshot(){const r=this.svg.getBoundingClientRect();return JSON.stringify([this.view,this.layers,r.x,r.y,r.width,r.height,this.controls()]);}
  schedule(){
    if(this.status==='loading'&&this.starting){
      if(!this.frame)this.frame=requestAnimationFrame(()=>{this.frame=null;if(this.status==='loading'){this.preview?.show();this.camera(false);this.preview?.render(this.view,this.svg.getBoundingClientRect());}else this.render(false);});
      return;
    }
    if(this.status!=='ready')return;
    if(!this.frame)this.frame=requestAnimationFrame(()=>{this.frame=null;this.render(false);});
    this.scheduleSettled();
  }
  scheduleSettled(){
    const generation=this.settleGeneration=(this.settleGeneration??0)+1;
    clearTimeout(this.settleTimer);cancelAnimationFrame(this.quietFrame);
    this.settleTimer=null;this.quietFrame=null;this.settlePending=true;
    if(this.pointers.size)return;
    this.settleTimer=setTimeout(()=>{
      // Heavy SVG paint can outlast the idle delay. Require two paint boundaries
      // with no newer input, rather than starting full work between gesture frames.
      this.quietFrame=requestAnimationFrame(()=>{
        if(generation!==this.settleGeneration)return;
        this.quietFrame=requestAnimationFrame(()=>{
          if(generation!==this.settleGeneration)return;
          this.settleTimer=null;this.quietFrame=null;this.settlePending=false;this.render(true);this.resolveWaiters();
        });
      });
    },Math.max(0,this.wheelQuietUntil-performance.now()));
  }
  whenSettled(){return this.ready.then(()=>this.fontReady).then(()=>this.frame||this.settlePending?new Promise(resolve=>this.waiters.push(resolve)):this.getReport());}
  resolveWaiters(){for(const resolve of this.waiters.splice(0))resolve(this.getReport());}
  getReport(){return {status:this.status,error:this.error,view:{...this.view},diagnostics:this.result?.diagnostics,outcomes:this.result?.outcomes||[],missingRequired:this.result?.missingRequired||[],placements:this.result?.placements||[],timings:this.timings.slice(-200),samples:this.samples.slice(-200),transactionKind:this.transactionKind};}
  camera(readAfter=true){
    const v=this.view,W=this.manifest.map.width;
    // Read the old, internally consistent camera before writing either scale.
    // A layout read between viewBox and --k makes Firefox shape text at a
    // transient zoom, so nominally constant screen fonts acquire different metrics.
    const before=this.svg.getScreenCTM(),old=this.svg.viewBox.baseVal;
    const width=this.svg.clientWidth,height=this.svg.clientHeight;
    const oldFit=Math.min(width/old.width,height/old.height),newFit=Math.min(width/v.w,height/v.h);
    const s=Math.hypot(before.a,before.b)*newFit/oldFit,z=W/v.w;
    this.svg.setAttribute('viewBox',`${v.x} ${v.y} ${v.w} ${v.h}`);
    this.fontScaleValue=this.mode==='interactive'?String(1/s):'1';
    for(const scope of this.fontScopes)scope.style.setProperty('--k',this.fontScaleValue);
    for(const scope of this.strokeScopes)scope.style.setProperty('--s',String(1/z));
    this.svg.classList.toggle('zoomed',z>1.02);this.svg.classList.toggle('z2',z>=2);this.svg.classList.toggle('z5',z>=4.5);
    for(const [layer,on] of Object.entries(this.layers))this.svg.classList.toggle('no-'+layer,!on);
    const badge=document.getElementById('zlabel');if(badge)badge.textContent=z.toFixed(1)+'× · contours '+(z>=4.5?'50':z>=2?'100':'250')+' ft';
    const m=readAfter?this.svg.getScreenCTM():null;return {m,s:m?Math.hypot(m.a,m.b):s,z};
  }
  normalize(a,e,s){
    if(this.mode!=='interactive')return;
    const t=e.querySelector('text');if(!t)return;
    const size=a.style?.startsWith('l-contour')?this.policy.sizes.contour:a.kind==='region-label'?this.policy.sizes.region:a.style?.startsWith('l-trail')?this.policy.sizes.trail:a.style==='l-major'?14:a.style==='l-minor'||a.style==='l-peak'?this.policy.sizes.secondary:this.policy.sizes.place;
    t.style.fontSize=(a.geometryId?size/s:size)+'px';t.style.strokeWidth=(a.geometryId?2.8/s:2.8)+'px';
    for(const sub of t.querySelectorAll('tspan:not([data-layout-primary])')){sub.style.fontSize='10px';sub.setAttribute('dy','13');}
  }
  controls(){
    const out=[];let i=0;
    for(const e of this.svg.parentElement.querySelectorAll('.ctl,.layers .box,.hint,.readout,.zlabel')){
      const r=rectangle(e.getBoundingClientRect());if(r.width&&r.height&&getComputedStyle(e).display!=='none')out.push({id:'control-'+i++,kind:'control',shape:shape(r)});
    }
    for(const e of this.svg.querySelectorAll('.cartouche,.scale')){
      if(getComputedStyle(e.parentElement).display==='none')continue;
      const r=rectangle(e.getBoundingClientRect());if(r.width&&r.height)out.push({id:'fixed-'+i++,kind:'control',shape:shape(r)});
    }
    return out;
  }
  trailQuery(m,s,z){
    if(!this.trailIndex){
      this.trailIndex=new SpatialIndex(32);this.trailSegments=[];this.maxTrailWidth=0;
      for(const e of this.svg.querySelectorAll('[data-layout-obstacle="trail"]')){
        const d=e.getAttribute('d');if(/[CQAHVSTZcqahvstz]/.test(d))throw new Error('Protected trail must be an absolute polyline');
        const numbers=(d.match(/[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g)||[]).map(Number);
        const width=parseFloat(getComputedStyle(e).strokeWidth)*(this.mode==='interactive'?z:1);
        if(!Number.isFinite(width))throw new Error('Invalid protected trail stroke');
        this.maxTrailWidth=Math.max(this.maxTrailWidth,width);
        for(let i=2;i<numbers.length;i+=2){
          const a=[numbers[i-2],numbers[i-1]],b=[numbers[i],numbers[i+1]],id=e.id+':'+i/2;
          const bounds={x:Math.min(a[0],b[0]),y:Math.min(a[1],b[1]),width:Math.abs(a[0]-b[0]),height:Math.abs(a[1]-b[1])};
          const segment={id,a,b,width,bounds};this.trailSegments.push(segment);
          this.trailIndex.insert(this.trailSegments.length-1,bounds);
        }
      }
    }
    return createTrailQuery({segments:this.trailSegments,index:this.trailIndex,matrix:m,inverse:m.inverse(),
      strokeScale:this.mode==='interactive'?1/z:1,scale:s,maxWidth:this.maxTrailWidth});
  }

  eligible(a,anchor,viewport,z){
    if(!this.layers[a.layer])return 'layer-off';
    if(a.style?.split(' ').includes('l-contour-f')&&z<2||a.style?.split(' ').includes('l-contour-ff')&&z<4.5)return 'below-detail';
    if(['point-label','symbol','region-label','edge-pointer'].includes(a.kind)&&!intersects({x:anchor[0]-.5,y:anchor[1]-.5,width:1,height:1},viewport))return 'outside-view';
  }
  panKey(m,viewport){return JSON.stringify([this.view.w,this.view.h,viewport.width,viewport.height,m.a,m.b,m.c,m.d].map(v=>Math.round(v*1e8)/1e8));}
  fixedPlacements(m,key){
    if(this.mode!=='interactive'||this.panLayout?.key!==key)return null;
    const {matrix,placements}=this.panLayout,dx=m.e-matrix.e,dy=m.f-matrix.f;
    return new Map([...placements].map(([id,p])=>[id,{...p,footprint:moveShape(p.footprint,dx,dy)}]));
  }
  rememberPlacements(result,m,key){
    if(this.mode!=='interactive')return;
    if(this.panLayout?.key!==key)this.panLayout={key,matrix:{e:m.e,f:m.f},placements:new Map()};
    const {matrix,placements}=this.panLayout;
    for(const p of result.placements)if(!placements.has(p.id))placements.set(p.id,{...p,footprint:moveShape(p.footprint,matrix.e-m.e,matrix.f-m.f)});
  }
  fastPrepared(m,viewport,z,fixed=null){
    const previous=new Map((this.previous?.placements||[]).map(p=>[p.id,p]));
    return this.manifest.annotations.map(a=>{
      const anchor=project(m,a.anchor),item={...a,anchor,candidates:[],required:false};
      if(a.kind==='symbol'){item.anchorTrailRadius=6;item.anchorTrailFootprint=true;}
      item.eligibleReason=this.eligible(a,anchor,viewport,z);if(item.eligibleReason)return item;
      if(fixed){const p=fixed.get(a.id);if(p)item.candidates=[{...p,id:p.candidateId,shape:p.footprint}];else item.eligibleReason='budget-deferred';if(a.kind==='line-label')item.repeatDistance=this.policy.repeatDistance;return item;}
      const old=previous.get(a.id),retained=this.retained?.get(a.id);
      if(!old||!retained){item.eligibleReason='budget-deferred';return item;}
      if(old.application){
        try{item.candidates=[reprojectLineCandidate({...old,id:old.candidateId,shape:old.footprint},retained.parentMatrix,this.elements.get(a.id).parentElement.getScreenCTM())];}
        catch{item.eligibleReason='budget-deferred';}
      }else{
        // Screen font hinting/rounding can vary between engines at fractional
        // transforms. Retain the candidate, never an unvalidated stale footprint.
        try{const current=measureElement(this.elements.get(a.id));item.candidates=[{...old,id:old.candidateId,shape:moveShape(current,old.dx??0,old.dy??0)}];}
        catch{item.eligibleReason='invalid-metrics';}
      }
      if(a.kind==='line-label')item.repeatDistance=this.policy.repeatDistance;
      return item;
    });
  }
  commit(result,m,s){
    const next=new Set(result.placements.map(p=>p.id));
    for(const [id,e] of this.elements)if(!next.has(id)&&e.style.display!=='none'){e.style.visibility='hidden';e.style.display='none';}
    const retained=new Map();
    for(const placement of result.placements){
      const e=this.elements.get(placement.id),a=this.byId.get(placement.id),text=e.querySelector('text');
      e.style.display='inline';
      const application=placement.application,transform=application?.transform??`translate(${placement.dx/s} ${placement.dy/s})`;
      if(application){
        if(e.getAttribute('transform')!==transform||application.startOffset!==undefined&&text.querySelector('textPath')?.getAttribute('startOffset')!==String(application.startOffset))applyLineCandidate(e,placement);
      }else if(e.getAttribute('transform')!==transform)e.setAttribute('transform',transform);
      if(placement.textHTML&&text.innerHTML!==placement.textHTML)text.innerHTML=placement.textHTML;
      e.style.visibility='visible';
    }
    const parents=new Map();
    for(const placement of result.placements){
      const e=this.elements.get(placement.id),a=this.byId.get(placement.id),parent=e.parentElement;
      if(placement.application&&!parents.has(parent))parents.set(parent,parent.getScreenCTM());
      retained.set(a.id,{anchor:project(m,a.anchor),parentMatrix:placement.application?parents.get(parent):null});
    }
    this.visibleIds=next;this.retained=retained;this.previous=result;
  }
  render(includeCurves){
    if(this.status!=='ready'||this.rendering)return;
    this.rendering=true;const started=performance.now(),settled=includeCurves||this.mode==='static';
    this.transactionKind=settled?'settled':'fast';
    try {
      if(settled)this.preview?.restore();else this.preview?.show(this.panLayout?.placements);
      // With no retained labels, no painted annotation needs geometry validation.
      // Keep the camera write atomic and defer its layout to normal browser paint.
      const dormant=!settled&&this.previous?.placements.length===0&&!!this.lastViewport&&!this.panLayout?.placements.size;
      const {m,s,z}=this.camera(!dormant),viewport=dormant?this.lastViewport:rectangle(this.svg.getBoundingClientRect()),obstacles=dormant?[]:this.controls();
      const key=m?this.panKey(m,viewport):null,fixed=m?this.fixedPlacements(m,key):null;
      // Pure translation preserves prior trail clearance. Only the viewport,
      // fixed controls and the retained-label visibility need checking again.
      const queryObstacles=dormant||!settled&&fixed?undefined:this.trailQuery(m,s,z);
      if(!settled&&!fixed)for(const p of this.previous?.placements||[])if(!p.application)this.elements.get(p.id).setAttribute('transform','');
      // Preserve occupied map positions even while their text is clipped or under
      // a control. Newly revealed labels must not displace existing placements.
      if(settled&&fixed)for(const [id,p] of fixed)obstacles.push({id:'pan-reserved:'+id,kind:'label',shape:p.footprint});
      if(!settled)this.preview?.render(this.view,viewport);
      if(this.previewDirty){this.previewDirty=false;this.preview?.invalidate();}
      const cameraDone=performance.now();let prepared;
      if(dormant)prepared=this.manifest.annotations.map(a=>({...a,required:false,candidates:[],eligibleReason:this.layers[a.layer]?'budget-deferred':'layer-off'}));
      else if(!settled)prepared=this.fastPrepared(m,viewport,z,fixed);
      else {
        // Fractional zoom can change browser glyph advances despite inverse CSS
        // scaling. Keep only metrics measured at this exact screen scale.
        const metricScaleKey=s+':'+this.fontScaleValue;
        if(this.metricScaleKey!==metricScaleKey){this.cache.invalidate();this.metricScaleKey=metricScaleKey;}
        // Reset/normalize in one write batch before measuring any annotation.
        // This avoids forcing style/layout once for every ordinary point label.
        for(const a of this.manifest.annotations){
          const e=this.elements.get(a.id),text=e.querySelector('text');e.style.visibility='hidden';
          if(fixed?.has(a.id))continue;
          const deferredLine=a.kind==='line-label'&&(a.geometryId||a.geometryIds?.length);
          if(deferredLine||this.eligible(a,project(m,a.anchor),viewport,z)){e.style.display='none';continue;}
          e.style.display='inline';e.setAttribute('transform','');
          if(text&&text.innerHTML!==a.originalTextHTML)text.innerHTML=a.originalTextHTML;
          this.normalize(a,e,s);
        }
        prepared=[];
        const facilityCounts=new Map();for(const a of this.manifest.annotations)if(a.kind==='symbol')facilityCounts.set(a.featureId,(facilityCounts.get(a.featureId)||0)+1);
        const candidateDeadline=this.mode==='interactive'?performance.now()+(this.policy.interactiveCandidateBudgetMs??24):Infinity;
        const ordered=[...this.manifest.annotations].sort((a,b)=>(b.priority??0)-(a.priority??0)||a.id.localeCompare(b.id));
        for(const a of ordered){
          const e=this.elements.get(a.id),anchor=project(m,a.anchor),item={...a,anchor,candidates:[],required:this.mode==='static'&&a.requiredProfiles.includes('static-default')};
          if(a.kind==='symbol'){item.anchorTrailRadius=6;item.anchorTrailFootprint=true;}
          item.eligibleReason=this.eligible(a,anchor,viewport,z);
          if(item.eligibleReason){prepared.push(item);continue;}
          if(fixed?.has(a.id)){
            const p=fixed.get(a.id);item.candidates=[{...p,id:p.candidateId,shape:p.footprint}];
            item.allowedObstacleIds=[...(item.allowedObstacleIds||[]),'pan-reserved:'+a.id];
            item.repeatDistance=a.kind==='line-label'?this.policy.repeatDistance:0;
            prepared.push(item);continue;
          }
          if(a.kind==='line-label'&&performance.now()>=candidateDeadline&&!this.cache.entries.has(a.id)&&!this.lineCache.has(a.id)){item.eligibleReason='budget-deferred';prepared.push(item);continue;}
          try {
            const line=a.kind==='line-label'&&(a.geometryId||a.geometryIds?.length);
            if(line){
              const parentMatrix=e.parentElement.getScreenCTM(),cached=this.lineCache.get(a.id);
              if(cached)try{item.candidates=cached.candidates.map(c=>reprojectLineCandidate(c,cached.parentMatrix,parentMatrix));}catch{this.lineCache.delete(a.id);}
              if(!this.lineCache.has(a.id)&&performance.now()>=candidateDeadline){item.eligibleReason='budget-deferred';prepared.push(item);continue;}
              if(!this.lineCache.has(a.id)){
                const text=e.querySelector('text');e.style.display='inline';e.setAttribute('transform','');
                if(text&&text.innerHTML!==a.originalTextHTML)text.innerHTML=a.originalTextHTML;
                this.normalize(a,e,s);
                try{item.candidates=buildLineCandidates({annotation:a,element:e,policy:{...this.policy,maxLineCandidates:this.mode==='interactive'?Math.min(this.policy.maxLineCandidates??24,4):this.policy.maxLineCandidates}});}
                finally{e.style.display='none';}
              }
              this.lineCache.set(a.id,{candidates:item.candidates,parentMatrix});
              item.repeatDistance=this.policy.repeatDistance;
            }else{
              let cached=this.cache.entries.get(a.id);
              if(!cached){cached={anchor,scale:s,metric:measureElement(e),pointVariants:a.variants?.length?measurePointVariants(e,a):[]};this.cache.entries.set(a.id,cached);}
              const dx=anchor[0]-cached.anchor[0],dy=anchor[1]-cached.anchor[1],metric=moveShape(cached.metric,dx,dy);
              if(a.kind==='region-label')item.candidates=regionCandidates(item,metric,this.policy);
              else {
                if(a.kind==='symbol'&&facilityCounts.get(a.featureId)>1)item.facilityOffsets=[[16,0],[-16,0],[0,16],[0,-16],[12,12],[-12,12],[12,-12],[-12,-12]];
                const policy={...this.policy,densePointCandidates:item.required};item.candidates=pointCandidates(item,metric,policy);
                for(const v of cached.pointVariants||[])item.candidates.push(...pointCandidates(item,moveShape(v.shape,dx,dy),policy).map(c=>({...c,id:v.id+'-'+c.id,textHTML:v.textHTML})));
                if(a.kind==='point-label'&&!policy.densePointCandidates){
                  item.fallbackData={annotation:{kind:item.kind,anchor:item.anchor},metric,variants:(cached.pointVariants||[]).map(v=>({...v,shape:moveShape(v.shape,dx,dy)})),policy};
                  item.fallbackCandidates=()=>pointFallback(item.fallbackData);
                }
              }
            }
          }catch(error){item.eligibleReason=error.message.includes('overflow')?'no-valid-candidate':'invalid-metrics';item.metricError=error.message;}
          prepared.push(item);
        }
      }
      this.prepared=prepared;this.lastObstacles=obstacles;
      const preparedDone=performance.now();
      const repeatReservations=settled&&fixed?[...fixed].map(([id,p])=>({id,featureId:this.byId.get(id).featureId,distance:this.byId.get(id).kind==='line-label'?this.policy.repeatDistance:0,shape:p.footprint})):[];
      const args={annotations:prepared,obstacles,queryObstacles,repeatReservations,viewport,previous:this.previous,policy:{...this.policy,exhaustiveDiagnostics:this.mode!=='interactive',repairMaxNeighbors:this.mode==='interactive'?0:2,requiredGroups:this.mode==='static'?this.policy.requiredRoutes:[]}};
      const finish=result=>{
        this.result=result;
        const solvedDone=performance.now();this.commit(this.result,m,s);
        if(settled)this.rememberPlacements(result,m,key);
        this.phases={camera:cameraDone-started,prepare:preparedDone-cameraDone,solve:solvedDone-preparedDone,commit:performance.now()-solvedDone};
        const elapsed=performance.now()-started;this.timings.push(elapsed);this.samples.push({kind:this.transactionKind,total:elapsed,...this.phases,placements:this.result.placements.length,candidates:prepared.reduce((n,a)=>n+a.candidates.length,0)});
        if(this.timings.length>500)this.timings.shift();if(this.samples.length>500)this.samples.shift();
        this.lastViewport=viewport;
        this.svg.dataset.layoutState=this.result.missingRequired.length?'missing-required':'ready';
        return true;
      };
      if(settled&&this.starting){
        const faces=[...document.fonts].map(face=>[face,face.status]);
        const snapshot=this.startupSnapshot(),matrix=m=>Object.fromEntries(['a','b','c','d','e','f'].map(k=>[k,m[k]]));
        const {queryObstacles:unused,...payload}=args;
        payload.annotations=prepared.map(({fallbackCandidates,...a})=>a);
        payload.trail={segments:this.trailSegments,matrix:matrix(m),inverse:matrix(m.inverse()),strokeScale:1/z,scale:s,maxWidth:this.maxTrailWidth};
        this.status='loading';
        return this.initialPlacer.solve(payload).then(async result=>{
          // Read the current preparation promise: a layer/theme change can replace it.
          let ready;do{ready=this.preview.ready;await ready;}while(ready!==this.preview.ready);
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
    }catch(error){for(const e of this.elements.values())e.style.visibility='hidden';this.visibleIds.clear();this.status='error';this.error=error.message;this.details.textContent='Map labels unavailable: '+error.message;}
    finally{this.rendering=false;}
  }
}
