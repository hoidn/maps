import {validateManifest} from './schema.js';
import {ensureFonts,measureElement,MetricCache} from './measure.js';
import {moveShape,intersects,lineHitsRect} from './geometry.js';
import {pointCandidates,regionCandidates,lineWindows} from './candidates.js';
import {measurePointVariants} from './point-variants.js';
import {solveLayout} from './place.js';
import {SpatialIndex} from './spatial-index.js';
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
    for(const a of manifest.annotations){const e=document.getElementById(a.elementId);if(!e)throw new Error('Missing annotation '+a.id);this.elements.set(a.id,e);e.style.visibility='hidden';
      const t=e.querySelector('text');a.originalTextStyle=t?.getAttribute('style')||'';a.originalTextHTML=t?.innerHTML||'';a.originalOffset=t?.querySelector('textPath')?.getAttribute('startOffset')||'0';
    }
    const details=document.createElement('div');details.dataset.layoutDetails='';details.setAttribute('role','status');details.style.cssText='padding:8px 12px;min-height:20px;font:13px var(--sans,sans-serif)';
    svg.parentElement.after(details);this.details=details;
    this.createDirectory();this.ready=this.initialize();
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
      await ensureFonts(this.policy.fontFamilies);this.status='ready';this.render(true);
      this.observer=new ResizeObserver(()=>{
        if(this.status!=='ready')return;
        const r=this.svg.getBoundingClientRect(),resized=!this.lastViewport||r.width!==this.lastViewport.width||r.height!==this.lastViewport.height;
        if(resized){this.cache.invalidate();this.lineCache.clear();this.previous=null;}
        this.render(false);this.scheduleSettled();
      });
      this.observer.observe(this.svg);
      for(const e of this.svg.parentElement.querySelectorAll('.ctl,.layers .box,.readout,.hint,.zlabel'))this.observer.observe(e);
      for(const e of this.svg.parentElement.querySelectorAll('details'))e.addEventListener('toggle',()=>{this.render(false);this.scheduleSettled();});
      document.fonts.addEventListener('loading',()=>{this.cache.invalidate();this.lineCache.clear();this.previous=null;for(const e of this.elements.values())e.style.visibility='hidden';});
      document.fonts.addEventListener('loadingdone',()=>this.schedule());
      return this.getReport();
    } catch(error){this.status='error';this.error=error.message;this.details.textContent='Map labels unavailable: '+error.message;throw error;}
  }
  requestView(view){this.view={...view};this.onCameraChange?.(this.view);this.schedule();}
  setLayer(layer,visible){if(!(layer in this.layers))throw new Error('Unknown layer');this.layers[layer]=visible;this.schedule();}
  select(id){const f=this.manifest.features.find(f=>f.id===id);if(!f)throw new Error('Unknown feature');this.details.textContent=f.name;this.selected=id;
    if(this.mode==='interactive'){const w=this.manifest.map.width/4.5,h=this.manifest.map.height/4.5;this.requestView({x:Math.max(0,Math.min(this.manifest.map.width-w,f.anchor[0]-w/2)),y:Math.max(0,Math.min(this.manifest.map.height-h,f.anchor[1]-h/2)),w,h});}
  }
  schedule(){
    if(this.status!=='ready')return;
    if(!this.frame)this.frame=requestAnimationFrame(()=>{this.frame=null;this.render(false);});
    this.scheduleSettled();
  }
  scheduleSettled(){clearTimeout(this.settleTimer);this.settleTimer=setTimeout(()=>{this.settleTimer=null;this.render(true);this.resolveWaiters();},60);}
  whenSettled(){return this.ready.then(()=>this.frame||this.settleTimer?new Promise(resolve=>this.waiters.push(resolve)):this.getReport());}
  resolveWaiters(){for(const resolve of this.waiters.splice(0))resolve(this.getReport());}
  getReport(){return {status:this.status,error:this.error,view:{...this.view},outcomes:this.result?.outcomes||[],missingRequired:this.result?.missingRequired||[],placements:this.result?.placements||[],timings:this.timings.slice(-200),samples:this.samples.slice(-200),transactionKind:this.transactionKind};}
  camera(){
    const v=this.view,W=this.manifest.map.width;
    // Read the old, internally consistent camera before writing either scale.
    // A layout read between viewBox and --k makes Firefox shape text at a
    // transient zoom, so nominally constant screen fonts acquire different metrics.
    const before=this.svg.getScreenCTM(),old=this.svg.viewBox.baseVal;
    const width=this.svg.clientWidth,height=this.svg.clientHeight;
    const oldFit=Math.min(width/old.width,height/old.height),newFit=Math.min(width/v.w,height/v.h);
    const s=Math.hypot(before.a,before.b)*newFit/oldFit,z=W/v.w;
    this.svg.setAttribute('viewBox',`${v.x} ${v.y} ${v.w} ${v.h}`);
    this.svg.style.setProperty('--k',this.mode==='interactive'?String(1/s):'1');
    this.svg.style.setProperty('--s',String(z**-.5));
    this.svg.classList.toggle('zoomed',z>1.02);this.svg.classList.toggle('z2',z>=2);this.svg.classList.toggle('z5',z>=4.5);
    for(const [layer,on] of Object.entries(this.layers))this.svg.classList.toggle('no-'+layer,!on);
    const badge=document.getElementById('zlabel');if(badge)badge.textContent=z.toFixed(1)+'× · contours '+(z>=4.5?'50':z>=2?'100':'250')+' ft';
    return {m:this.svg.getScreenCTM(),s,z};
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
  trails(m){
    if(!this.trailPaths)this.trailPaths=[...this.svg.querySelectorAll('[data-layout-obstacle="trail"]')].map(e=>{
      const numbers=(e.getAttribute('d').match(/-?\d+(?:\.\d+)?/g)||[]).map(Number),points=[];
      for(let i=0;i<numbers.length;i+=2)points.push([numbers[i],numbers[i+1]]);
      return {e,points};
    });
    const out=[],frame=rectangle(this.svg.getBoundingClientRect());
    for(const {e,points} of this.trailPaths){const width=parseFloat(getComputedStyle(e).strokeWidth)*Math.hypot(m.a,m.b);let p=project(m,points[0]);
      for(let i=1;i<points.length;i++){const q=project(m,points[i]),b={x:Math.min(p[0],q[0])-width/2,y:Math.min(p[1],q[1])-width/2,width:Math.abs(q[0]-p[0])+width,height:Math.abs(q[1]-p[1])+width};
        if(intersects(b,frame))out.push({id:e.id+':'+i,kind:'trail',line:{a:{x:p[0],y:p[1]},b:{x:q[0],y:q[1]},width},shape:shape(b)});p=q;
      }
    }return out;
  }
  trailQuery(m,s,z){
    if(!this.trailIndex){
      this.trailIndex=new SpatialIndex(32);this.trailSegments=[];this.maxTrailWidth=0;
      for(const e of this.svg.querySelectorAll('[data-layout-obstacle="trail"]')){
        const d=e.getAttribute('d');if(/[CQAHVSTZcqahvstz]/.test(d))throw new Error('Protected trail must be an absolute polyline');
        const numbers=(d.match(/[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g)||[]).map(Number);
        const width=parseFloat(getComputedStyle(e).strokeWidth)*(this.mode==='interactive'?Math.sqrt(z):1);
        if(!Number.isFinite(width))throw new Error('Invalid protected trail stroke');
        this.maxTrailWidth=Math.max(this.maxTrailWidth,width);
        for(let i=2;i<numbers.length;i+=2){
          const a=[numbers[i-2],numbers[i-1]],b=[numbers[i],numbers[i+1]],id=e.id+':'+i/2;
          const segment={id,a,b,width};this.trailSegments.push(segment);
          this.trailIndex.insert(this.trailSegments.length-1,{x:Math.min(a[0],b[0]),y:Math.min(a[1],b[1]),width:Math.abs(a[0]-b[0]),height:Math.abs(a[1]-b[1])});
        }
      }
    }
    const inverse=m.inverse(),strokeScale=this.mode==='interactive'?1/Math.sqrt(z):1;
    const cache=new Map();
    return rect=>{
      const key=[rect.x,rect.y,rect.width,rect.height].join(',');if(cache.has(key))return cache.get(key);
      const points=[[rect.x,rect.y],[rect.x+rect.width,rect.y],[rect.x,rect.y+rect.height],[rect.x+rect.width,rect.y+rect.height]].map(p=>project(inverse,p));
      const radius=this.maxTrailWidth*strokeScale/2,x=Math.min(...points.map(p=>p[0]))-radius,y=Math.min(...points.map(p=>p[1]))-radius;
      const r={x,y,width:Math.max(...points.map(p=>p[0]))+radius-x,height:Math.max(...points.map(p=>p[1]))+radius-y};
      const result=this.trailIndex.query(r).map(index=>{
        const segment=this.trailSegments[index],a=project(m,segment.a),b=project(m,segment.b),width=segment.width*strokeScale*s;
        return {id:segment.id,kind:'trail',line:{a:{x:a[0],y:a[1]},b:{x:b[0],y:b[1]},width}};
      });cache.set(key,result);return result;
    };
  }
  eligible(a,anchor,viewport,z){
    if(!this.layers[a.layer])return 'layer-off';
    if(a.style?.split(' ').includes('l-contour-f')&&z<2||a.style?.split(' ').includes('l-contour-ff')&&z<4.5)return 'below-detail';
    if(['point-label','symbol','region-label','edge-pointer'].includes(a.kind)&&!intersects({x:anchor[0]-.5,y:anchor[1]-.5,width:1,height:1},viewport))return 'outside-view';
  }
  fastPrepared(m,viewport,z){
    const previous=new Map((this.previous?.placements||[]).map(p=>[p.id,p]));
    return this.manifest.annotations.map(a=>{
      const anchor=project(m,a.anchor),item={...a,anchor,candidates:[],required:false};
      if(a.kind==='symbol')item.anchorTrailRadius=6;
      item.eligibleReason=this.eligible(a,anchor,viewport,z);if(item.eligibleReason)return item;
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
    for(const id of this.visibleIds)if(!next.has(id))this.elements.get(id).style.visibility='hidden';
    const retained=new Map();
    for(const placement of result.placements){
      const e=this.elements.get(placement.id),a=this.byId.get(placement.id),text=e.querySelector('text');
      if(placement.application)applyLineCandidate(e,placement);
      else e.setAttribute('transform',`translate(${placement.dx/s} ${placement.dy/s})`);
      if(placement.textHTML&&text.innerHTML!==placement.textHTML)text.innerHTML=placement.textHTML;
      e.style.visibility='visible';retained.set(a.id,{anchor:project(m,a.anchor),parentMatrix:placement.application?e.parentElement.getScreenCTM():null});
    }
    this.visibleIds=next;this.retained=retained;this.previous=result;
  }
  render(includeCurves){
    if(this.status!=='ready'||this.rendering)return;
    this.rendering=true;const started=performance.now(),settled=includeCurves||this.mode==='static';
    this.transactionKind=settled?'settled':'fast';
    try {
      if(!settled)for(const p of this.previous?.placements||[])if(!p.application)this.elements.get(p.id).setAttribute('transform','');
      const {m,s,z}=this.camera(),viewport=rectangle(this.svg.getBoundingClientRect()),obstacles=this.controls(),queryObstacles=this.trailQuery(m,s,z);
      const cameraDone=performance.now();let prepared;
      if(!settled)prepared=this.fastPrepared(m,viewport,z);
      else {
        // Reset/normalize in one write batch before measuring any annotation.
        // This avoids forcing style/layout once for every ordinary point label.
        for(const a of this.manifest.annotations){
          const e=this.elements.get(a.id),text=e.querySelector('text');e.style.visibility='hidden';e.setAttribute('transform','');
          if(text&&text.innerHTML!==a.originalTextHTML)text.innerHTML=a.originalTextHTML;
          this.normalize(a,e,s);
        }
        prepared=[];
        const facilityCounts=new Map();for(const a of this.manifest.annotations)if(a.kind==='symbol')facilityCounts.set(a.featureId,(facilityCounts.get(a.featureId)||0)+1);
        const candidateDeadline=this.mode==='interactive'?performance.now()+(this.policy.interactiveCandidateBudgetMs??24):Infinity;
        const ordered=[...this.manifest.annotations].sort((a,b)=>(b.priority??0)-(a.priority??0)||a.id.localeCompare(b.id));
        for(const a of ordered){
          const e=this.elements.get(a.id),anchor=project(m,a.anchor),item={...a,anchor,candidates:[],required:this.mode==='static'&&a.requiredProfiles.includes('static-default')};
          if(a.kind==='symbol')item.anchorTrailRadius=6;
          item.eligibleReason=this.eligible(a,anchor,viewport,z);
          if(item.eligibleReason){prepared.push(item);continue;}
          if(performance.now()>candidateDeadline&&!this.cache.entries.has(a.id)&&!this.lineCache.has(a.id)){item.eligibleReason='budget-deferred';prepared.push(item);continue;}
          try {
            const line=a.kind==='line-label'&&(a.geometryId||a.geometryIds?.length);
            if(line){
              const parentMatrix=e.parentElement.getScreenCTM(),cached=this.lineCache.get(a.id);
              if(cached)try{item.candidates=cached.candidates.map(c=>reprojectLineCandidate(c,cached.parentMatrix,parentMatrix));}catch{this.lineCache.delete(a.id);}
              if(!this.lineCache.has(a.id))item.candidates=buildLineCandidates({annotation:a,element:e,policy:{...this.policy,maxLineCandidates:this.mode==='interactive'?Math.min(this.policy.maxLineCandidates??24,4):this.policy.maxLineCandidates}});
              this.lineCache.set(a.id,{candidates:item.candidates,parentMatrix});
              item.repeatDistance=this.policy.repeatDistance;
            }else{
              let cached=this.cache.entries.get(a.id);
              if(!cached){cached={anchor,metric:measureElement(e),pointVariants:measurePointVariants(e,a)};this.cache.entries.set(a.id,cached);}
              const dx=anchor[0]-cached.anchor[0],dy=anchor[1]-cached.anchor[1],metric=moveShape(cached.metric,dx,dy);
              if(a.kind==='region-label')item.candidates=regionCandidates(item,metric,this.policy);
              else {
                if(a.kind==='symbol'&&facilityCounts.get(a.featureId)>1)item.facilityOffsets=[[16,0],[-16,0],[0,16],[0,-16],[12,12],[-12,12],[12,-12],[-12,-12]];
                const policy={...this.policy,densePointCandidates:item.required};item.candidates=pointCandidates(item,metric,policy);
                for(const v of cached.pointVariants||[])item.candidates.push(...pointCandidates(item,moveShape(v.shape,dx,dy),policy).map(c=>({...c,id:v.id+'-'+c.id,textHTML:v.textHTML})));
              }
            }
          }catch(error){item.eligibleReason=error.message.includes('overflow')?'no-valid-candidate':'invalid-metrics';item.metricError=error.message;}
          prepared.push(item);
        }
      }
      this.prepared=prepared;this.lastObstacles=obstacles;
      const preparedDone=performance.now();
      this.result=solveLayout({annotations:prepared,obstacles,queryObstacles,viewport,previous:this.previous,policy:{...this.policy,repairMaxNeighbors:this.mode==='interactive'?0:2,requiredGroups:this.mode==='static'?this.policy.requiredRoutes:[]}});
      const solvedDone=performance.now();this.commit(this.result,m,s);
      this.phases={camera:cameraDone-started,prepare:preparedDone-cameraDone,solve:solvedDone-preparedDone,commit:performance.now()-solvedDone};
      const elapsed=performance.now()-started;this.timings.push(elapsed);this.samples.push({kind:this.transactionKind,total:elapsed,...this.phases,placements:this.result.placements.length,candidates:prepared.reduce((n,a)=>n+a.candidates.length,0)});
      if(this.timings.length>500)this.timings.shift();if(this.samples.length>500)this.samples.shift();
      this.lastViewport=viewport;
      this.svg.dataset.layoutState=this.result.missingRequired.length?'missing-required':'ready';
    }catch(error){for(const e of this.elements.values())e.style.visibility='hidden';this.visibleIds.clear();this.status='error';this.error=error.message;this.details.textContent='Map labels unavailable: '+error.message;}
    finally{this.rendering=false;}
  }
}
