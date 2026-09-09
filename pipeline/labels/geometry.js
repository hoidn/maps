export function validRect(r) {
  if(!r || ![r.x,r.y,r.width,r.height].every(Number.isFinite)||r.width<0||r.height<0) throw new Error('Invalid rectangle');
  return r;
}
export function expand(r,n) {validRect(r);return {x:r.x-n,y:r.y-n,width:r.width+2*n,height:r.height+2*n};}
export function intersects(a,b,gap=0) {
  validRect(a);validRect(b);
  return a.x+a.width+gap>b.x+1e-7 && b.x+b.width+gap>a.x+1e-7 && a.y+a.height+gap>b.y+1e-7 && b.y+b.height+gap>a.y+1e-7;
}
export function contains(outer,inner,padding=0) {
  validRect(outer);validRect(inner);
  return inner.x>=outer.x+padding-1e-7 && inner.y>=outer.y+padding-1e-7 && inner.x+inner.width<=outer.x+outer.width-padding+1e-7 && inner.y+inner.height<=outer.y+outer.height-padding+1e-7;
}
export function moveShape(shape,dx,dy) {
  const move=r=>({...r,x:r.x+dx,y:r.y+dy});
  return {...shape,parts:shape.parts.map(move),bounds:move(shape.bounds)};
}
export function shapeIntersects(a,b,gap=0) {
  return intersects(a.bounds,b.bounds,gap) && a.parts.some(x=>b.parts.some(y=>intersects(x,y,gap)));
}
export function lineHitsRect(line,rect,gap=0) {
  const r=expand(rect,(line.width||0)/2+gap),a=line.a,b=line.b;
  if(![a.x,a.y,b.x,b.y].every(Number.isFinite)) throw new Error('Invalid line');
  let lo=0,hi=1;const dx=b.x-a.x,dy=b.y-a.y;
  for(const [p,q] of [[-dx,a.x-r.x],[dx,r.x+r.width-a.x],[-dy,a.y-r.y],[dy,r.y+r.height-a.y]]) {
    if(Math.abs(p)<1e-12) {if(q<0)return false;continue;}
    const t=q/p;if(p<0)lo=Math.max(lo,t);else hi=Math.min(hi,t);
    if(lo>hi)return false;
  }
  return true;
}

/** Exact centerline portions outside a CSS-space disk, preserving stroke width.
 * This does not exempt a whole segment merely because it crosses the anchor. */
export function lineOutsideCircle(line,anchor,radius) {
  const [cx,cy]=anchor;
  if(![cx,cy,radius,line.a.x,line.a.y,line.b.x,line.b.y].every(Number.isFinite)||radius<0)throw new Error('Invalid anchor circle');
  const dx=line.b.x-line.a.x,dy=line.b.y-line.a.y,fx=line.a.x-cx,fy=line.a.y-cy;
  const aa=dx*dx+dy*dy,bb=2*(fx*dx+fy*dy),cc=fx*fx+fy*fy-radius*radius;
  if(!aa)return cc<0?[]:[line];
  const discriminant=bb*bb-4*aa*cc;
  if(discriminant<=0)return [line]; // Tangency removes no interval.
  const root=Math.sqrt(discriminant),enter=Math.max(0,(-bb-root)/(2*aa)),leave=Math.min(1,(-bb+root)/(2*aa));
  if(enter>=leave)return [line];
  const at=t=>({x:line.a.x+dx*t,y:line.a.y+dy*t}),parts=[];
  if(enter>0)parts.push({...line,b:at(enter)});
  if(leave<1)parts.push({...line,a:at(leave)});
  return parts;
}

/** Distance from a geographic anchor to the nearest edge of a label footprint. */
export function anchorDistance(rect,anchor) {
  if(!rect||!anchor)return Infinity;
  return Math.hypot(Math.max(rect.x-anchor[0],0,anchor[0]-rect.x-rect.width),Math.max(rect.y-anchor[1],0,anchor[1]-rect.y-rect.height));
}

/** Project immutable world-space polygon rings into the solver's CSS frame. */
export function projectAreaPolygons(polygons,m) {
  return polygons?.map(rings=>rings.map(ring=>ring.map(([x,y])=>[m.a*x+m.c*y+m.e,m.b*x+m.d*y+m.f])));
}
function pointInRing([x,y],ring) {
  let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++) {
    const [xi,yi]=ring[i],[xj,yj]=ring[j];
    if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)inside=!inside;
  }
  return inside;
}
/** Every measured rectangle must fit one polygon, excluding every hole. Testing
 * corners alone misses concave boundary incursions and holes enclosed by text. */
export function shapeInsidePolygons(shape,polygons) {
  return shape.parts.every(r=>polygons.some(rings=>{
    if(!rings.length)return false;
    const corners=[[r.x,r.y],[r.x+r.width,r.y],[r.x+r.width,r.y+r.height],[r.x,r.y+r.height]];
    if(!corners.every(p=>pointInRing(p,rings[0])&&!rings.slice(1).some(h=>pointInRing(p,h))))return false;
    return !rings.some(ring=>ring.some(([x,y],i)=>{
      const [bx,by]=ring[(i+1)%ring.length];
      return lineHitsRect({a:{x,y},b:{x:bx,y:by},width:0},r);
    }));
  }));
}
