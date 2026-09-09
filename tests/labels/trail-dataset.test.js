import test from 'node:test';
import assert from 'node:assert/strict';
import {packTrailDataset,unpackTrailDataset} from '../../pipeline/labels/trail-dataset.js';
import {solveInitialPlacement} from '../../pipeline/labels/initial-placement.js';
import {SpatialIndex} from '../../pipeline/labels/spatial-index.js';

test('worker sends immutable segments once while sending every camera snapshot',()=>{
 const segments=[{id:'trail',a:[0,0],b:[10,10]}],first={trail:{segments,matrix:{e:0},metersPerPixel:10}},next={trail:{segments,matrix:{e:5},metersPerPixel:3}};
 const a=packTrailDataset(first),b=packTrailDataset(next,a.state);
 assert.equal(a.payload.trail.segments,segments);assert.equal(Object.hasOwn(b.payload.trail,'segments'),false);
 const c=unpackTrailDataset(a.payload),d=unpackTrailDataset(b.payload,c.state);
 assert.equal(d.payload.trail.segments,segments);assert.equal(d.payload.trail.matrix.e,5);assert.equal(d.payload.trail.metersPerPixel,3);
 assert.equal(next.trail.segments,segments);assert.equal(Object.hasOwn(first.trail,'datasetVersion'),false);
});
test('replacement and worker restart resend geometry; unknown references fail closed',()=>{
 const first=packTrailDataset({trail:{segments:[]}}),second=packTrailDataset({trail:{segments:[]}},first.state);
 assert.ok(Object.hasOwn(second.payload.trail,'segments'));assert.notEqual(first.state.version,second.state.version);
 const repeated=packTrailDataset({trail:{segments:second.state.segments}},second.state);
 assert.throws(()=>unpackTrailDataset(repeated.payload),/Missing trail dataset/);
 const restarted=packTrailDataset({trail:{segments:second.state.segments}});
 assert.equal(unpackTrailDataset(restarted.payload).payload.trail.segments,second.state.segments);
 assert.throws(()=>unpackTrailDataset({trail:{datasetVersion:NaN}}),/Invalid trail dataset/);
});
test('source index is reused but a new camera and replacement geometry get exact fresh queries',()=>{
 const segments=[{id:'protected',a:[0,20],b:[100,20],width:2,bounds:{x:0,y:20,width:100,height:0}}];
 const metric={bounds:{x:40,y:19,width:20,height:4},parts:[{x:40,y:19,width:20,height:4}]};
 const args={annotations:[{id:'text',candidates:[{id:'center',shape:metric}]}],viewport:{width:200,height:200},policy:{repairMaxNeighbors:0},trail:{segments,matrix:{a:1,b:0,c:0,d:1,e:0,f:0},inverse:{a:1,b:0,c:0,d:1,e:0,f:0},strokeScale:1,scale:1,maxWidth:2,metersPerPixel:1}};
 let inserts=0;const insert=SpatialIndex.prototype.insert;SpatialIndex.prototype.insert=function(...args){if(this.size===32)inserts++;return insert.apply(this,args);};
 try{
  assert.equal(solveInitialPlacement(args).placements.length,0);assert.equal(inserts,1);
  const moved={...args,trail:{...args.trail,matrix:{...args.trail.matrix,f:80},inverse:{...args.trail.inverse,f:-80}}};
  assert.equal(solveInitialPlacement(moved).placements.length,1);assert.equal(inserts,1);
  assert.equal(solveInitialPlacement({...args,trail:{...args.trail,segments:[...segments]}}).placements.length,0);assert.equal(inserts,2);
 }finally{SpatialIndex.prototype.insert=insert;}
});
