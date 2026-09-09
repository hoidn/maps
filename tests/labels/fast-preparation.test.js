import test from 'node:test';
import assert from 'node:assert/strict';
import {CanvasMapRenderer} from '../../pipeline/render/canvas-renderer.js';
test('a deferred fast label does not project unused area rings',()=>{
 const areaPolygons={map(){throw new Error('Projected an area without a candidate');}};
 const annotation={id:'area',featureId:'f',kind:'region-label',anchor:[2,3],areaPolygons};
 const renderer={controller:{svg:{clientWidth:100},view:{w:50},manifest:{annotations:[annotation]},eligible:()=>undefined,policy:{}},labels:new Map()};
 const [item]=CanvasMapRenderer.prototype.prepareFast.call(renderer,{a:2,b:0,c:0,d:2,e:10,f:20},{x:0,y:0,width:100,height:100},2);
 assert.equal(item.eligibleReason,'budget-deferred');assert.deepEqual(item.anchor,[14,26]);assert.deepEqual(item.candidates,[]);
});

import {solveLayout} from '../../pipeline/labels/place.js';
test('an ineligible annotation keeps diagnostics and required failure without preparing candidates',()=>{
 const deferred={id:'off',featureId:'route',required:true,eligibleReason:'outside-view',get candidates(){throw new Error('Prepared excluded geometry');}};
 const shape={bounds:{x:10,y:10,width:10,height:10},parts:[{x:10,y:10,width:10,height:10}]};
 const result=solveLayout({annotations:[deferred,{id:'on',featureId:'route',candidates:[{id:'c',shape}]}],viewport:{x:0,y:0,width:100,height:100}});
 assert.deepEqual(result.placements.map(p=>p.id),['on']);
 assert.deepEqual(result.missingRequired,['off']);
 assert.deepEqual(result.outcomes.find(o=>o.id==='off'),{id:'off',reason:'outside-view',blockerIds:[]});
});

test('warm fast preparation reuses immutable annotation metadata and resets frame state',()=>{
 let copies=0,reason;
 const annotation={id:'label',featureId:'f',kind:'point-label',anchor:[2,3],required:true,
  get description(){copies++;return 'source metadata';}};
 const renderer={controller:{svg:{clientWidth:100},view:{w:50},manifest:{annotations:[annotation]},eligible:()=>reason,policy:{}},labels:new Map()};
 const prepare=m=>CanvasMapRenderer.prototype.prepareFast.call(renderer,m,{x:0,y:0,width:100,height:100},2);
 let [item]=prepare({a:2,b:0,c:0,d:2,e:10,f:20});
 assert.equal(item.description,'source metadata');assert.equal(copies,1);assert.equal(item.required,false);
 assert.equal(item.eligibleReason,'budget-deferred');assert.deepEqual(item.anchor,[14,26]);
 reason='layer-off';[item]=prepare({a:3,b:0,c:0,d:3,e:0,f:0});
 assert.equal(copies,1,'static metadata was copied again on a warm frame');
 assert.deepEqual(item.anchor,[6,9]);assert.equal(item.eligibleReason,'layer-off');assert.deepEqual(item.candidates,[]);
 reason=undefined;[item]=prepare({a:1,b:0,c:0,d:1,e:1,f:1});
 assert.equal(item.eligibleReason,'budget-deferred');assert.deepEqual(item.anchor,[3,4]);
 assert.deepEqual(annotation.anchor,[2,3]);assert.equal(annotation.required,true);
});
