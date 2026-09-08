import {moveShape} from './geometry.js';
const shifted=(metric,id,x,y,extra={})=>{const dx=x-metric.bounds.x,dy=y-metric.bounds.y;return {id,shape:moveShape(metric,dx,dy),dx,dy,...extra};};
/** metric is the existing rendered CSS footprint. dx/dy translate its wrapper;
 * SVG adapters divide these values by current screen scale. Geographic anchor never moves.
 * Approved text variants are measured separately by the caller. */
export function pointCandidates(annotation,metric,policy={}) {
  const preferred=shifted(metric,'preferred',metric.bounds.x,metric.bounds.y);
  if(annotation.kind==='symbol'||!annotation.anchor)return [preferred];
  const [ax,ay]=annotation.anchor,{width:w,height:h}=metric.bounds;
  const gap=policy.anchorGap??6,extra=Math.max(0,Math.min(32/Math.SQRT2,policy.pointExtraOffset??16));
  const result=[preferred];
  for(const distance of [gap,gap+extra])for(const [name,sx,sy] of [['ne',1,-1],['e',1,0],['se',1,1],['s',0,1],['sw',-1,1],['w',-1,0],['nw',-1,-1],['n',0,-1]]) {
    const x=ax+(sx===1?distance:sx===-1?-distance-w:-w/2),y=ay+(sy===1?distance:sy===-1?-distance-h:-h/2);
    result.push(shifted(metric,name+(distance===gap?'':'-far'),x,y));
  }
  return result;
}

/** Conservative translations of an already measured region name. No invented region
 * boundary or rotation: rotated variants require fresh measurement by the adapter. */
export function regionCandidates(annotation,metric,policy={}) {
  const radius=Math.max(0,Math.min(annotation.maxDisplacement??24,policy.regionMaxDisplacement??24));
  const result=[shifted(metric,'preferred',metric.bounds.x,metric.bounds.y)];
  if(!radius)return result;
  for(const fraction of [.5,1])for(let i=0;i<8;i++){const angle=i*Math.PI/4;result.push(shifted(metric,`region-${fraction}-${i}`,metric.bounds.x+radius*fraction*Math.cos(angle),metric.bounds.y+radius*fraction*Math.sin(angle)));}
  return result;
}

/** Enumerate windows on a CSS-space polyline [[x,y], ...]. textLength and padding
 * are CSS pixels. Return {id,start,end,offset,anchor,angle,reverse,curvature}; start/end
 * are arc distances on the original path, offset aliases start. reverse means the
 * adapter must reverse path direction (not merely rotate text) to read upright.
 * These are candidate windows, not simultaneous repeats; solveLayout enforces the
 * annotation's repeatDistance across accepted labels. Curved footprints must be
 * independently measured after applying each window before entering solveLayout. */
export function lineWindows(points,textLength,policy={}) {
  if(!Number.isFinite(textLength)||textLength<=0)throw new Error('Invalid text length');
  const segments=[];let total=0;
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i];if(![...a,...b].every(Number.isFinite))throw new Error('Invalid path point');
    const length=Math.hypot(b[0]-a[0],b[1]-a[1]);if(!length)continue;
    segments.push({a,b,length,start:total,end:total+length,angle:Math.atan2(b[1]-a[1],b[0]-a[0])*180/Math.PI});total+=length;
  }
  const padding=Math.max(0,policy.linePadding??6),last=total-padding-textLength;
  if(last<padding)return [];
  const limit=Math.max(1,Math.floor(policy.maxLineCandidates??24));
  const step=Math.max(1,policy.lineSampleStep??Math.max(12,textLength/2),(last-padding)/256);
  const preferred=Math.max(padding,Math.min(last,policy.preferredOffset??(total-textLength)/2));
  const starts=new Set([preferred,padding,last]);for(let start=padding;start<=last;start+=step)starts.add(start);
  const at=distance=>{const s=segments.find(s=>s.end>=distance)??segments.at(-1),t=(distance-s.start)/s.length;return [s.a[0]+(s.b[0]-s.a[0])*t,s.a[1]+(s.b[1]-s.a[1])*t];};
  const delta=(a,b)=>Math.abs(((a-b+540)%360)-180);
  const result=[];
  for(const start of starts){const end=start+textLength,covered=segments.filter(s=>s.end>start+1e-7&&s.start<end-1e-7);let curvature=0;for(let i=1;i<covered.length;i++)curvature+=delta(covered[i].angle,covered[i-1].angle);
    if(curvature>(policy.maxTurnDegrees??45))continue;
    const a=at(start),b=at(end);let angle=Math.atan2(b[1]-a[1],b[0]-a[0])*180/Math.PI;const reverse=angle>90||angle< -90;if(reverse)angle+=angle>90?-180:180;
    result.push({id:`line-${start.toFixed(4)}`,start,end,offset:start,anchor:at((start+end)/2),angle,reverse,curvature});
  }
  return result.sort((a,b)=>Math.abs(a.start-preferred)-Math.abs(b.start-preferred)||a.curvature-b.curvature||a.start-b.start).slice(0,limit);
}
