import {solveLayout,solveLayoutAsync} from './place.js';
import {pointFallback} from './point-fallback.js';
import {SpatialIndex} from './spatial-index.js';
import {createTrailQuery} from './trail-query.js';
/** All inputs are immutable plain data; this module has no DOM dependencies. */
// Source-space indexes outlive camera snapshots, but never a replaced dataset.
const trailIndexes=new WeakMap();
function placementArgs({annotations,trail,...args}){
 let queryObstacles;
 if(trail){let index=trailIndexes.get(trail.segments);if(!index){index=new SpatialIndex(32);trail.segments.forEach((s,i)=>index.insert(i,s.bounds));trailIndexes.set(trail.segments,index);}queryObstacles=createTrailQuery({...trail,index});}
 return {...args,queryObstacles,annotations:annotations.map(a=>({...a,fallbackCandidates:a.fallbackData?()=>pointFallback(a.fallbackData):undefined}))};
}

export const solveInitialPlacement=payload=>solveLayout(placementArgs(payload));
export const solveInitialPlacementAsync=(payload,options)=>solveLayoutAsync(placementArgs(payload),options);
