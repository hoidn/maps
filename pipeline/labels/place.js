import {contains,expand,shapeIntersects,lineHitsRect,lineOutsideCircle,validRect,anchorDistance} from './geometry.js';
import {SpatialIndex} from './spatial-index.js';
const stable=(a,b)=>a<b?-1:a>b?1:0;
const validShape=s=>{try{return Array.isArray(s?.parts)&&s.parts.length>0&&s.parts.every(r=>contains(validRect(s.bounds),validRect(r)));}catch{return false;}};
const center=s=>[s.bounds.x+s.bounds.width/2,s.bounds.y+s.bounds.height/2];

/** Pure CSS-pixel solver. Higher priority sorts first; required labels precede optional ones.
 * Every accepted candidate is checked, including during bounded transactional repair.
 * Optional queryObstacles(expandedBounds) is a deterministic provider of additional
 * CSS-space obstacles. Hard checks are cached within one solve; inputs and provider
 * results must remain immutable/deterministic for that solve. The provider must conservatively return every nearby painted segment.
 * Opt-in exhaustiveDiagnostics:false with repairMaxNeighbors:0 reports blockers
 * observed at placement time. Accepted placements only grow in that mode, so those
 * blocker IDs remain valid but can omit later blockers. All other modes report final blockers.
 * Optional fallbackCandidates() iterables are evaluated only after ordinary candidates fail.
 * A true-anchor symbol footprint may cover a trail; displaced candidates retain strict checks.
 * A symbol with anchorTrailRadius=6 permits only trail centerline portions inside
 * its true-anchor disk. Explicit allowedObstacleIds never exempt protected trails. */
