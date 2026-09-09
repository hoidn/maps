import {pointCandidates} from './candidates.js';
import {anchorDistance} from './geometry.js';
/** Serializable inputs let the initial worker enumerate the exact same fallbacks. */
export function pointFallback({annotation,metric,variants,policy}){
 const dense={...policy,densePointCandidates:true,densePointStep:2};
 const all=pointCandidates(annotation,metric,dense).filter(c=>c.id.startsWith('grid-'));
 for(const v of variants||[])all.push(...pointCandidates(annotation,v.shape,dense).filter(c=>c.id.startsWith('grid-')).map(c=>({...c,id:v.id+'-'+c.id,textHTML:v.textHTML})));
 return all.sort((a,b)=>anchorDistance(a.shape.bounds,annotation.anchor)-anchorDistance(b.shape.bounds,annotation.anchor));
}
