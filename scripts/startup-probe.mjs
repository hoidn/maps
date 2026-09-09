// Shared benchmark-only instrumentation. Never accepts renderer activation as paint.
export function isCorrectCameraFrame(layout,before,beforeRevision,viewBox,backend='svg'){
 if(!layout?.view||layout.revision<=beforeRevision)return false;
 const equal=(a,b)=>a&&b&&['x','y','w','h'].every(k=>Math.abs(a[k]-b[k])<1e-6);
 if(equal(layout.view,before))return false;
 const r=layout.renderer;
 if(r?.active){
  const evidence=r.paintedView?{view:r.paintedView,revision:r.paintedRevision}:r.startupPaint;
  return Boolean(evidence&&evidence.revision===layout.revision&&equal(evidence.view,layout.view));
 }
 if(r||backend!=='svg')return false;
 const values=(viewBox||'').trim().split(/[ ,]+/).map(Number);
 return values.length===4&&equal({x:values[0],y:values[1],w:values[2],h:values[3]},layout.view);
}
export function observeRendererDraw(renderer,layout){
 if(!renderer||renderer.startupObserved)return;
 renderer.startupObserved=true;
 const original=renderer.draw;
 renderer.draw=function(...args){
  const view={...layout.view},revision=layout.revision;
  const result=original.apply(this,args);
  if(this.active)this.startupPaint={view,revision};
  return result;
 };
}
export function interleavedRuns(files,repetitions,offsets=[25,100,250]){
 if(!Number.isInteger(repetitions)||repetitions<3)throw Error('At least three repetitions are required');
 return Array.from({length:repetitions},(_,repeat)=>offsets.flatMap(offset=>(repeat%2?[...files].reverse():files).map(file=>({repeat,offset,file})))).flat();
}
export function installStartupProbe({offset=25}){
 const p=window.startupProbe={longs:[],marks:[],instrumentation:'completed-draw-view-and-revision plus next-rAF',input:'synthetic WheelEvent scheduled after DOMContentLoaded'};
 if(window.PerformanceObserver?.supportedEntryTypes.includes('longtask'))new PerformanceObserver(list=>p.longs.push(...list.getEntries().map(e=>({start:e.startTime,duration:e.duration})))).observe({type:'longtask',buffered:true});
 const mark=(name,detail={})=>p.marks.push({name,at:performance.now(),...detail});
 let controller;
 Object.defineProperty(window,'mapLayout',{configurable:true,get:()=>controller,set(value){
  controller=value;mark('controller-available');
  let renderer=value.renderer;if(renderer)observeRendererDraw(renderer,value);
  Object.defineProperty(value,'renderer',{configurable:true,get:()=>renderer,set(r){renderer=r;observeRendererDraw(r,value);if(!r)return;mark('renderer-constructed');r.ready.then(()=>mark('renderer-prepared'),error=>mark('renderer-error',{error:error.message}));}});
  value.ready.then(()=>{p.interactive=performance.now();mark('initial-layout-ready');},error=>{p.error=error.message;});
  const render=value.render;value.render=function(...args){const start=performance.now();const result=render.apply(this,args);mark('render-return',{full:Boolean(args[0]),duration:performance.now()-start});return result;};
 }});
 document.addEventListener('DOMContentLoaded',()=>{
  p.dom=performance.now();p.due=p.dom+offset;
  document.fonts.ready.then(()=>mark('fonts-ready'));
  setTimeout(()=>{
   p.dispatched=performance.now();
   const svg=document.getElementById('mapsvg'),l=window.mapLayout;
   if(!svg||!l){p.error='Map controller unavailable at input phase';return;}
   const before={...l.view},revision=l.revision,r=svg.getBoundingClientRect(),backend=new URLSearchParams(location.search).get('renderer')||svg.dataset.renderer||'svg';p.requestedBackend=backend;
   observeRendererDraw(l.renderer,l);p.before=before;p.beforeRevision=revision;
   svg.dispatchEvent(new WheelEvent('wheel',{clientX:r.x+r.width*.55,clientY:r.y+r.height*.45,deltaY:-150,bubbles:true,cancelable:true}));
   p.handlerReturned=performance.now();
   const check=()=>{
    if(isCorrectCameraFrame(l,before,revision,svg.getAttribute('viewBox'),backend)){
     p.correctDrawObserved=performance.now();p.correctView={...l.view};p.correctRevision=l.revision;
     requestAnimationFrame(()=>{p.painted=performance.now();});
    }else requestAnimationFrame(check);
   };requestAnimationFrame(check);
  },offset);
 });
}
export function startupProbeSource(options){
 return `${isCorrectCameraFrame.toString()}\n${observeRendererDraw.toString()}\n(${installStartupProbe.toString()})(${JSON.stringify(options)});`;
}
