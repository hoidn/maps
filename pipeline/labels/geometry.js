export function validRect(r) {
  if(!r)throw new Error('Invalid rectangle');
  const {x,y,width,height}=r;
  if(!Number.isFinite(x)||!Number.isFinite(y)||!Number.isFinite(width)||!Number.isFinite(height)||width<0||height<0)throw new Error('Invalid rectangle');
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
  const margin=(line.width||0)/2+gap;validRect(rect);
  // Keep expand()'s operation order, including its floating-point edge rounding,
  // without allocating a rectangle and five arrays for each segment test.
  const x=rect.x-margin,y=rect.y-margin,width=rect.width+2*margin,height=rect.height+2*margin,
    a=line.a,b=line.b,ax=a.x,ay=a.y,bx=b.x,by=b.y;
  if(!Number.isFinite(ax)||!Number.isFinite(ay)||!Number.isFinite(bx)||!Number.isFinite(by))throw new Error('Invalid line');
  // A spatial cell can return segments nowhere near an individual glyph.
  // Reject disjoint endpoint bounds before the exact clipping calculation.
  if(margin>=0&&Number.isFinite(margin)&&(Math.max(ax,bx)<x||Math.min(ax,bx)>x+width||Math.max(ay,by)<y||Math.min(ay,by)>y+height))return false;
  let lo=0,hi=1;const dx=bx-ax,dy=by-ay;
  for(let edge=0;edge<4;edge++){
    let p,q;
    switch(edge){
      case 0:p=-dx;q=ax-x;break;
      case 1:p=dx;q=x+width-ax;break;
      case 2:p=-dy;q=ay-y;break;
      default:p=dy;q=y+height-ay;
    }
    if(Math.abs(p)<1e-12){if(q<0)return false;continue;}
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
export function shapeInsidePolygons(shape,polygons,matrix) {
  if(matrix){
    // General affine cameras retain the original exact CSS-space path.
    if(matrix.b!==0||matrix.c!==0||!matrix.a||!matrix.d||![matrix.a,matrix.d,matrix.e,matrix.f].every(Number.isFinite))return shapeInsidePolygons(shape,projectAreaPolygons(polygons,matrix));
    return indexedAreaContains(shape,polygons,matrix);
  }
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


// Immutable manifest rings retain one camera-independent edge tree. Cached
// nodes never contain projected coordinates, candidates, or previous results.
const areaRingIndices=new WeakMap();
function areaRingIndex(ring){
  let cached=areaRingIndices.get(ring);if(cached)return cached;
  const edges=ring.map(([x,y],i)=>{
    const [bx,by]=ring[(i+1)%ring.length];
    return {x,y,bx,by,left:Math.min(x,bx),right:Math.max(x,bx),top:Math.min(y,by),bottom:Math.max(y,by)};
  });
  const build=edges=>{
    let left=Infinity,right=-Infinity,top=Infinity,bottom=-Infinity;
    for(const e of edges){left=Math.min(left,e.left);right=Math.max(right,e.right);top=Math.min(top,e.top);bottom=Math.max(bottom,e.bottom);}
    const node={left,right,top,bottom};
    if(edges.length<=12){node.edges=edges;return node;}
    const horizontal=right-left>=bottom-top;
    edges.sort(horizontal?(a,b)=>(a.left+a.right)-(b.left+b.right):(a,b)=>(a.top+a.bottom)-(b.top+b.bottom));
    const middle=edges.length>>1;node.first=build(edges.slice(0,middle));node.second=build(edges.slice(middle));return node;
  };
  cached=build(edges);areaRingIndices.set(ring,cached);return cached;
}
function visitAreaEdges(node,q,visit){
  if(node.right<q.left||node.left>q.right||node.bottom<q.top||node.top>q.bottom)return false;
  if(node.edges){for(const e of node.edges)if(e.right>=q.left&&e.left<=q.right&&e.bottom>=q.top&&e.top<=q.bottom&&visit(e))return true;return false;}
  return visitAreaEdges(node.first,q,visit)||visitAreaEdges(node.second,q,visit);
}
function indexedAreaContains(shape,polygons,m){
  // Inversion is only broad-phase selection. Final ray and intersection tests
  // project the selected original endpoints using the same operation order as
  // projectAreaPolygons; boundary touch remains rejected, including hole edges.
  const projected=e=>({x:m.a*e.x+m.c*e.y+m.e,y:m.b*e.x+m.d*e.y+m.f,bx:m.a*e.bx+m.c*e.by+m.e,by:m.b*e.bx+m.d*e.by+m.f});
  const tolerance=(x,y)=>1e-9*(1+Math.abs(x)+Math.abs(y)+Math.abs(m.e/m.a)+Math.abs(m.f/m.d));
  const inside=(x,y,index)=>{
    const wx=(x-m.e)/m.a,wy=(y-m.f)/m.d,t=tolerance(wx,wy),q={left:m.a>0?wx-t:index.left-t,right:m.a>0?index.right+t:wx+t,top:wy-t,bottom:wy+t};
    let value=false;
    visitAreaEdges(index,q,e=>{
      const p=projected(e);
      if((p.y>y)!==(p.by>y)&&x<(p.x-p.bx)*(y-p.by)/(p.y-p.by)+p.bx)value=!value;
      return false;
    });
    return value;
  };
  return shape.parts.every(r=>{
    const x=(r.x-m.e)/m.a,y=(r.y-m.f)/m.d,bx=(r.x+r.width-m.e)/m.a,by=(r.y+r.height-m.f)/m.d;
    if(![x,y,bx,by].every(Number.isFinite))return shapeInsidePolygons({parts:[r]},projectAreaPolygons(polygons,m));
    const t=Math.max(tolerance(x,y),tolerance(bx,by)),q={left:Math.min(x,bx)-t,right:Math.max(x,bx)+t,top:Math.min(y,by)-t,bottom:Math.max(y,by)+t};
    const corners=[[r.x,r.y],[r.x+r.width,r.y],[r.x+r.width,r.y+r.height],[r.x,r.y+r.height]];
    return polygons.some(rings=>{
      if(!rings.length)return false;
      const indices=rings.map(areaRingIndex);
      if(!corners.every(([x,y])=>inside(x,y,indices[0])&&!indices.slice(1).some(index=>inside(x,y,index))))return false;
      return !indices.some(index=>visitAreaEdges(index,q,e=>{const p=projected(e);return lineHitsRect({a:{x:p.x,y:p.y},b:{x:p.bx,y:p.by},width:0},r);}));
    });
  });
}
