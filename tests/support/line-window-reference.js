// Frozen pre-index exhaustive scan, retained as an independent output oracle.
export function referenceLineWindows(points,textLength,policy={}) {
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
    const sideCandidates=[{dx:0,dy:0}],lineOffset=Math.max(0,policy.lineOffset??8);
    if(lineOffset){const radians=angle*Math.PI/180;for(const side of [1,-1])sideCandidates.push({dx:-Math.sin(radians)*lineOffset*side,dy:Math.cos(radians)*lineOffset*side});}
    result.push({id:`line-${start.toFixed(4)}`,start,end,offset:start,anchor:at((start+end)/2),angle,reverse,curvature,sideCandidates});
  }
  return result.sort((a,b)=>Math.abs(a.start-preferred)-Math.abs(b.start-preferred)||a.curvature-b.curvature||a.start-b.start).slice(0,limit);
}
