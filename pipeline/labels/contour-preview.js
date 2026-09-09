const NS='http://www.w3.org/2000/svg';
/** Reuse parsed contour paths, but draw strokes at the current camera scale.
 * Only plain, untransformed contour groups are eligible; other SVG stays live. */
export class ContourPreview {
  constructor(svg,map){
    this.svg=svg;this.map=map;this.items=[];this.layers=[];this.rgbaBytes=0;
    this.element=document.createElementNS(NS,'foreignObject');this.element.dataset.layoutContourPreview='';this.element.setAttribute('pointer-events','none');
    this.canvas=document.createElement('canvas');this.canvas.style.cssText='width:100%;height:100%;display:block';this.element.append(this.canvas);
    this.context=this.canvas.getContext('2d');if(!this.context)return;
    for(const layer of [...svg.children].filter(e=>e.matches('.contours'))){
      if(layer.querySelector('[data-layout-id],text,[transform]')||layer.hasAttribute('transform')||[layer,...layer.querySelectorAll('g')].some(e=>getComputedStyle(e).transform!=='none'))continue;
      const paths=[...layer.querySelectorAll('path')];
      if(paths.some(p=>getComputedStyle(p).fill!=='none'||getComputedStyle(p).transform!=='none'))continue;
      // Firefox reports empty bounds for paths under display:none detail groups.
      const groups=[layer,...layer.querySelectorAll('g')],styles=groups.map(e=>e.getAttribute('style'));
      groups.forEach(e=>e.style.setProperty('display','inline','important'));
      const items=paths.map(e=>({e,path:new Path2D(e.getAttribute('d')),bounds:e.getBBox(),minZoom:e.closest('.g-finest')?4.5:e.closest('.g-fine')?2:0}));
      groups.forEach((e,i)=>styles[i]===null?e.removeAttribute('style'):e.setAttribute('style',styles[i]));
      this.layers.push(layer);this.items.push(...items);
    }
    this.refreshStyles();
  }
  refreshStyles(){
    const z=this.map.width/this.svg.viewBox.baseVal.width;
    for(const item of this.items){
      const s=getComputedStyle(item.e);let opacity=Number(s.opacity);
      for(let e=item.e.parentElement;e&&e!==this.svg;e=e.parentElement)opacity*=Number(getComputedStyle(e).opacity);
      item.style={color:s.stroke,width:parseFloat(s.strokeWidth)*z,opacity:opacity*Number(s.strokeOpacity),cap:s.strokeLinecap,join:s.strokeLinejoin,miter:Number(s.strokeMiterlimit),dash:s.strokeDasharray==='none'?[]:s.strokeDasharray.split(/[ ,]+/).map(v=>parseFloat(v)*z),dashOffset:parseFloat(s.strokeDashoffset)*z};
    }
  }
  render(view,viewport,maxBytes){
    if(!this.context||!this.layers.length)return;
    const ratio=Math.min(devicePixelRatio||1,Math.sqrt(maxBytes/(4*viewport.width*viewport.height)));
    const width=Math.max(1,Math.floor(viewport.width*ratio)),height=Math.max(1,Math.floor(viewport.height*ratio));
    if(this.canvas.width!==width||this.canvas.height!==height){this.canvas.width=width;this.canvas.height=height;}
    this.rgbaBytes=width*height*4;
    const fit=Math.min(viewport.width/view.w,viewport.height/view.h),w=viewport.width/fit,h=viewport.height/fit,x=view.x-(w-view.w)/2,y=view.y-(h-view.h)/2;
    for(const [key,value] of Object.entries({x,y,width:w,height:h}))this.element.setAttribute(key,value);
    const ctx=this.context;ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,width,height);
    if(this.svg.classList.contains('no-contours'))return;
    const sx=width/w,sy=height/h,z=this.map.width/view.w;
    ctx.setTransform(sx,0,0,sy,-x*sx,-y*sy);
    for(const item of this.items){
      if(z<item.minZoom)continue;
      const b=item.bounds,s=item.style,pad=s.width/z/2;
      if(s.color==='none'||!(s.width>0)||!(s.opacity>0))continue;
      if(b.x+b.width+pad<x||b.x-pad>x+w||b.y+b.height+pad<y||b.y-pad>y+h)continue;
      ctx.strokeStyle=s.color;ctx.lineWidth=s.width/z;ctx.globalAlpha=s.opacity;ctx.lineCap=s.cap;ctx.lineJoin=s.join;ctx.miterLimit=s.miter;ctx.setLineDash(s.dash.map(n=>n/z));ctx.lineDashOffset=s.dashOffset/z;
      ctx.stroke(item.path);
    }
  }
  remove(){this.element.remove();}
}
