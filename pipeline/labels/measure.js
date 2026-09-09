const advanceCache = new Map();
/** Conservative painted footprints in CSS screen pixels, including SVG ancestors. */
export function measureElement(element, padding=0) {
  if(!element) throw new Error('Missing annotation element');
  const parts=[];
  const push=(box,matrix,halo)=>{
    if(!matrix || ![box.x,box.y,box.width,box.height].every(Number.isFinite)) throw new Error('Invalid annotation metrics');
    const corners=[[box.x,box.y],[box.x+box.width,box.y],[box.x+box.width,box.y+box.height],[box.x,box.y+box.height]].map(([x,y])=>({x:matrix.a*x+matrix.c*y+matrix.e,y:matrix.b*x+matrix.d*y+matrix.f}));
    const x=Math.min(...corners.map(p=>p.x))-halo-padding,y=Math.min(...corners.map(p=>p.y))-halo-padding;
    parts.push({x,y,width:Math.max(...corners.map(p=>p.x))+halo+padding-x,height:Math.max(...corners.map(p=>p.y))+halo+padding-y});
  };
  const texts=element.matches('text')?[element]:[...element.querySelectorAll('text')];
  if(texts.length) for(const text of texts) {
    const matrix=text.getScreenCTM(), style=getComputedStyle(text);
    const halo=style.stroke==='none'?0:parseFloat(style.strokeWidth)*Math.max(Math.hypot(matrix.a,matrix.b),Math.hypot(matrix.c,matrix.d))/2;
    if(text.querySelector('textPath')) {
      const textPath=text.querySelector('textPath');
      const path=document.getElementById((textPath.getAttribute('href')||'').slice(1));
      if(!path) throw new Error('Missing text path');
      const length=path.getTotalLength(), raw=textPath.getAttribute('startOffset')||'0';
      const offset=raw.endsWith('%')?parseFloat(raw)*length/100:parseFloat(raw);
      const pathStyle=getComputedStyle(textPath), anchor=pathStyle.textAnchor;
      const fontKey=[textPath.textContent,pathStyle.fontFamily,pathStyle.fontSize,pathStyle.fontWeight,pathStyle.fontStyle,pathStyle.letterSpacing,text.getAttribute('textLength'),text.getAttribute('lengthAdjust')].join('|');
      // Firefox/WebKit can report only the portion that fit on the path. Measure
      // an unconstrained copy so clipped characters cannot disappear from the test.
      if(!advanceCache.has(fontKey)) {
        const plain=document.createElementNS('http://www.w3.org/2000/svg','text');
        for(const property of ['fontFamily','fontSize','fontWeight','fontStyle','letterSpacing'])plain.style[property]=pathStyle[property];
        plain.style.visibility='hidden';plain.textContent=textPath.textContent;
        for(const attribute of ['textLength','lengthAdjust'])if(text.hasAttribute(attribute))plain.setAttribute(attribute,text.getAttribute(attribute));
        text.ownerSVGElement.append(plain);
        try {advanceCache.set(fontKey,plain.getComputedTextLength());} finally {plain.remove();}
      }
      const advance=advanceCache.get(fontKey);
      const start=offset-(anchor==='middle'?advance/2:anchor==='end'?advance:0);
      if(start < -1e-4 || start+advance > length+1e-4) throw new Error('Text path overflow');
      const n=text.getNumberOfChars();
      if(!n) throw new Error('Empty path label');
      for(let i=0;i<n;i++) push(text.getExtentOfChar(i),matrix,halo);
    } else if(Math.abs(matrix.b)>1e-7||Math.abs(matrix.c)>1e-7){
      for(let i=0;i<text.getNumberOfChars();i++)push(text.getExtentOfChar(i),matrix,halo);
    } else push(text.getBBox(),matrix,halo);
  } else {
    const matrix=element.getScreenCTM();
    const painted=[...element.querySelectorAll('path,rect,circle,polygon,ellipse,line,polyline')];
    if(!painted.length) painted.push(element);
    for(const shape of painted) {
      const st=getComputedStyle(shape), m=shape.getScreenCTM();
      const halo=st.stroke==='none'?0:parseFloat(st.strokeWidth)*Math.max(Math.hypot(m.a,m.b),Math.hypot(m.c,m.d))/2;
      push(shape.getBBox(),m,halo);
    }
  }
  if(!parts.length) throw new Error('Empty annotation metrics');
  const x=Math.min(...parts.map(p=>p.x)),y=Math.min(...parts.map(p=>p.y));
  const bounds={x,y,width:Math.max(...parts.map(p=>p.x+p.width))-x,height:Math.max(...parts.map(p=>p.y+p.height))-y};
  return {parts,bounds};
}

export async function ensureFonts(families=['Source Sans 3','Alegreya','Bree Serif']) {
  const faces=[...document.fonts];
  for(const name of families) {
    const required=faces.filter(f=>f.family.replaceAll('"','').replaceAll("'",'')===name);
    if(!required.length) throw new Error('Missing font: '+name);
    await Promise.all(required.map(f=>f.load()));
    if(required.some(f=>f.status!=='loaded')) throw new Error('Unavailable font: '+name);
  }
  await document.fonts.ready;
  advanceCache.clear();
}

export class MetricCache {
  constructor() { this.entries=new Map(); }
  get(key,measure) { if(!this.entries.has(key))this.entries.set(key,measure());return this.entries.get(key); }
  invalidate() {this.entries.clear();}
}
