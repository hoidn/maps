import test from 'node:test';
import assert from 'node:assert/strict';
import {SpatialIndex} from '../../pipeline/labels/spatial-index.js';
import {intersects} from '../../pipeline/labels/geometry.js';
test('grid never misses an all-pairs collision, including negative and multi-cell boxes',()=>{
 let seed=537;const random=()=>((seed=(seed*1664525+1013904223)>>>0)/2**32);
 const boxes=Array.from({length:300},(_,i)=>({id:String(i),x:random()*1000-200,y:random()*1000-200,width:random()*180,height:random()*180}));
 const grid=new SpatialIndex(48);boxes.forEach(b=>grid.insert(b.id,b));
 for(const b of boxes) {
  const found=new Set(grid.query(b));
  for(const a of boxes) if(intersects(a,b)) assert.ok(found.has(a.id),`${a.id}/${b.id}`);
 }
});
test('numeric cell traversal preserves original membership and stable query order',()=>{
 const grid=new SpatialIndex(16),reference=new Map();
 let seed=371;const random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/2**32);
 const boxes=Array.from({length:400},(_,i)=>({id:i%191,x:random()*500-250,y:random()*500-250,width:random()*40,height:random()*40}));
 for(const b of boxes){grid.insert(b.id,b);for(const k of grid.keys(b)){if(!reference.has(k))reference.set(k,new Set());reference.get(k).add(b.id);}}
 for(const b of [...boxes,{x:-16,y:0,width:16,height:0}]){
  const expected=new Set();for(const k of grid.keys(b))for(const id of reference.get(k)||[])expected.add(id);
  assert.deepEqual(grid.query(b),[...expected]);
 }
 // Insert/query must not construct string cell keys on the hot path.
 grid.keys=()=>{throw Error('allocated string cell keys');};
 grid.insert('new',{x:-16,y:0,width:0,height:0});
 assert(grid.query({x:-16,y:0,width:0,height:0}).includes('new'));
 assert.throws(()=>grid.query({x:NaN,y:0,width:0,height:0}),/Invalid rectangle/);
});
