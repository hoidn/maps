let textGroup=0;
const SHAPES='path,rect,circle,ellipse,line,polygon,polyline';
export const matrixArray=m=>[m.a,m.b,m.c,m.d,m.e,m.f];
export function viewMatrix(view,r){const s=Math.min(r.width/view.w,r.height/view.h);return new DOMMatrix([s,0,0,s,r.x+(r.width-view.w*s)/2-view.x*s,r.y+(r.height-view.h*s)/2-view.y*s]);}
export function paintStyle(e,svg){
 const s=getComputedStyle(e);let opacity=1;
 for(let p=e;p&&p!==svg;p=p.parentElement)opacity*=Number(getComputedStyle(p).opacity);
 return {fill:s.fill,stroke:s.stroke,width:parseFloat(s.strokeWidth)||0,opacity,fillOpacity:Number(s.fillOpacity),strokeOpacity:Number(s.strokeOpacity),cap:s.strokeLinecap,join:s.strokeLinejoin,miter:Number(s.strokeMiterlimit),dash:s.strokeDasharray==='none'?[]:s.strokeDasharray.split(/[ ,]+/).map(parseFloat),dashOffset:parseFloat(s.strokeDashoffset)||0,fillRule:s.fillRule,paintOrder:s.paintOrder,fontSize:parseFloat(s.fontSize),font:`${s.fontStyle} ${s.fontWeight} ${s.fontSize} ${s.fontFamily}`};
}
export function pathFor(e){
 const n=k=>Number(e.getAttribute(k)||0),p=new Path2D();
 switch(e.tagName.toLowerCase()){
 case 'path':return new Path2D(e.getAttribute('d')||'');
 case 'rect':{const x=n('x'),y=n('y'),w=n('width'),h=n('height'),rx=Math.min(n('rx'),w/2),ry=Math.min(n('ry')||rx,h/2);if(rx||ry)return new Path2D(`M${x+rx},${y}H${x+w-rx}Q${x+w},${y} ${x+w},${y+ry}V${y+h-ry}Q${x+w},${y+h} ${x+w-rx},${y+h}H${x+rx}Q${x},${y+h} ${x},${y+h-ry}V${y+ry}Q${x},${y} ${x+rx},${y}Z`);p.rect(x,y,w,h);break;}
 case 'circle':p.arc(n('cx'),n('cy'),n('r'),0,Math.PI*2);break;
 case 'ellipse':p.ellipse(n('cx'),n('cy'),n('rx'),n('ry'),0,0,Math.PI*2);break;
 case 'line':p.moveTo(n('x1'),n('y1'));p.lineTo(n('x2'),n('y2'));break;
 case 'polygon':case 'polyline':{const a=(e.getAttribute('points')||'').trim().split(/[ ,]+/).map(Number);p.moveTo(a[0],a[1]);for(let i=2;i<a.length;i+=2)p.lineTo(a[i],a[i+1]);if(e.tagName.toLowerCase()==='polygon')p.closePath();break;}
 default:throw new Error('Unsupported Canvas shape: '+e.tagName);
 }
 return p;
}
function bounds(e){const b=e.getBBox();return {x:b.x,y:b.y,width:b.width,height:b.height};}
/** Capture browser-positioned glyphs, including tspan baselines and textPath angles.
 * Commands contain paint inputs, not collision-solver boxes. */
export function captureCommands(root,svg,{world=false}={}){
 const output=[],inverse=world?svg.getScreenCTM().inverse():new DOMMatrix();
 const nodes=root.matches(SHAPES+',text')?[root]:[...root.querySelectorAll(SHAPES+',text')];
 for(const e of nodes){
  if(e.closest('defs')||e.closest('[data-layout-measurement]'))continue;
  const m=inverse.multiply(e.getScreenCTM()),style=paintStyle(e,svg);
  if(e.tagName.toLowerCase()!=='text'){output.push({kind:'path',path:pathFor(e),matrix:matrixArray(m),style,bounds:bounds(e)});continue;}
  const group=++textGroup,text=e.textContent.replace(/\s+/g,' ').trim(),count=e.getNumberOfChars();
  const owners=[];const walk=document.createTreeWalker(e,NodeFilter.SHOW_TEXT);let node;
  while((node=walk.nextNode()))for(let i=0;i<node.textContent.length;i++)owners.push(node.parentElement);
  for(let i=0;i<count;i++){
   const p=e.getStartPositionOfChar(i),rotation=e.getRotationOfChar(i),st=owners[i]&&owners[i]!==e?paintStyle(owners[i],svg):style;
   output.push({kind:'glyph',group,secondary:!!owners[i]?.closest('tspan:not([data-layout-primary])'),text:text[i]||'',matrix:matrixArray(m.translate(p.x,p.y).rotate(rotation)),style:st});
  }
 }
 return output;
}
/** A fresh cache belongs to one synchronous draw and one context. Between calls
 * only transforms, globalAlpha and drawImage may be changed externally. Discard
 * it after save/restore, context reset, resize, or any external style mutation.
 * Commands need not share style/array identities; dash values are compared.
 */
