// Generated contours use absolute M followed by implicit line-to pairs. Leave
// other SVG syntax to Path2D rather than approximating unsupported commands.
export function contourRuns(d){
  if(!d||!/^M[\d\s.,+eE\-M]+$/.test(d))return null;
  const runs=[];
  for(const part of d.slice(1).split('M')){
    const values=part.trim().split(/[\s,]+/).map(Number);
    if(values.length<4||values.length%2||values.some(n=>!Number.isFinite(n)))return null;
    runs.push(new Float64Array(values));
  }
  return runs;
}
// Overlap one segment so every original join is present in at least one chunk.
// Merge adjacent visible ranges before painting, so overlaps are never stroked twice.
export function contourChunks(points,maxSegments=64){
  const chunks=[];
  for(let start=0;start<points.length-2;start+=(maxSegments-1)*2){
    const p=points.subarray(start,Math.min(points.length,start+(maxSegments+1)*2));
    let x=Infinity,y=Infinity,right=-Infinity,bottom=-Infinity;
    for(let i=0;i<p.length;i+=2){x=Math.min(x,p[i]);y=Math.min(y,p[i+1]);right=Math.max(right,p[i]);bottom=Math.max(bottom,p[i+1]);}
    chunks.push({start,end:start+p.length,points:p,bounds:{x,y,width:right-x,height:bottom-y}});
  }
  return chunks;
}
