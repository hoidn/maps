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
      const n=text.getNumberOfChars();
      if(!n) throw new Error('Empty path label');
      for(let i=0;i<n;i++) push(text.getExtentOfChar(i),matrix,halo);
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
}