export const createPaintState=ctx=>({context:ctx,dash:null});
export function paintCommands(ctx,commands,outer=new DOMMatrix(),{strokeFactor=1,opacity=1,state}={}){
 if(state?.context!==ctx)state=undefined;
 const paint=(c,pass)=>{
  const t=c.matrix,s=c.style;
  // Most geographic paths have only a stroke. An absent paint pass must not
  // repeat transform, dash and font setup for thousands of invisible fills.
  if(pass==='fill'?s.fill==='none':s.stroke==='none'||!s.width)return;
  ctx.setTransform(outer.a*t[0]+outer.c*t[1],outer.b*t[0]+outer.d*t[1],outer.a*t[2]+outer.c*t[3],outer.b*t[2]+outer.d*t[3],outer.a*t[4]+outer.c*t[5]+outer.e,outer.b*t[4]+outer.d*t[5]+outer.f);
  if(state){
   const width=s.width*strokeFactor,offset=s.dashOffset*strokeFactor;
   if(state.width!==width)ctx.lineWidth=state.width=width;
   if(state.cap!==s.cap)ctx.lineCap=state.cap=s.cap;
   if(state.join!==s.join)ctx.lineJoin=state.join=s.join;
   if(state.miter!==s.miter)ctx.miterLimit=state.miter=s.miter;
   if(state.dashOffset!==offset)ctx.lineDashOffset=state.dashOffset=offset;
   let same=state.dash?.length===s.dash.length;
   if(same)for(let i=0;i<s.dash.length;i++)if(state.dash[i]!==s.dash[i]*strokeFactor){same=false;break;}
   if(!same){const dash=s.dash.map(n=>n*strokeFactor);ctx.setLineDash(dash);state.dash=dash;}
   if(c.kind==='glyph'){
    if(state.font!==s.font)ctx.font=state.font=s.font;
    if(!state.textDefaults){ctx.textAlign='left';ctx.textBaseline='alphabetic';ctx.fontKerning='none';state.textDefaults=true;}
   }
  }else{
   ctx.lineWidth=s.width*strokeFactor;ctx.lineCap=s.cap;ctx.lineJoin=s.join;ctx.miterLimit=s.miter;ctx.setLineDash(s.dash.map(n=>n*strokeFactor));ctx.lineDashOffset=s.dashOffset*strokeFactor;
   if(c.kind==='glyph'){ctx.font=s.font;ctx.textAlign='left';ctx.textBaseline='alphabetic';ctx.fontKerning='none';}
  }
  if(pass==='fill'&&s.fill!=='none'){ctx.globalAlpha=s.opacity*s.fillOpacity*opacity;if(!state||state.fill!==s.fill){ctx.fillStyle=s.fill;if(state)state.fill=s.fill;}if(c.kind==='glyph')ctx.fillText(c.text,0,0);else ctx.fill(c.path,s.fillRule);}
  if(pass==='stroke'&&s.stroke!=='none'&&s.width){ctx.globalAlpha=s.opacity*s.strokeOpacity*opacity;if(!state||state.stroke!==s.stroke){ctx.strokeStyle=s.stroke;if(state)state.stroke=s.stroke;}if(c.kind==='glyph')ctx.strokeText(c.text,0,0);else ctx.stroke(c.path);}
 };
 for(let i=0;i<commands.length;){
  const c=commands[i];let end=i+1;
  if(c.kind==='glyph')while(end<commands.length&&commands[end].kind==='glyph'&&commands[end].group===c.group)end++;
  // SVG strokes the complete text chunk before filling any glyph in it.
  const passes=c.style.paintOrder.startsWith('stroke')?['stroke','fill']:['fill','stroke'];
  for(const pass of passes)for(let j=i;j<end;j++)paint(commands[j],pass);
  i=end;
 }
}
export function commandBounds(commands){
 let x=Infinity,y=Infinity,right=-Infinity,bottom=-Infinity,pad=0;
 for(const c of commands){if(!c.bounds)return null;const b=c.bounds,m=c.matrix;
  for(const px of [b.x,b.x+b.width])for(const py of [b.y,b.y+b.height]){const tx=m[0]*px+m[2]*py+m[4],ty=m[1]*px+m[3]*py+m[5];x=Math.min(x,tx);y=Math.min(y,ty);right=Math.max(right,tx);bottom=Math.max(bottom,ty);}
  const s=c.style;pad=Math.max(pad,s.stroke==='none'?0:s.width/2*Math.max(1,s.join==='miter'?s.miter:1)*Math.max(Math.hypot(m[0],m[1]),Math.hypot(m[2],m[3])));
 }
 return {x,y,right,bottom,pad};
}
const layerName=e=>[...e.classList].find(c=>['terrain','landcover','boundaries','buildings','coordinate-grid','contours','contour-labels','hydro','roads','trails','regions','hydro-labels','boundary-labels','peaks','symbols','trail-labels','labels','fixed-ui','neatline'].includes(c))||'other';
export class MapScene{
 constructor(svg,map){this.svg=svg;this.map=map;this.items=[];this.hits=[];}
 async prepare(){
  this.items=[];this.hits=[];let deadline=performance.now()+8;
  for(const top of this.svg.children){
   const layer=layerName(top);if(top.tagName.toLowerCase()==='defs'||layer==='contours'||top.matches('[data-layout-runtime],[data-layout-preview],[data-layout-contour-preview]'))continue;
   if(top.matches('.hits')){for(const e of top.querySelectorAll('path'))this.hits.push({element:e,path:pathFor(e),bounds:bounds(e)});continue;}
   if(top.tagName.toLowerCase()==='image'){
    const image=new Image();image.src=top.getAttribute('href');await image.decode();
    this.items.push({kind:'image',element:top,image,layer,opacity:Number(getComputedStyle(top).opacity),x:Number(top.getAttribute('x')||0),y:Number(top.getAttribute('y')||0),width:Number(top.getAttribute('width')),height:Number(top.getAttribute('height'))});continue;
   }
   const nodes=top.matches(SHAPES+',text')?[top]:[...top.querySelectorAll(SHAPES+',text')];
   for(const e of nodes){
    if(e.closest('[data-layout-id]')||e.closest('defs'))continue;
    const transient=['lit','dim'].filter(c=>e.classList.contains(c));if(transient.length)e.classList.remove(...transient);
    let commands;try{commands=captureCommands(e,this.svg,{world:true});}finally{if(transient.length)e.classList.add(...transient);}
    const z=this.map.width/this.svg.viewBox.baseVal.width,constantStroke=!!e.closest('.roads,.hydro,.trails,.boundaries,.buildings');
    if(constantStroke)for(const c of commands){c.style.width*=z;c.style.dash=c.style.dash.map(n=>n*z);c.style.dashOffset*=z;}
    this.items.push({kind:'commands',element:e,layer,commands,maxMpp:Number(e.dataset.maxMpp)||null,bounds:commandBounds(commands),constantStroke,name:e.dataset.name});
    if(performance.now()>=deadline){await new Promise(r=>setTimeout(r,0));deadline=performance.now()+8;}
   }
  }
  this.byLayer=new Map();this.images=[];for(const item of this.items){if(item.kind==='image')this.images.push(item);else{if(!this.byLayer.has(item.layer))this.byLayer.set(item.layer,[]);this.byLayer.get(item.layer).push(item);}}
 }
 visible(item,layers,z,view){
  const b=item.bounds;if(b&&view){const pad=b.pad/(item.constantStroke?z:1);if(b.right+pad<view.x||b.x-pad>view.x+view.w||b.bottom+pad<view.y||b.y-pad>view.y+view.h)return false;}
  if(item.maxMpp&&this.metersPerPixel>item.maxMpp)return false;
  if(item.layer==='landcover')return layers.landcover!==false&&getComputedStyle(item.element).display!=='none';
  if(['boundaries','boundary-labels'].includes(item.layer)&&layers.boundaries===false)return false;
  if(item.layer==='coordinate-grid'&&!layers.grid)return false;
  if(item.layer==='terrain')return layers.relief&&getComputedStyle(item.element).display!=='none';
  if(['hydro','hydro-labels'].includes(item.layer)&&!layers.water)return false;
  if(item.layer==='fixed-ui'&&z>1.02)return false;
  return true;
 }
}
