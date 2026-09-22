import {indexLinePath,indexedLineWindows} from './candidates.js';
import {measureElement,measureTextAdvance} from './measure.js';
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
  // Repeat annotations on one contour share its projected vertices and arc
  // index. Retain only one exact screen transform per immutable source path.
  const key=[matrix.a,matrix.b,matrix.c,matrix.d,matrix.e,matrix.f].join(':');
  if(cached.screenKey===key)return cached.screen;
  const save=points=>{cached.screenKey=key;return cached.screen={length:cached.length,points,index:indexLinePath(points)};};
  if(cached.points)return save(cached.points.map(p=>project(matrix,p)));
  const count=Math.max(1,Math.min(4096,Math.ceil(cached.length*pathScale/4))),points=[];
  for(let i=0;i<=count;i++)points.push(project(matrix,path.getPointAtLength(cached.length*i/count)));
  return save(points);
}

// Glyph centers differ between engines. A short backwards source segment can
// fall between Chromium's centers but carry a Firefox/WebKit glyph. Check only
// the occupied arc (including existing ink/font reserve), not the whole path.
function uprightWindow({segments},start,end){
  let low=0,high=segments.length;
  while(low<high){const middle=(low+high)>>>1;if(segments[middle].end<start)low=middle+1;else high=middle;}
  for(let i=low;i<segments.length&&segments[i].start<=end;i++)if(Math.abs(segments[i].angle)>90+1e-5)return false;
  return true;
}

/** Apply before showing the annotation. Transform is absolute in wrapper-parent SVG
 * coordinates, already accounting for screen scale and existing nested rotation.
 * Pure camera pan preserves this transform; reprojectLineCandidate shifts cached
 * footprints. Zoom requires remeasurement. Do not divide translation by scale again. This function does not change visibility. */
export function applyLineCandidate(element,candidate) {
  const application=candidate.application??candidate;
  if(candidate.textHTML&&element.querySelector('text').innerHTML!==candidate.textHTML)element.querySelector('text').innerHTML=candidate.textHTML;
  element.setAttribute('transform',application.transform);
  if(application.textDy!==undefined){
    const text=element.querySelector('text');text.setAttribute('dy',application.textDy);
    // Measurement clones must retain the authored CSS offset, not interpret a
    // previously normalized dy as a new authored value on the next zoom.
    text.setAttribute('data-layout-authored-dy',application.authoredTextDy);
  }
  if(application.startOffset!==undefined)element.querySelector('textPath').setAttribute('startOffset',application.startOffset);
}

/** Read actual SVG path geometry and return measured CSS footprints. DOM changes used
 * for measurement are restored before returning, even on failure. No trail exemption
 * is added: the solver must reject any candidate covering a protected trail stroke.
 * Straight labels follow geometryIds with upright rotations. Curved labels retain the
 * real textPath and omit reverse-reading windows, avoiding mutation of shared paths. */
