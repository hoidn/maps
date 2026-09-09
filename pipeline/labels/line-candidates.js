import {lineWindows} from './candidates.js';
import {measureElement} from './measure.js';
import {moveShape} from './geometry.js';
import {measurePointVariants} from './point-variants.js';
const matrixString=m=>`matrix(${m.a} ${m.b} ${m.c} ${m.d} ${m.e} ${m.f})`;
const project=(m,p)=>[m.a*p.x+m.c*p.y+m.e,m.b*p.x+m.d*p.y+m.f];
const restore=(e,name,value)=>value===null?e.removeAttribute(name):e.setAttribute(name,value);

const pathGeometry=new WeakMap();
const numberPattern=/[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g;
// The builders author absolute, single-subpath polylines. Reading those vertices
// is exact and linear; getPointAtLength would rescan the same long path for every
// sample and every repeated annotation. General SVG curves retain the DOM fallback.
function geometry(path,matrix,pathScale){
  const d=path.getAttribute('d')||'';let cached=pathGeometry.get(path);
  if(!cached||cached.d!==d){
    const commands=d.replace(numberPattern,'').replace(/[\s,]/g,'');
    let points=null,length;
    if(/^ML*$/.test(commands)){
      const values=(d.match(numberPattern)||[]).map(Number);
      if(values.length>=4&&values.length%2===0){
        points=[];length=0;
        for(let i=0;i<values.length;i+=2){const p={x:values[i],y:values[i+1]};if(points.length)length+=Math.hypot(p.x-points.at(-1).x,p.y-points.at(-1).y);points.push(p);}
      }
    }
    cached={d,points,length:length??path.getTotalLength()};pathGeometry.set(path,cached);
  }
  if(cached.points)return {length:cached.length,points:cached.points.map(p=>project(matrix,p))};
  const count=Math.max(1,Math.min(4096,Math.ceil(cached.length*pathScale/4))),points=[];
  for(let i=0;i<=count;i++)points.push(project(matrix,path.getPointAtLength(cached.length*i/count)));
  return {length:cached.length,points};
}

/** Apply before showing the annotation. Transform is absolute in wrapper-parent SVG
 * coordinates, already accounting for screen scale and existing nested rotation.
 * Pure camera pan preserves this transform; reprojectLineCandidate shifts cached
 * footprints. Zoom requires remeasurement. Do not divide translation by scale again. This function does not change visibility. */
export function applyLineCandidate(element,candidate) {
  const application=candidate.application??candidate;
  if(candidate.textHTML&&element.querySelector('text').innerHTML!==candidate.textHTML)element.querySelector('text').innerHTML=candidate.textHTML;
  element.setAttribute('transform',application.transform);
  if(application.startOffset!==undefined)element.querySelector('textPath').setAttribute('startOffset',application.startOffset);
}

/** Read actual SVG path geometry and return measured CSS footprints. DOM changes used
 * for measurement are restored before returning, even on failure. No trail exemption
 * is added: the solver must reject any candidate covering a protected trail stroke.
 * Straight labels follow geometryIds with upright rotations. Curved labels retain the
 * real textPath and omit reverse-reading windows, avoiding mutation of shared paths. */
export function buildLineCandidates({annotation,element,policy={},diagnostics={},measurement={}}) {
  Object.assign(diagnostics,{paths:0,windows:0,reverseWindows:0,uprightRejected:0,overflowRejected:0,measuredCandidates:0});
  const text=element.querySelector('text');if(!text)return [];
  const originalTextHTML=text.innerHTML;
  const tp=text.querySelector('textPath'),originalTransform=element.getAttribute('transform'),originalOffset=tp?.getAttribute('startOffset');
  const parent=element.parentElement.getScreenCTM(),parentMatrix=new DOMMatrix([parent.a,parent.b,parent.c,parent.d,parent.e,parent.f]);
  const em=element.getScreenCTM(),base=parentMatrix.inverse().multiply(new DOMMatrix([em.a,em.b,em.c,em.d,em.e,em.f]));
  const tm=text.getScreenCTM(),scale=Math.hypot(tm.a,tm.b);
  let advance=text.getComputedTextLength()*scale;
  if(!tp&&text.querySelector('[data-layout-primary]'))advance=text.getBBox().width*scale;
  if(tp){
    // Some engines return only the on-path advance, possibly zero for an invalid
    // original offset. An unconstrained copy discovers all usable alternatives.
    const plain=element.ownerDocument.createElementNS('http://www.w3.org/2000/svg','text'),style=getComputedStyle(tp);
    for(const property of ['fontFamily','fontSize','fontWeight','fontStyle','letterSpacing'])plain.style[property]=style[property];
    for(const name of ['textLength','lengthAdjust'])if(text.hasAttribute(name))plain.setAttribute(name,text.getAttribute(name));
    plain.textContent=tp.textContent;plain.style.visibility='hidden';element.ownerSVGElement.append(plain);
    try{advance=plain.getComputedTextLength()*scale;}finally{plain.remove();}
  }
  const textAngle=Math.atan2(tm.b,tm.a)*180/Math.PI;
  const ids=tp?[annotation.geometryId??(tp.getAttribute('href')||'').slice(1)]:(annotation.geometryIds??[]);
  const output=[];const straightMetric=tp?null:measureElement(element,0,measurement);
  // Conjugation maps a screen-space movement to the wrapper's parent coordinates.
  const transformFor=screen=>matrixString(parentMatrix.inverse().multiply(screen).multiply(parentMatrix).multiply(base));
  const windows=[];
  const preferredScreen=annotation.anchor?project(element.ownerSVGElement.getScreenCTM(),{x:annotation.anchor[0],y:annotation.anchor[1]}):null;
  try {
    for(const id of ids){
      const path=element.ownerDocument.getElementById(id);if(!path?.getTotalLength)continue;
      diagnostics.paths++;
      const pm=path.getScreenCTM(),pathScale=Math.hypot(pm.a,pm.b);
      const {length,points}=geometry(path,pm,pathScale);
      const style=getComputedStyle(text),fontPixels=parseFloat(style.fontSize)*scale,halo=style.stroke==='none'?0:parseFloat(style.strokeWidth)*scale/2;
      // Glyph rectangles at diagonal angles need more room than baseline distance.
      // Keep association close to the real path and let hard obstacles reject any
      // case where even this bounded side offset cannot fit.
      const options={...policy,lineOffset:policy.lineOffset??Math.min(32,Math.max(8,fontPixels*1.4+halo+(policy.clearance??2)))};
      // Straight names do not bend with every route vertex. Curvature scores
      // their windows; protected strokes still determine whether a side fits.
      // Curved text retains the explicit curvature bound for readable glyphs.
      if(!tp){
        options.maxTurnDegrees=Infinity;
        if(annotation.anchor){
          const preferred=project(element.ownerSVGElement.getScreenCTM(),{x:annotation.anchor[0],y:annotation.anchor[1]});
          let best=Infinity,along=0;
          for(let i=1;i<points.length;i++){
            const a=points[i-1],b=points[i],dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);
            if(!length)continue;
            const t=Math.max(0,Math.min(1,((preferred[0]-a[0])*dx+(preferred[1]-a[1])*dy)/(length*length)));
            const distance=Math.hypot(preferred[0]-a[0]-t*dx,preferred[1]-a[1]-t*dy);
            if(distance<best){best=distance;options.preferredOffset=along+t*length-advance/2;}
            along+=length;
          }
        }
      }
      if(tp&&originalOffset){const raw=originalOffset.endsWith('%')?parseFloat(originalOffset)*length/100:parseFloat(originalOffset);options.preferredOffset=raw*pathScale-advance/2;}
      for(const window of lineWindows(points,advance,options)){
        diagnostics.windows++;
        if(tp&&window.reverse){diagnostics.reverseWindows++;continue;}
        if(!tp&&options.lineOffset<32){
          const radians=window.angle*Math.PI/180;
          for(const sign of [1,-1])window.sideCandidates.push({dx:-Math.sin(radians)*32*sign,dy:Math.cos(radians)*32*sign});
        }
        const score=!tp&&preferredScreen?Math.hypot(window.anchor[0]-preferredScreen[0],window.anchor[1]-preferredScreen[1]):Math.abs(window.start-(options.preferredOffset??(length*pathScale-advance)/2));
        windows.push({id,pathScale,window,score});
      }
    }
    const limit=Math.max(1,Math.floor(policy.maxLineCandidates??24));
    windows.sort((a,b)=>a.score-b.score||a.window.curvature-b.window.curvature||(a.id<b.id?-1:a.id>b.id?1:0)||a.window.start-b.window.start);
    for(const {id,pathScale,window} of windows.slice(0,limit)){
        for(let side=0;side<window.sideCandidates.length;side++){
          const delta=window.sideCandidates[side];let application;
          restore(element,'transform',originalTransform);
          if(tp){
            const anchor=getComputedStyle(tp).textAnchor,shift=anchor==='middle'?advance/2:anchor==='end'?advance:0;
            const startOffset=String((window.start+shift)/pathScale);
            application={transform:transformFor(new DOMMatrix().translate(delta.dx,delta.dy)),startOffset};
          }else{
            const metric=straightMetric,cx=metric.bounds.x+metric.bounds.width/2,cy=metric.bounds.y+metric.bounds.height/2;
            const screen=new DOMMatrix().translate(window.anchor[0]+delta.dx,window.anchor[1]+delta.dy).rotate(window.angle-textAngle).translate(-cx,-cy);
            application={transform:transformFor(screen)};
          }
          applyLineCandidate(element,application);
          if(tp){
            const m=text.getScreenCTM(),baseAngle=Math.atan2(m.b,m.a)*180/Math.PI;
            let upright=true;
            for(let i=0;i<text.getNumberOfChars();i++){
              const angle=((text.getRotationOfChar(i)+baseAngle+540)%360)-180;
              if(Math.abs(angle)>90+1e-5){upright=false;break;}
            }
            if(!upright){diagnostics.uprightRejected++;continue;}
          }
          try{output.push({id:`${id}:${window.id}:side-${side}`,shape:measureElement(element,0,measurement),dx:0,dy:0,...application,application,...(tp?{textHTML:originalTextHTML}:{}),geometryId:id,angle:window.angle,side,windowStart:window.start,windowEnd:window.end});}
          catch(error){if(!error.message.includes('overflow'))throw error;diagnostics.overflowRejected++;}
        }
    }
  }finally{restore(element,'transform',originalTransform);if(tp)restore(tp,'startOffset',originalOffset);}
  // Required route groups also need their declared straight/wrapped alternatives
  // when curved candidates exist but cannot clear other required annotations.
  // Optional names retain the cheap no-curved-candidate fallback. Source geometry
  // and shared path direction stay untouched, and no word breaks are invented.
  if(tp&&(!output.length||annotation.requiredGroup&&annotation.variants?.length)&&['l-hydro','l-river','l-trail','l-road','l-road-ref'].includes(annotation.style)){
    const originalHTML=text.innerHTML,plainText=tp.textContent;
    try{
      text.textContent=plainText;
      const textHTML=text.innerHTML,fallback={};
      const alternatives=buildLineCandidates({annotation:{...annotation,geometryId:undefined,geometryIds:ids},element,policy,diagnostics:fallback,measurement});
      output.push(...alternatives.map(c=>({...c,id:'straight:'+c.id,textHTML:c.textHTML??textHTML})));
      diagnostics.straightFallback=fallback;
    }finally{text.innerHTML=originalHTML;}
  }
  if(!tp&&annotation.variants?.length){
    const originalHTML=text.innerHTML;
    try{
      for(const variant of measurePointVariants(element,annotation,measurement)){
        text.innerHTML=variant.textHTML;
        const alternatives=buildLineCandidates({annotation:{...annotation,variants:[]},element,policy,measurement});
        output.push(...alternatives.map(c=>({...c,id:variant.id+':'+c.id,textHTML:variant.textHTML})));
      }
    }finally{text.innerHTML=originalHTML;}
  }
  diagnostics.measuredCandidates=output.length;
  return output;
}

/** Reuse measurements only for pure camera translation. Both matrices are the
 * annotation wrapper parent's screen CTM in the old/new view. Text size, style,
 * fonts and path geometry must otherwise be unchanged. */
export function reprojectLineCandidate(candidate,previousMatrix,currentMatrix) {
  if(!['a','b','c','d','e','f'].every(k=>Number.isFinite(previousMatrix[k])&&Number.isFinite(currentMatrix[k]))||['a','b','c','d'].some(k=>Math.abs(previousMatrix[k]-currentMatrix[k])>1e-9))throw new Error('Camera scale or rotation changed: remeasure line candidates');
  const dx=currentMatrix.e-previousMatrix.e,dy=currentMatrix.f-previousMatrix.f;
  return {...candidate,shape:moveShape(candidate.shape,dx,dy)};
}
