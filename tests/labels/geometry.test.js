import test from 'node:test';
import assert from 'node:assert/strict';
import {intersects,contains,moveShape,lineHitsRect} from '../../pipeline/labels/geometry.js';
const box=(x,y,w=10,h=10)=>({x,y,width:w,height:h});
test('clearance is enforced at boundaries and translated footprints preserve size',()=>{
 assert.equal(intersects(box(0,0),box(12,0),2),false);
 assert.equal(intersects(box(0,0),box(11.9,0),2),true);
 assert.deepEqual(moveShape({parts:[box(0,0)],bounds:box(0,0)},4,-3).bounds,box(4,-3));
 assert.equal(contains(box(0,0,20,20),box(3,3),4),false);
 assert.equal(contains(box(0,0,20,20),box(4,4),4),true);
});
test('line intersection uses visible stroke and rejects invalid coordinates',()=>{
 assert.equal(lineHitsRect({a:{x:-10,y:5},b:{x:20,y:5},width:2},box(0,0)),true);
 assert.equal(lineHitsRect({a:{x:-10,y:-3},b:{x:20,y:-3},width:2},box(0,0)),false);
 assert.throws(()=>intersects(box(NaN,0),box(0,0)));
});