export function solveLayout({annotations,obstacles=[],viewport,previous,policy={},queryObstacles}) {
  const placementDiagnostics=policy.exhaustiveDiagnostics===false&&policy.repairMaxNeighbors===0,attemptFailures=new Map();
  const clearance=policy.clearance??2,padding=policy.edgePadding??4;
  const frame={x:viewport.x??0,y:viewport.y??0,width:viewport.width,height:viewport.height};validRect(frame);
  const ordered=annotations.map(a=>({...a,candidates:[...(a.candidates??[])]})).sort((a,b)=>Number(!!b.required)-Number(!!a.required)||(b.priority??0)-(a.priority??0)||stable(a.id,b.id));
  const byId=new Map(ordered.map(a=>[a.id,a]));if(byId.size!==ordered.length)throw new Error('Duplicate annotation ID');
  const featureGroups=new Map(),repeatDistances=new Map();
  for(const a of ordered){const distance=a.repeatDistance??0;repeatDistances.set(a.id,distance);if(!a.featureId)continue;let group=featureGroups.get(a.featureId);if(!group){group={ids:[],maximum:0};featureGroups.set(a.featureId,group);}group.ids.push(a.id);group.maximum=Math.max(group.maximum,distance);}
  const old=new Map((Array.isArray(previous)?previous:previous?.placements??[]).map(p=>[p.id,p.candidateId]));
  const obstacleIndex=new SpatialIndex(),obstacleMap=new Map();
  obstacles.forEach((o,i)=>{const key=String(i);obstacleMap.set(key,o);const b=o.shape?.bounds??{x:Math.min(o.line.a.x,o.line.b.x)-(o.line.width||0)/2,y:Math.min(o.line.a.y,o.line.b.y)-(o.line.width||0)/2,width:Math.abs(o.line.a.x-o.line.b.x)+(o.line.width||0),height:Math.abs(o.line.a.y-o.line.b.y)+(o.line.width||0)};obstacleIndex.insert(key,b);});
  const accepted=new Map(),hardCache=new Map(),localQueries=new Map();let placedIndex=new SpatialIndex();
  const indexPlacement=(id,c)=>placedIndex.insert(id,c.shape.bounds);
  const proximity=(a,c)=>a.kind==='point-label'&&a.anchor?Math.floor((anchorDistance(c.shape?.bounds,a.anchor)+1e-6)/(policy.pointDistanceBand??4)):0;
  const candidates=a=>{const cs=[...(a.candidates??[])];const ix=cs.findIndex(c=>c.id===old.get(a.id));if(ix>0)cs.unshift(...cs.splice(ix,1));return cs.sort((c,d)=>proximity(a,c)-proximity(a,d));};
  function nearbyTrails(a,rect){
    if(!queryObstacles)return [];
    if(!queryObstacles.forRegion||a.kind!=='point-label')return queryObstacles(rect);
    if(!localQueries.has(a.id)){
      const boxes=a.candidates.filter(c=>validShape(c.shape)).map(c=>c.shape.bounds);
      if(!boxes.length)return queryObstacles(rect);
      const x=Math.min(...boxes.map(r=>r.x)),y=Math.min(...boxes.map(r=>r.y));
      const region=expand({x,y,width:Math.max(...boxes.map(r=>r.x+r.width))-x,height:Math.max(...boxes.map(r=>r.y+r.height))-y},clearance+(a.fallbackCandidates?(policy.maxPointDisplacement??32):0));
      localQueries.set(a.id,queryObstacles.forRegion(region));
    }
    return localQueries.get(a.id)(rect);
  }
  function blockers(a,c) {
    const labels=[],repeat=[];
    let cache=hardCache.get(a.id);if(!cache){cache=new Map();hardCache.set(a.id,cache);}
    let hard=cache.get(c);
    if(!hard){hard=[];
    if(!validShape(c.shape)) return {hard:['invalid-geometry'],labels,repeat};
    if(!contains(frame,c.shape.bounds,padding))hard.push('frame');
    if(placementDiagnostics&&hard.length){cache.set(c,hard);return {hard,labels,repeat};}
    const allowed=new Set(a.allowedObstacleIds??[]);
    const query=expand(c.shape.bounds,clearance);
    const nearby=obstacleIndex.query(query).map(key=>obstacleMap.get(key));
    if(queryObstacles)nearby.push(...nearbyTrails(a,query));
    for(const o of nearby) {
      if(allowed.has(o.id)&&o.kind!=='trail')continue;
      // A geographic marker is painted over the trail at its true location.
      // This permission is confined to its footprint and cannot move with a facility.
      if(o.kind==='trail'&&a.kind==='symbol'&&a.anchorTrailFootprint&&contains(c.shape.bounds,{x:a.anchor[0],y:a.anchor[1],width:0,height:0}))continue;
      const lines=o.line&&(o.kind==='trail'&&a.kind==='symbol'&&a.anchorTrailRadius===6?lineOutsideCircle(o.line,a.anchor,6):[o.line]);
      if(lines?lines.some(line=>c.shape.parts.some(r=>lineHitsRect(line,r,clearance))):shapeIntersects(c.shape,o.shape,clearance))hard.push(o.id);
      if(placementDiagnostics&&hard.length)break;
    }
    cache.set(c,hard);
    }
    if(placementDiagnostics&&hard.length)return {hard,labels,repeat};
    for(const id of placedIndex.query(expand(c.shape.bounds,clearance))){if(id===a.id)continue;const other=accepted.get(id);if(other&&shapeIntersects(c.shape,other.shape,clearance))labels.push(id);if(placementDiagnostics&&labels.length)break;}
    if(placementDiagnostics&&labels.length)return {hard,labels,repeat};
    // Repeat distance is a feature-level constraint, not a rectangle approximation.
    const group=featureGroups.get(a.featureId);
    if(group?.maximum>0)for(const id of group.ids){if(id===a.id)continue;const other=accepted.get(id);if(!other)continue;const distance=Math.max(repeatDistances.get(a.id),repeatDistances.get(id));if(distance<=0)continue;const p=center(c.shape),q=center(other.shape);if(Math.hypot(p[0]-q[0],p[1]-q[1])<distance)repeat.push(id);}
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
  function place(a){if(a.eligibleReason||accepted.has(a.id))return;const recorded=[];if(placementDiagnostics)attemptFailures.set(a.id,recorded);for(const c of candidates(a)){const b=blockers(a,c);if(placementDiagnostics)recorded.push(b);if(!b.hard.length&&!b.labels.length&&!b.repeat.length){accept(a,c);break;}}
    if(a.fallbackCandidates&&(!accepted.has(a.id)||a.kind==='point-label'&&a.anchor&&anchorDistance(accepted.get(a.id).shape.bounds,a.anchor)>(policy.pointPreferredDistance??12))){
      const extra=a.fallbackCandidates();a.fallbackCandidates=null;
      for(const c of extra){a.candidates.push(c);const current=accepted.get(a.id);if(current&&proximity(a,c)>=proximity(a,current))continue;
        const b=blockers(a,c);if(placementDiagnostics)recorded.push(b);if(!b.hard.length&&!b.labels.length&&!b.repeat.length){accept(a,c);if(a.kind!=='point-label'||anchorDistance(c.shape.bounds,a.anchor)<=(policy.pointPreferredDistance??12))break;}}
    }
    if(!accepted.has(a.id)&&(policy.repairMaxNeighbors??2)>0)for(const c of candidates(a)){const b=blockers(a,c);if(b.labels.length&&repair(a,c,b))break;}
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
    const failures=placementDiagnostics?attemptFailures.get(a.id)??[]:candidates(a).map(c=>blockers(a,c)),ids=[...new Set(failures.flatMap(b=>[...b.hard,...b.labels,...b.repeat]))].sort(stable);
    const reason=failures.length&&failures.every(b=>b.hard.includes('invalid-geometry'))?'invalid-geometry':a.required?'no-valid-candidate':failures.some(b=>b.repeat.length&&!b.hard.length&&!b.labels.length)?'repeat-spacing':failures.some(b=>b.labels.length&&!b.hard.length)?'collision':'no-valid-candidate';
    return {id:a.id,reason,blockerIds:ids};
  });
  const missingRequired=ordered.filter(a=>a.required&&!accepted.has(a.id)).map(a=>a.id);
  for(const group of [...new Set(policy.requiredGroups??[])].sort(stable))if(!ordered.some(a=>a.requiredGroup===group&&accepted.has(a.id)))missingRequired.push('route:'+group);
  return {diagnostics:placementDiagnostics?'placement-time':'final',placements:ordered.filter(a=>accepted.has(a.id)).map(a=>{const c=accepted.get(a.id);const {shape,...rest}=c;return {...rest,id:a.id,candidateId:c.id,footprint:shape,dx:c.dx??0,dy:c.dy??0};}),outcomes,missingRequired};
}