export function buildLineCandidates({annotation,element,policy={},diagnostics={},measurement={}}) {
  Object.assign(diagnostics,{paths:0,windows:0,reverseWindows:0,uprightRejected:0,legibilityRejected:0,overflowRejected:0,measuredCandidates:0});
  const text=element.querySelector('text');if(!text)return [];
  const originalTextHTML=text.innerHTML;
  const tp=text.querySelector('textPath'),originalTransform=element.getAttribute('transform'),originalOffset=tp?.getAttribute('startOffset');
  const originalDy=text.getAttribute('dy'),originalAuthoredDy=text.getAttribute('data-layout-authored-dy'),authoredDy=originalAuthoredDy??originalDy;
  const parent=element.parentElement.getScreenCTM(),parentMatrix=new DOMMatrix([parent.a,parent.b,parent.c,parent.d,parent.e,parent.f]);
  const em=element.getScreenCTM(),base=parentMatrix.inverse().multiply(new DOMMatrix([em.a,em.b,em.c,em.d,em.e,em.f]));
  const tm=text.getScreenCTM(),scale=Math.hypot(tm.a,tm.b);
  // The generators' scalar numeric/px baseline offsets are screen distances,
  // like their inverse-scaled glyphs. Leave other SVG length/list syntax intact.
  const scalarDy=authoredDy!==null&&/^[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?(?:px)?$/.test(authoredDy.trim());
  const offsetApplication=tp&&scalarDy?{textDy:String(parseFloat(authoredDy)/scale),authoredTextDy:authoredDy}:{};
  let advance=(tp?measureTextAdvance(text):text.getComputedTextLength())*scale;
  if(!tp&&text.querySelector('[data-layout-primary]'))advance=text.getBBox().width*scale;
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
      const {length,points,index}=geometry(path,pm,pathScale);
      const style=getComputedStyle(text),fontPixels=parseFloat(style.fontSize)*scale,halo=style.stroke==='none'?0:parseFloat(style.strokeWidth)*scale/2;
      const reserve=policy.measurementReserves?.[annotation.id]??0;
      const inkReserve=halo+(typeof reserve==='number'?reserve:Math.max(...['left','top','right','bottom'].map(edge=>reserve[edge]??0)));
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
      for(const window of indexedLineWindows(index,advance,options)){
        diagnostics.windows++;
        if(tp&&window.reverse){diagnostics.reverseWindows++;continue;}
        if(tp&&!uprightWindow(index,window.start-inkReserve,window.end+inkReserve)){diagnostics.uprightRejected++;continue;}
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
        let centerCandidate;const pathAnchor=tp?getComputedStyle(tp).textAnchor:null;
        for(let side=0;side<window.sideCandidates.length;side++){
          const delta=window.sideCandidates[side];let application;
          restore(element,'transform',originalTransform);
          if(tp){
            const anchor=pathAnchor,shift=anchor==='middle'?advance/2:anchor==='end'?advance:0;
            const startOffset=String((window.start+shift)/pathScale);
            application={transform:transformFor(new DOMMatrix().translate(delta.dx,delta.dy)),startOffset,...offsetApplication};
          }else{
            const metric=straightMetric,cx=metric.bounds.x+metric.bounds.width/2,cy=metric.bounds.y+metric.bounds.height/2;
            const screen=new DOMMatrix().translate(window.anchor[0]+delta.dx,window.anchor[1]+delta.dy).rotate(window.angle-textAngle).translate(-cx,-cy);
            application={transform:transformFor(screen)};
          }
          // Sides differ only by a screen translation. Glyph shaping, path
          // overflow, uprightness and baseline continuity are unchanged. Reuse
          // the exact center measurement instead of reshaping every side.
          if(side){
            if(centerCandidate)output.push({...centerCandidate,id:`${id}:${window.id}:side-${side}`,shape:moveShape(centerCandidate.shape,delta.dx,delta.dy),...application,application,side});
            continue;
          }
          applyLineCandidate(element,application);
          if(tp){
            const m=text.getScreenCTM(),baseAngle=Math.atan2(m.b,m.a)*180/Math.PI;
            let upright=true,continuous=true,previousEnd;
            const maxJump=Math.max(.25,parseFloat(getComputedStyle(text).fontSize)*Math.hypot(m.a,m.b)*.2);
            for(let i=0;i<text.getNumberOfChars();i++){
              const angle=((text.getRotationOfChar(i)+baseAngle+540)%360)-180;
              if(Math.abs(angle)>90+1e-5){upright=false;break;}
              const start=text.getStartPositionOfChar(i);
              if(previousEnd){const dx=start.x-previousEnd.x,dy=start.y-previousEnd.y;
                // A short turn can still fold an offset baseline over itself.
                // Check actual browser glyph placement, including dy, instead
                // of assuming the source centerline curvature establishes fit.
                if(Math.hypot(m.a*dx+m.c*dy,m.b*dx+m.d*dy)>maxJump){continuous=false;break;}
              }
              previousEnd=text.getEndPositionOfChar(i);
            }
            if(!upright){diagnostics.uprightRejected++;continue;}
            if(!continuous){diagnostics.legibilityRejected++;continue;}
          }
          try{centerCandidate={id:`${id}:${window.id}:side-${side}`,shape:measureElement(element,0,measurement),dx:0,dy:0,...application,application,...(tp?{textHTML:originalTextHTML}:{}),geometryId:id,angle:window.angle,side,windowStart:window.start,windowEnd:window.end};output.push(centerCandidate);}
          catch(error){if(!error.message.includes('overflow'))throw error;diagnostics.overflowRejected++;}
        }
    }
  }finally{restore(element,'transform',originalTransform);restore(text,'dy',originalDy);restore(text,'data-layout-authored-dy',originalAuthoredDy);if(tp)restore(tp,'startOffset',originalOffset);}
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
      output.push(...alternatives.map(c=>({...c,id:'straight:'+c.id,textHTML:c.textHTML??textHTML,
        ...(scalarDy?{application:{...c.application,textDy:originalDy,authoredTextDy:authoredDy}}:{})})));
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
