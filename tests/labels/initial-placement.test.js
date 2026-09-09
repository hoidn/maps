import test from 'node:test';import assert from 'node:assert/strict';
import {solveInitialPlacement} from '../../pipeline/labels/initial-placement.js';
import {solveLayout} from '../../pipeline/labels/place.js';
import {pointCandidates} from '../../pipeline/labels/candidates.js';
import {anchorDistance} from '../../pipeline/labels/geometry.js';
import {createTrailQuery} from '../../pipeline/labels/trail-query.js';
import {SpatialIndex} from '../../pipeline/labels/spatial-index.js';
const box=(x,y,w=28,h=12)=>({bounds:{x,y,width:w,height:h},parts:[{x,y,width:w,height:h}]});
test('serialized initial placement preserves fallback choices, protected trails and complete outcomes',()=>{
 for(const scale of [1,1.35,3]){
 const policy={clearance:2,edgePadding:4,maxPointDisplacement:32,pointPreferredDistance:12,pointDistanceBand:4,exhaustiveDiagnostics:false,repairMaxNeighbors:0};
 const annotations=Array.from({length:14},(_,i)=>{const anchor=[100+i%4*20,100+Math.floor(i/4)*20],metric=box(anchor[0]+7,anchor[1]+4),a={id:'a'+i,kind:'point-label',featureId:'f'+i,priority:100-i,anchor};return {...a,candidates:pointCandidates(a,metric,policy),fallbackData:{annotation:a,metric,variants:[{id:'two-lines',shape:box(anchor[0]+7,anchor[1]+4,20,22),textHTML:'Line<br/>two'}],policy}};});
 const segments=Array.from({length:20},(_,i)=>({id:'trail'+i,a:[50,80+i*7],b:[220,80+i*7],width:1,bounds:{x:50,y:80+i*7,width:170,height:0}}));
 const trail={segments,matrix:{a:scale,b:0,c:0,d:scale,e:0,f:0},inverse:{a:1/scale,b:0,c:0,d:1/scale,e:0,f:0},strokeScale:1/scale,scale,maxWidth:1};
 const index=new SpatialIndex(32);segments.forEach((s,i)=>index.insert(i,s.bounds));
 const expected=solveLayout({annotations:annotations.map(a=>({...a,fallbackCandidates:()=>{const d=a.fallbackData,dense={...policy,densePointCandidates:true,densePointStep:2},all=pointCandidates(a,d.metric,dense).filter(c=>c.id.startsWith('grid-'));for(const v of d.variants)all.push(...pointCandidates(a,v.shape,dense).filter(c=>c.id.startsWith('grid-')).map(c=>({...c,id:v.id+'-'+c.id,textHTML:v.textHTML})));return all.sort((a,b)=>anchorDistance(a.shape.bounds,d.annotation.anchor)-anchorDistance(b.shape.bounds,d.annotation.anchor));}})),policy,viewport:{x:0,y:0,width:500,height:400},queryObstacles:createTrailQuery({...trail,index})});
 assert.deepEqual(solveInitialPlacement(structuredClone({annotations,trail,policy,viewport:{x:0,y:0,width:500,height:400}})),expected);
 }
});
