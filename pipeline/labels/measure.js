const advanceCache = new Map();
const advanceProbes=new WeakMap();
const canvasInkCache=new Map(),canvasContexts=new WeakMap();
/** Full textPath advance, including glyphs clipped by the current path offset.
 * A separate SVG keeps probe changes out of the geographic scene's layout.
 * Match the source SVG's viewport and viewBox: fractional scale affects shaping.
 */
export function measureTextAdvance(text) {
  const source=text.querySelector('textPath')||text,style=getComputedStyle(source),svg=text.ownerSVGElement,viewport=svg.getBoundingClientRect();
  const viewBox=svg.getAttribute('viewBox'),view=svg.viewBox.baseVal,aspect=svg.getAttribute('preserveAspectRatio');
  const properties=['fontFamily','fontSize','fontWeight','fontStyle','letterSpacing'];
  const key=JSON.stringify([source.textContent,...properties.map(name=>style[name]),text.getAttribute('textLength'),text.getAttribute('lengthAdjust'),view.width,view.height,aspect,viewport.width,viewport.height]);
  if(!advanceCache.has(key)){
    const doc=text.ownerDocument;let probe=advanceProbes.get(doc);
    if(!probe?.svg.isConnected){
      const svg=doc.createElementNS('http://www.w3.org/2000/svg','svg'),plain=doc.createElementNS(svg.namespaceURI,'text');
      svg.dataset.layoutRuntime='';
      svg.style.cssText='position:fixed;left:0;top:0;visibility:hidden;pointer-events:none;overflow:hidden';
      svg.append(plain);doc.body.append(svg);probe={svg,plain};advanceProbes.set(doc,probe);
    }
    probe.svg.style.width=viewport.width+'px';probe.svg.style.height=viewport.height+'px';
    for(const [name,value] of [['viewBox',viewBox],['preserveAspectRatio',aspect]])if(value===null)probe.svg.removeAttribute(name);else probe.svg.setAttribute(name,value);
    for(const property of properties)probe.plain.style[property]=style[property];
    for(const name of ['textLength','lengthAdjust']){const value=text.getAttribute(name);if(value===null)probe.plain.removeAttribute(name);else probe.plain.setAttribute(name,value);}
    probe.plain.textContent=source.textContent;
    advanceCache.set(key,probe.plain.getComputedTextLength());
  }
  return advanceCache.get(key);
}
/** Conservative painted footprints in CSS screen pixels, including SVG ancestors. */
export function measureElement(element, padding=0, {canvasInk=false}={}) {
  if(!element) throw new Error('Missing annotation element');
  const parts=[];
  const paintedRect=(box,matrix,halo)=>{
    if(!matrix || ![box.x,box.y,box.width,box.height].every(Number.isFinite)) throw new Error('Invalid annotation metrics');
    const corners=[[box.x,box.y],[box.x+box.width,box.y],[box.x+box.width,box.y+box.height],[box.x,box.y+box.height]].map(([x,y])=>({x:matrix.a*x+matrix.c*y+matrix.e,y:matrix.b*x+matrix.d*y+matrix.f}));
    const x=Math.min(...corners.map(p=>p.x))-halo-padding,y=Math.min(...corners.map(p=>p.y))-halo-padding;
    return {x,y,width:Math.max(...corners.map(p=>p.x))+halo+padding-x,height:Math.max(...corners.map(p=>p.y))+halo+padding-y};
  };
  const push=(box,matrix,halo)=>parts.push(paintedRect(box,matrix,halo));
  const texts=element.matches('text')?[element]:[...element.querySelectorAll('text')];
  if(texts.length) for(const text of texts) {
    const firstPart=parts.length;
    const matrix=text.getScreenCTM(), style=getComputedStyle(text);
    const halo=style.stroke==='none'?0:parseFloat(style.strokeWidth)*Math.max(Math.hypot(matrix.a,matrix.b),Math.hypot(matrix.c,matrix.d))/2;
    if(text.querySelector('textPath')) {
      const textPath=text.querySelector('textPath');
      const path=document.getElementById((textPath.getAttribute('href')||'').slice(1));
      if(!path) throw new Error('Missing text path');
      const length=path.getTotalLength(), raw=textPath.getAttribute('startOffset')||'0';
      const offset=raw.endsWith('%')?parseFloat(raw)*length/100:parseFloat(raw);
      const pathStyle=getComputedStyle(textPath), anchor=pathStyle.textAnchor;
      const advance=measureTextAdvance(text);
      const start=offset-(anchor==='middle'?advance/2:anchor==='end'?advance:0);
      if(start < -1e-4 || start+advance > length+1e-4) throw new Error('Text path overflow');
      const n=text.getNumberOfChars();
      if(!n) throw new Error('Empty path label');
      for(let i=0;i<n;i++) push(text.getExtentOfChar(i),matrix,halo);
    } else if(Math.abs(matrix.b)>1e-7||Math.abs(matrix.c)>1e-7){
      for(let i=0;i<text.getNumberOfChars();i++)push(text.getExtentOfChar(i),matrix,halo);
    } else if(text.querySelector('tspan[data-layout-primary]')&&[...text.childNodes].every(n=>n.nodeType===1||!n.textContent.trim())){
      // Declared wraps consist entirely of tspans. Reserve each painted line,
      // including attached secondary information, without filling the unused
      // space beside a shorter line. Every line retains its own stroke halo.
      for(const span of text.children){
        const m=span.getScreenCTM(),st=getComputedStyle(span);
        const lineHalo=st.stroke==='none'?0:parseFloat(st.strokeWidth)*Math.max(Math.hypot(m.a,m.b),Math.hypot(m.c,m.d))/2;
        // WebKit returns the entire parent text box for tspan.getBBox().
        // Character extents are correctly scoped to the individual span.
        const glyphs=Array.from({length:span.getNumberOfChars()},(_,i)=>span.getExtentOfChar(i));
        if(!glyphs.length)continue;
        const x=Math.min(...glyphs.map(g=>g.x)),y=Math.min(...glyphs.map(g=>g.y));
        push({x,y,width:Math.max(...glyphs.map(g=>g.x+g.width))-x,height:Math.max(...glyphs.map(g=>g.y+g.height))-y},m,lineHalo);
      }
    } else push(text.getBBox(),matrix,halo);
    if(canvasInk){
      // Canvas paints individual glyphs at SVG-provided positions. Its glyph
      // bearings can extend beyond SVG character/line boxes (notably Firefox).
      // Canvas-only footprints must also exclude unpainted SVG advance/em
      // space: retaining it would understate distance from an anchor to paint.
      // Keep the same line/glyph grouping and shared collision padding.
      const doc=text.ownerDocument;let context=canvasContexts.get(doc);
      if(!context){context=doc.createElement('canvas').getContext('2d');context.fontKerning='none';canvasContexts.set(doc,context);}
      const owners=[],walk=doc.createTreeWalker(text,NodeFilter.SHOW_TEXT);let node;
      while((node=walk.nextNode()))for(let i=0;i<node.textContent.length;i++)owners.push(node.parentElement);
      const value=text.textContent.replace(/\s+/g,' ').trim(),children=[...text.children],styles=new Map(),count=text.getNumberOfChars();
      const baseMatrix=new DOMMatrix([matrix.a,matrix.b,matrix.c,matrix.d,matrix.e,matrix.f]);
      const byCharacter=!!text.querySelector('textPath')||Math.abs(matrix.b)>1e-7||Math.abs(matrix.c)>1e-7,canvasParts=[];
      for(let i=0;i<count;i++){
        const owner=owners[i]||text;let style=styles.get(owner);
        if(!style){style=getComputedStyle(owner);styles.set(owner,style);}
        const font=`${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`,char=value[i]||'',key=font+'|'+char;
        // WebKit can report an em-height extent for a space despite painting
        // no pixels. Whitespace advances never belong to an ink footprint.
        if(!char.trim())continue;
        let ink=canvasInkCache.get(key);
        if(!ink){context.font=font;const t=context.measureText(char);ink={x:-t.actualBoundingBoxLeft,y:-t.actualBoundingBoxAscent,width:t.actualBoundingBoxLeft+t.actualBoundingBoxRight,height:t.actualBoundingBoxAscent+t.actualBoundingBoxDescent};
          // Continuous zoom can produce indefinitely many fractional font sizes.
          if(canvasInkCache.size>=8192)canvasInkCache.delete(canvasInkCache.keys().next().value);
          canvasInkCache.set(key,ink);
        }
        if(!ink.width&&!ink.height)continue;
        const position=text.getStartPositionOfChar(i),m=baseMatrix.translate(position.x,position.y).rotate(text.getRotationOfChar(i));
        const inkHalo=style.stroke==='none'?0:parseFloat(style.strokeWidth)*Math.max(Math.hypot(m.a,m.b),Math.hypot(m.c,m.d))/2*(style.strokeLinejoin.startsWith('miter')?Math.max(1,parseFloat(style.strokeMiterlimit)||4):1);
        const r=paintedRect(ink,m,inkHalo),part=byCharacter?i:parts.length-firstPart===1?0:Math.max(0,children.findIndex(child=>child.contains(owner))),b=canvasParts[part];
        if(!b)canvasParts[part]=r;
        else{const x=Math.min(b.x,r.x),y=Math.min(b.y,r.y);canvasParts[part]={x,y,width:Math.max(b.x+b.width,r.x+r.width)-x,height:Math.max(b.y+b.height,r.y+r.height)-y};}
      }
      // Spaces have no ink; preserve painted-part order without empty holes.
      parts.splice(firstPart,parts.length-firstPart,...canvasParts.filter(Boolean));
    }
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
  canvasInkCache.clear();
}

export class MetricCache {
  constructor() { this.entries=new Map(); }
  get(key,measure) { if(!this.entries.has(key))this.entries.set(key,measure());return this.entries.get(key); }
  invalidate() {this.entries.clear();}
}
