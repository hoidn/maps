import {lineWindows} from './candidates.js';
import {measureElement} from './measure.js';
import {moveShape} from './geometry.js';
const matrixString=m=>`matrix(${m.a} ${m.b} ${m.c} ${m.d} ${m.e} ${m.f})`;
const project=(m,p)=>[m.a*p.x+m.c*p.y+m.e,m.b*p.x+m.d*p.y+m.f];
const restore=(e,name,value)=>value===null?e.removeAttribute(name):e.setAttribute(name,value);

/** Apply before showing the annotation. Transform is absolute in wrapper-parent SVG
 * coordinates, already accounting for screen scale and existing nested rotation.
 * Pure camera pan preserves this transform; reprojectLineCandidate shifts cached
 * footprints. Zoom requires remeasurement. Do not divide translation by scale again. This function does not change visibility. */
export function applyLineCandidate(element,candidate) {
  const application=candidate.application??candidate;
  element.setAttribute('transform',application.transform);
  if(application.startOffset!==undefined)element.querySelector('textPath').setAttribute('startOffset',application.startOffset);
}

/** Read actual SVG path geometry and return measured CSS footprints. DOM changes used
 * for measurement are restored before returning, even on failure. No trail exemption
 * is added: the solver must reject any candidate covering a protected trail stroke.
 * Straight labels follow geometryIds with upright rotations. Curved labels retain the
 * real textPath and omit reverse-reading windows, avoiding mutation of shared paths. */
export function buildLineCandidates({annotation,element,policy={}}) {
  const text=element.querySelector('text');if(!text)return [];
  const tp=text.querySelector('textPath'),originalTransform=element.getAttribute('transform'),originalOffset=tp?.getAttribute('startOffset');
  const parent=element.parentElement.getScreenCTM(),parentMatrix=new DOMMatrix([parent.a,parent.b,parent.c,parent.d,parent.e,parent.f]);
  const em=element.getScreenCTM(),base=parentMatrix.inverse().multiply(new DOMMatrix([em.a,em.b,em.c,em.d,em.e,em.f]));
  const tm=text.getScreenCTM(),scale=Math.hypot(tm.a,tm.b);
  let advance=text.getComputedTextLength()*scale;
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
  const output=[];
  // Conjugation maps a screen-space movement to the wrapper's parent coordinates.
  const transformFor=screen=>matrixString(parentMatrix.inverse().multiply(screen).multiply(parentMatrix).multiply(base));
  try {
    for(const id of ids){
      const path=element.ownerDocument.getElementById(id);if(!path?.getTotalLength)continue;
      const length=path.getTotalLength(),pm=path.getScreenCTM(),pathScale=Math.hypot(pm.a,pm.b);
      const count=Math.max(1,Math.min(4096,Math.ceil(length*pathScale/4))),points=[];
      for(let i=0;i<=count;i++)points.push(project(pm,path.getPointAtLength(length*i/count)));
      const style=getComputedStyle(text),fontPixels=parseFloat(style.fontSize)*scale,halo=style.stroke==='none'?0:parseFloat(style.strokeWidth)*scale/2;
      // Glyph rectangles at diagonal angles need more room than baseline distance.
      // Keep association close to the real path and let hard obstacles reject any
      // case where even this bounded side offset cannot fit.
      const options={...policy,lineOffset:policy.lineOffset??Math.min(32,Math.max(8,fontPixels*1.4+halo+(policy.clearance??2)))};
      if(tp&&originalOffset){const raw=originalOffset.endsWith('%')?parseFloat(originalOffset)*length/100:parseFloat(originalOffset);options.preferredOffset=raw*pathScale-advance/2;}
      for(const window of lineWindows(points,advance,options)){
        if(tp&&window.reverse)continue;
        for(let side=0;side<window.sideCandidates.length;side++){
          const delta=window.sideCandidates[side];let application;
          restore(element,'transform',originalTransform);
          if(tp){
            const anchor=getComputedStyle(tp).textAnchor,shift=anchor==='middle'?advance/2:anchor==='end'?advance:0;
            const startOffset=String((window.start+shift)/pathScale);
            application={transform:transformFor(new DOMMatrix().translate(delta.dx,delta.dy)),startOffset};
          }else{
            const metric=measureElement(element),cx=metric.bounds.x+metric.bounds.width/2,cy=metric.bounds.y+metric.bounds.height/2;
            const screen=new DOMMatrix().translate(window.anchor[0]+delta.dx,window.anchor[1]+delta.dy).rotate(window.angle-textAngle).translate(-cx,-cy);
            application={transform:transformFor(screen)};
          }
          applyLineCandidate(element,application);
          try{output.push({id:`${id}:${window.id}:side-${side}`,shape:measureElement(element),dx:0,dy:0,...application,application,geometryId:id,angle:window.angle,side,windowStart:window.start,windowEnd:window.end});}
          catch(error){if(!error.message.includes('overflow'))throw error;}
        }
      }
    }
  }finally{restore(element,'transform',originalTransform);if(tp)restore(tp,'startOffset',originalOffset);}
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
