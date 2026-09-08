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
