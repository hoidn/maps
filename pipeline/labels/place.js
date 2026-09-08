import {contains,expand,shapeIntersects,lineHitsRect,validRect} from './geometry.js';
import {SpatialIndex} from './spatial-index.js';
const stable=(a,b)=>a<b?-1:a>b?1:0;
const validShape=s=>{try{return Array.isArray(s?.parts)&&s.parts.length>0&&s.parts.every(r=>contains(validRect(s.bounds),validRect(r)));}catch{return false;}};
const center=s=>[s.bounds.x+s.bounds.width/2,s.bounds.y+s.bounds.height/2];

/** Pure CSS-pixel solver. Higher priority sorts first; required labels precede optional ones.
 * Every accepted candidate is checked, including during bounded transactional repair.
 * Explicit allowedObstacleIds are the only exemptions for anchor/line relationships. */
export function solveLayout({annotations,obstacles=[],viewport,previous,policy={}}) {
  const clearance=policy.clearance??2,padding=policy.edgePadding??4;
  const frame={x:viewport.x??0,y:viewport.y??0,width:viewport.width,height:viewport.height};validRect(frame);
  const ordered=[...annotations].sort((a,b)=>Number(!!b.required)-Number(!!a.required)||(b.priority??0)-(a.priority??0)||stable(a.id,b.id));
  const byId=new Map(ordered.map(a=>[a.id,a]));if(byId.size!==ordered.length)throw new Error('Duplicate annotation ID');
  const old=new Map((Array.isArray(previous)?previous:previous?.placements??[]).map(p=>[p.id,p.candidateId]));
  const obstacleIndex=new SpatialIndex(),obstacleMap=new Map();
  obstacles.forEach((o,i)=>{const key=String(i);obstacleMap.set(key,o);const b=o.shape?.bounds??{x:Math.min(o.line.a.x,o.line.b.x)-(o.line.width||0)/2,y:Math.min(o.line.a.y,o.line.b.y)-(o.line.width||0)/2,width:Math.abs(o.line.a.x-o.line.b.x)+(o.line.width||0),height:Math.abs(o.line.a.y-o.line.b.y)+(o.line.width||0)};obstacleIndex.insert(key,b);});
  const accepted=new Map();let placedIndex=new SpatialIndex();
  const indexPlacement=(id,c)=>placedIndex.insert(id,c.shape.bounds);
  const candidates=a=>{const cs=[...(a.candidates??[])];const ix=cs.findIndex(c=>c.id===old.get(a.id));if(ix>0)cs.unshift(...cs.splice(ix,1));return cs;};
  function blockers(a,c) {
    const hard=[],labels=[],repeat=[];
    if(!validShape(c.shape)) return {hard:['invalid-geometry'],labels,repeat};
    if(!contains(frame,c.shape.bounds,padding))hard.push('frame');
    const allowed=new Set(a.allowedObstacleIds??[]);
    for(const key of obstacleIndex.query(expand(c.shape.bounds,clearance))) {
      const o=obstacleMap.get(key);if(allowed.has(o.id))continue;
      if(o.line?c.shape.parts.some(r=>lineHitsRect(o.line,r,clearance)):shapeIntersects(c.shape,o.shape,clearance))hard.push(o.id);
    }
    for(const id of placedIndex.query(expand(c.shape.bounds,clearance))){if(id===a.id)continue;const other=accepted.get(id);if(other&&shapeIntersects(c.shape,other.shape,clearance))labels.push(id);}
    // Repeat distance is a feature-level constraint, not a rectangle approximation.
    if(a.featureId)for(const [id,other] of accepted){const b=byId.get(id),distance=Math.max(a.repeatDistance??0,b.repeatDistance??0);if(id===a.id||b.featureId!==a.featureId||distance<=0)continue;const p=center(c.shape),q=center(other.shape);if(Math.hypot(p[0]-q[0],p[1]-q[1])<distance)repeat.push(id);}
    return {hard:[...new Set(hard)].sort(stable),labels:[...new Set(labels)].sort(stable),repeat:[...new Set(repeat)].sort(stable)};
  }
  function accept(a,c){accepted.set(a.id,c);indexPlacement(a.id,c);}
  function rebuild(){placedIndex=new SpatialIndex();for(const [id,c] of accepted)indexPlacement(id,c);}
  function repair(a,c,blocking){
    if(blocking.hard.length||blocking.repeat.length||blocking.labels.length>(policy.repairMaxNeighbors??2))return false;
    const snapshot=new Map(accepted),neighbors=blocking.labels.map(id=>byId.get(id));
    for(const n of neighbors)accepted.delete(n.id);
    accept(a,c);let attempts=0;const budget=policy.repairBudget??64;
    function visit(i){if(i===neighbors.length)return true;const n=neighbors[i];for(const alt of candidates(n)){if(++attempts>budget)return false;const b=blockers(n,alt);if(b.hard.length||b.labels.length||b.repeat.length)continue;accept(n,alt);if(visit(i+1))return true;accepted.delete(n.id);}return false;}
    if(visit(0)){rebuild();return true;}
    accepted.clear();for(const [id,v] of snapshot)accepted.set(id,v);rebuild();return false;
  }
  function place(a){if(a.eligibleReason||accepted.has(a.id))return;for(const c of candidates(a)){const b=blockers(a,c);if(!b.hard.length&&!b.labels.length&&!b.repeat.length){accept(a,c);break;}}
    if(!accepted.has(a.id))for(const c of candidates(a)){const b=blockers(a,c);if(b.labels.length&&repair(a,c,b))break;}
  }
  // Reserve just one successfully placed representative of each required group.
  for(const a of ordered.filter(a=>a.required))place(a);
  for(const group of [...new Set(policy.requiredGroups??[])].sort(stable)){
    const members=ordered.filter(a=>a.requiredGroup===group);
    if(members.some(a=>accepted.has(a.id)))continue;
    for(const a of members){place(a);if(accepted.has(a.id))break;}
  }
  for(const a of ordered)place(a);
  const outcomes=ordered.map(a=>{
    if(accepted.has(a.id))return {id:a.id,reason:'placed',blockerIds:[]};
    if(a.eligibleReason)return {id:a.id,reason:a.eligibleReason,blockerIds:[]};
    const failures=candidates(a).map(c=>blockers(a,c)),ids=[...new Set(failures.flatMap(b=>[...b.hard,...b.labels,...b.repeat]))].sort(stable);
    const reason=failures.length&&failures.every(b=>b.hard.includes('invalid-geometry'))?'invalid-geometry':a.required?'no-valid-candidate':failures.some(b=>b.repeat.length&&!b.hard.length&&!b.labels.length)?'repeat-spacing':failures.some(b=>b.labels.length&&!b.hard.length)?'collision':'no-valid-candidate';
    return {id:a.id,reason,blockerIds:ids};
  });
  const missingRequired=ordered.filter(a=>a.required&&!accepted.has(a.id)).map(a=>a.id);
  for(const group of [...new Set(policy.requiredGroups??[])].sort(stable))if(!ordered.some(a=>a.requiredGroup===group&&accepted.has(a.id)))missingRequired.push('route:'+group);
  return {placements:ordered.filter(a=>accepted.has(a.id)).map(a=>{const c=accepted.get(a.id);const {shape,...rest}=c;return {...rest,id:a.id,candidateId:c.id,footprint:shape,dx:c.dx??0,dy:c.dy??0};}),outcomes,missingRequired};
}
