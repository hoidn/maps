import {contourRuns,contourChunks} from './contour-geometry.js';
const NS='http://www.w3.org/2000/svg';
/** Reuse parsed contour paths, but draw strokes at the current camera scale.
 * Only plain, untransformed contour groups are eligible; other SVG stays live. */
export class ContourPreview {
  constructor(svg,map,{defer=false}={}){
    this.svg=svg;this.map=map;this.items=[];this.layers=[];this.rgbaBytes=0;
    this.element=document.createElementNS(NS,'foreignObject');this.element.dataset.layoutContourPreview='';this.element.setAttribute('pointer-events','none');
    this.canvas=document.createElement('canvas');this.canvas.style.cssText='width:100%;height:100%;display:block';this.element.append(this.canvas);
    this.context=this.canvas.getContext('2d');this.initialized=false;
    this.remaining=new Map();this.tierWaiters=[];this.demandZoom=map.width/svg.viewBox.baseVal.width;
    this.ready=this.initialize(svg,defer);
  }
  isReady(view){
    const z=this.map.width/view.w;
    return this.catalogued&&![...this.remaining].some(([minimum,count])=>minimum<=z&&count>0);
  }
  readyFor(view){
    this.demandZoom=this.map.width/view.w;
    if(this.failure)return Promise.reject(this.failure);
    if(this.isReady(view))return Promise.resolve();
    return new Promise((resolve,reject)=>this.tierWaiters.push({view:{...view},resolve,reject}));
  }
  publish(){
    for(const waiter of [...this.tierWaiters])if(this.isReady(waiter.view)){this.tierWaiters.splice(this.tierWaiters.indexOf(waiter),1);waiter.resolve();}
  }
  async initialize(svg,defer){
    if(!this.context){this.catalogued=true;this.initialized=true;this.publish();return;}
    let deadline=performance.now()+8,order=0;const pending=[];
    try{
      for(const layer of [...svg.children].filter(e=>e.matches('.contours'))){
        if(layer.querySelector('[data-layout-id],text,[transform]')||layer.hasAttribute('transform')||[layer,...layer.querySelectorAll('g')].some(e=>getComputedStyle(e).transform!=='none'))continue;
        const paths=[...layer.querySelectorAll('path')];
        if(paths.some(p=>getComputedStyle(p).fill!=='none'||getComputedStyle(p).transform!=='none'))continue;
        const groups=[layer,...layer.querySelectorAll('g')];this.layers.push(layer);
        for(const e of paths){const minZoom=e.closest('.g-finest')?4.5:e.closest('.g-fine')?2:0;
          pending.push({e,groups,minZoom,order:order++});this.remaining.set(minZoom,(this.remaining.get(minZoom)||0)+1);
        }
      }
      this.catalogued=true;this.publish();
      while(pending.length){
        // Source paint order is independent from preparation order. Required
        // tiers go first; all remaining geometry continues cooperatively.
        pending.sort((a,b)=>Number(a.minZoom>this.demandZoom)-Number(b.minZoom>this.demandZoom)||a.minZoom-b.minZoom||a.order-b.order);
        const entry=pending.shift(),item=await this.preparePath(entry);item.style=this.styleFor(item.e);
        this.items.push(item);this.items.sort((a,b)=>a.order-b.order);this.cached=null;
        this.remaining.set(entry.minZoom,this.remaining.get(entry.minZoom)-1);this.publish();
        if(defer&&(performance.now()>=deadline||this.remaining.get(entry.minZoom)===0)){await new Promise(resolve=>setTimeout(resolve,0));deadline=performance.now()+8;}
      }
      this.initialized=true;
    }catch(error){this.failure=error;for(const waiter of this.tierWaiters.splice(0))waiter.reject(error);throw error;}
  }
  preparePath({e,groups,minZoom,order}){
    const d=e.getAttribute('d'),runs=contourRuns(d)?.map(points=>{
      let x=Infinity,y=Infinity,right=-Infinity,bottom=-Infinity;
      for(let i=0;i<points.length;i+=2){x=Math.min(x,points[i]);y=Math.min(y,points[i+1]);right=Math.max(right,points[i]);bottom=Math.max(bottom,points[i+1]);}
      const chunks=contourChunks(points).map(({start,end,bounds})=>({start,end,bounds}));
      const original=new Path2D();original.moveTo(points[0],points[1]);for(let i=2;i<points.length;i+=2)original.lineTo(points[i],points[i+1]);
      return {bounds:{x,y,width:right-x,height:bottom-y},points,chunks,original};
    });
    let bounds;
    if(runs){const x=Math.min(...runs.map(r=>r.bounds.x)),y=Math.min(...runs.map(r=>r.bounds.y));bounds={x,y,width:Math.max(...runs.map(r=>r.bounds.x+r.bounds.width))-x,height:Math.max(...runs.map(r=>r.bounds.y+r.bounds.height))-y};}
    else{
      const styles=groups.map(e=>e.getAttribute('style'));groups.forEach(e=>e.style.setProperty('display','inline','important'));
      try{bounds=e.getBBox();}finally{groups.forEach((e,i)=>styles[i]===null?e.removeAttribute('style'):e.setAttribute('style',styles[i]));}
    }
    return {e,runs,path:runs?null:new Path2D(d),bounds,minZoom,order};
  }
  styleFor(element){
    const z=this.map.width/this.svg.viewBox.baseVal.width,s=getComputedStyle(element);let opacity=Number(s.opacity);
    for(let e=element.parentElement;e&&e!==this.svg;e=e.parentElement)opacity*=Number(getComputedStyle(e).opacity);
    return {color:s.stroke,width:parseFloat(s.strokeWidth)*z,opacity:opacity*Number(s.strokeOpacity),cap:s.strokeLinecap,join:s.strokeLinejoin,miter:Number(s.strokeMiterlimit),dash:s.strokeDasharray==='none'?[]:s.strokeDasharray.split(/[ ,]+/).map(v=>parseFloat(v)*z),dashOffset:parseFloat(s.strokeDashoffset)*z};
  }
  refreshStyles(){
    this.cached=null;
    for(const item of this.items)item.style=this.styleFor(item.e);
  }
  render(view,viewport,maxBytes,{hidden=this.svg.classList.contains('no-contours')}={}){
    if(!this.context||!this.layers.length)return;
    // Resize observers may see a temporarily collapsed surface. Preserve the
    // last finite raster until a measurable viewport returns; never divide by0.
    if(viewport.width===0||viewport.height===0)return;
    const fit=Math.min(viewport.width/view.w,viewport.height/view.h),visibleW=viewport.width/fit,visibleH=viewport.height/fit,
      visibleX=view.x-(visibleW-view.w)/2,visibleY=view.y-(visibleH-view.h)/2,z=this.map.width/view.w,
      dpr=devicePixelRatio||1,cached=this.cached;
    if(cached&&cached.fit===fit&&cached.z===z&&cached.dpr===dpr&&cached.maxBytes===maxBytes&&cached.hidden===hidden&&
      visibleX>=cached.x&&visibleY>=cached.y&&visibleX+visibleW<=cached.x+cached.w&&visibleY+visibleH<=cached.y+cached.h)return;
    // Keep a 64 CSS-pixel margin on each side. Pans within it only change the
    // SVG camera; the contour buffer keeps its exact scale and world position.
    // Zoom frames cannot reuse this margin, so draw only their visible viewport.
    const margin=cached&&cached.z!==z?0:64;
    // Reserve the pan margin when choosing density, including the two-pixel
    // rounding allowance. Switching between zoom and pan must not change it.
    const maxW=viewport.width+128,maxH=viewport.height+128,pixels=maxBytes/4,
      a=maxW*maxH,b=2*(maxW+maxH),budgetRatio=2*(pixels-4)/(b+Math.sqrt(b*b+4*a*(pixels-4))),
      ratio=Math.min(dpr,budgetRatio),sx=fit*ratio,sy=sx;
    const left=Math.floor((visibleX-margin/fit)*sx),top=Math.floor((visibleY-margin/fit)*sy),
      width=Math.max(1,Math.ceil((viewport.width+2*margin)*ratio)+1),height=Math.max(1,Math.ceil((viewport.height+2*margin)*ratio)+1),
      x=left/sx,y=top/sy,w=width/sx,h=height/sy;
    if(this.canvas.width!==width||this.canvas.height!==height){this.canvas.width=width;this.canvas.height=height;}
    this.rgbaBytes=width*height*4;this.cached={x,y,w,h,fit,z,dpr,maxBytes,hidden};
    // Lay out HTML in integer bitmap pixels, then position it with an SVG
    // transform. foreignObject layout in map units rounds away subpixel motion
    // at high zoom. A world-anchored integer raster origin also keeps identical
    // antialiasing when a pan exhausts the cache and redraws its margin.
    this.element.setAttribute('width',width);this.element.setAttribute('height',height);
    this.element.setAttribute('transform',`matrix(${1/sx} 0 0 ${1/sy} ${x} ${y})`);
    const ctx=this.context;ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,width,height);
    if(hidden)return;
    ctx.setTransform(sx,0,0,sy,-left,-top);
    for(const item of this.items){
      if(z<item.minZoom)continue;
      const b=item.bounds,s=item.style,pad=s.width/z/2*Math.max(1,s.join==='miter'?s.miter:1);
      if(s.color==='none'||!(s.width>0)||!(s.opacity>0))continue;
      if(b.x+b.width+pad<x||b.x-pad>x+w||b.y+b.height+pad<y||b.y-pad>y+h)continue;
      ctx.strokeStyle=s.color;ctx.lineWidth=s.width/z;ctx.globalAlpha=s.opacity;ctx.lineCap=s.cap;ctx.lineJoin=s.join;ctx.miterLimit=s.miter;ctx.setLineDash(s.dash.map(n=>n/z));ctx.lineDashOffset=s.dashOffset/z;
      if(!item.runs){ctx.stroke(item.path);continue;}
      // Keep subpaths in one stroke, preserving their original alpha compositing.
      const visible=new Path2D();
      for(const run of item.runs){
        const b=run.bounds;
        if(b.x+b.width+pad<x||b.x-pad>x+w||b.y+b.height+pad<y||b.y-pad>y+h)continue;
        if(s.dash.length||s.cap!=='butt'){visible.addPath(run.original);continue;}
        if(b.x>=x&&b.y>=y&&b.x+b.width<=x+w&&b.y+b.height<=y+h){visible.addPath(run.original);continue;}
        const ranges=[];
        for(const chunk of run.chunks){
          const b=chunk.bounds;
          if(b.x+b.width+pad<x||b.x-pad>x+w||b.y+b.height+pad<y||b.y-pad>y+h)continue;
          const last=ranges.at(-1);
          if(last&&chunk.start<=last.end)last.end=chunk.end;else ranges.push({start:chunk.start,end:chunk.end});
        }
        const key=ranges.map(r=>`${r.start}:${r.end}`).join(',');
        if(run.visibleKey!==key){
          const path=new Path2D(),p=run.points;
          for(const {start,end} of ranges){path.moveTo(p[start],p[start+1]);for(let i=start+2;i<end;i+=2)path.lineTo(p[i],p[i+1]);}
          run.visibleKey=key;run.visiblePath=path;
        }
        visible.addPath(run.visiblePath);
      }
      ctx.stroke(visible);
    }
  }
  remove(){this.element.remove();}
}
