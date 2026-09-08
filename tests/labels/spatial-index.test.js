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
