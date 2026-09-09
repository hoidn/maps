/** Serialized independent DOM collector. No production measurement/solver imports. */
export function collectTypography() {
  const svg=document.querySelector('#mapsvg'),source=document.querySelector('#map-label-manifest');
  if(!svg||!source)throw new Error('Typography manifest/map missing');
  const manifest=JSON.parse(source.textContent),items=[];
  const shown=e=>{for(let p=e;p?.nodeType===1;p=p.parentElement){const s=getComputedStyle(p);if(s.display==='none'||s.visibility==='hidden'||+s.opacity===0||p.hasAttribute('hidden'))return false;}return true;};
  const project=(m,x,y)=>({x:m.a*x+m.c*y+m.e,y:m.b*x+m.d*y+m.f});
  const angle=(m,degrees=0)=>{const rad=degrees*Math.PI/180,x=Math.cos(rad),y=Math.sin(rad);return Math.atan2(m.b*x+m.d*y,m.a*x+m.c*y)*180/Math.PI;};
  const sm=svg.getScreenCTM();
  for(const a of manifest.annotations){const e=document.getElementById(a.elementId??a.id);if(!e||!shown(e))continue;
    for(const text of e.matches('text')?[e]:e.querySelectorAll('text')){if(!shown(text))continue;
      try{
        const m=text.getScreenCTM(),r=text.getBoundingClientRect(),style=getComputedStyle(text),halo=style.stroke==='none'?0:parseFloat(style.strokeWidth)*Math.max(Math.hypot(m.a,m.b),Math.hypot(m.c,m.d))/2,anchor=project(sm,...a.anchor),item={id:a.id,kind:a.kind,style:a.style,fonts:[],angles:[],anchor,bounds:{left:r.left-halo,top:r.top-halo,right:r.right+halo,bottom:r.bottom+halo}};
        for(const span of [text,...text.querySelectorAll('tspan')]){if(![...span.childNodes].some(n=>n.nodeType===3&&n.textContent.trim()))continue;const css=getComputedStyle(span),cm=span.getScreenCTM();item.fonts.push({size:parseFloat(css.fontSize)*Math.min(Math.hypot(cm.a,cm.b),Math.hypot(cm.c,cm.d)),secondary:span!==text&&!span.hasAttribute('data-layout-primary')});}
        const tp=text.querySelector('textPath');
        if(tp){
          const css=getComputedStyle(tp),plain=document.createElementNS('http://www.w3.org/2000/svg','text');
          for(const k of ['fontFamily','fontSize','fontWeight','fontStyle','letterSpacing'])plain.style[k]=css[k];
          for(const k of ['textLength','lengthAdjust'])if(text.hasAttribute(k))plain.setAttribute(k,text.getAttribute(k));
          plain.textContent=tp.textContent;plain.style.visibility='hidden';svg.append(plain);let advance;
          try{advance=plain.getComputedTextLength();}finally{plain.remove();}
          const path=document.getElementById((tp.getAttribute('href')??tp.getAttribute('xlink:href')??'').replace(/^#/,''));
          if(!path?.getTotalLength)throw new Error('Missing text path');
          const length=path.getTotalLength(),raw=tp.getAttribute('startOffset')??'0',offset=raw.endsWith('%')?parseFloat(raw)*length/100:parseFloat(raw),start=offset-(css.textAnchor==='middle'?advance/2:css.textAnchor==='end'?advance:0);
          item.path={length,start,end:start+advance};item.fonts.push({size:parseFloat(css.fontSize)*Math.min(Math.hypot(m.a,m.b),Math.hypot(m.c,m.d)),secondary:false});
          for(let i=0;i<text.getNumberOfChars();i++)if(text.textContent[i]?.trim())item.angles.push(angle(m,text.getRotationOfChar(i)));
        }else item.angles.push(angle(m));
        items.push(item);
      }catch(error){items.push({id:a.id,error:error.message});}
    }
  }
  return {mode:manifest.map.mode,items};
}
export function checkTypography(data,policy={}) {
  const failures=[],sizes={place:12,secondary:10,contour:10,trail:13,region:14,...policy.sizes};
  for(const item of data.items){if(item.error){failures.push({id:item.id,reason:'invalid-typography',detail:item.error});continue;}
    const minimum=item.style?.startsWith('l-contour')?sizes.contour:item.kind==='region-label'?sizes.region:item.style?.startsWith('l-trail')?sizes.trail:item.style==='l-major'?14:['l-minor','l-peak'].includes(item.style)?sizes.secondary:sizes.place;
    for(const font of item.fonts){if(!Number.isFinite(font.size)||font.size<=0)failures.push({id:item.id,reason:'invalid-font-size',size:font.size});else if(data.mode==='interactive'&&font.size+1e-4<(font.secondary?sizes.secondary:minimum))failures.push({id:item.id,reason:'minimum-font-size',size:font.size,minimum:font.secondary?sizes.secondary:minimum});}
    if(item.kind==='line-label'&&item.angles.some(a=>!Number.isFinite(a)||Math.abs(a)>90.0001))failures.push({id:item.id,reason:'upside-down',angles:item.angles.filter(a=>!Number.isFinite(a)||Math.abs(a)>90.0001)});
    if(item.path&&(!Object.values(item.path).every(Number.isFinite)||item.path.start< -1e-4||item.path.end>item.path.length+1e-4))failures.push({id:item.id,reason:'text-path-overflow',...item.path});
    if(data.mode==='interactive'&&item.kind==='point-label'){const b=item.bounds,p=item.anchor,dx=Math.max(b.left-p.x,0,p.x-b.right),dy=Math.max(b.top-p.y,0,p.y-b.bottom),distance=Math.hypot(dx,dy);if(!Number.isFinite(distance)||distance>(policy.maxPointDisplacement??32)+1e-4)failures.push({id:item.id,reason:'point-displacement',distance,maximum:policy.maxPointDisplacement??32});}
  }
  return failures;
}
