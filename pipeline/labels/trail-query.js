import {contains,validRect} from './geometry.js';
import {SpatialIndex} from './spatial-index.js';
const project=(m,p)=>({x:m.a*p[0]+m.c*p[1]+m.e,y:m.b*p[0]+m.d*p[1]+m.f});
const touches=(a,b)=>a.x<=b.x+b.width&&a.x+a.width>=b.x&&a.y<=b.y+b.height&&a.y+a.height>=b.y;
const strokeBounds=({a,b,width})=>({x:Math.min(a.x,b.x)-width/2,y:Math.min(a.y,b.y)-width/2,width:Math.abs(a.x-b.x)+width,height:Math.abs(a.y-b.y)+width});

/** One immutable camera snapshot. Shared segments are projected at most once.
 * forRegion caches a conservative neighborhood, then searches a small CSS-space
 * index. Out-of-neighborhood requests safely use the complete source index. */
export function createTrailQuery({segments,index,matrix,inverse,strokeScale,scale,maxWidth}) {
  const projected=new Map();
  function query(rect){
    validRect(rect);
    const points=[[rect.x,rect.y],[rect.x+rect.width,rect.y],[rect.x,rect.y+rect.height],[rect.x+rect.width,rect.y+rect.height]].map(p=>project(inverse,p));
    const radius=maxWidth*strokeScale/2,x=Math.min(...points.map(p=>p.x))-radius,y=Math.min(...points.map(p=>p.y))-radius;
    const r={x,y,width:Math.max(...points.map(p=>p.x))+radius-x,height:Math.max(...points.map(p=>p.y))+radius-y};
    const result=[];
    for(const i of index.query(r)){
      const segment=segments[i];if(!touches(segment.bounds,r))continue;
      let obstacle=projected.get(i);
      if(!obstacle){obstacle={id:segment.id,kind:'trail',line:{a:project(matrix,segment.a),b:project(matrix,segment.b),width:segment.width*strokeScale*scale}};projected.set(i,obstacle);}
      result.push(obstacle);
    }
    return result;
  }
  query.forRegion=region=>{
    validRect(region);
    const nearby=query(region),local=new SpatialIndex(16),bounds=nearby.map(o=>strokeBounds(o.line));
    nearby.forEach((o,i)=>local.insert(i,bounds[i]));
    // Nearby 2px candidate steps repeatedly visit the same immutable grid cells.
    // Cache their broad-phase membership, then retain exact per-rectangle filtering.
    const cells=new Map();
    return rect=>{
      if(!contains(region,rect))return query(rect);
      const key=[Math.floor(rect.x/local.size),Math.floor(rect.y/local.size),Math.floor((rect.x+rect.width)/local.size),Math.floor((rect.y+rect.height)/local.size)].join(',');
      let members=cells.get(key);if(!members){members=local.query(rect);cells.set(key,members);}
      return members.filter(i=>touches(bounds[i],rect)).map(i=>nearby[i]);
    };
  };
  return query;
}
