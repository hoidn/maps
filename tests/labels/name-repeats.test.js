import test from 'node:test';import assert from 'node:assert/strict';import {solveLayout} from '../../pipeline/labels/place.js';
const shape=x=>({bounds:{x,y:100,width:20,height:12},parts:[{x,y:100,width:20,height:12}]});
test('equal display names can share repeat spacing without merging source identity',()=>{
 const annotations=[100,150].map((x,i)=>({id:'label'+i,featureId:'source'+i,repeatGroup:'name:arbitrary-point',repeatDistance:100,kind:'point-label',candidates:[{id:'p',shape:shape(x)}]}));
 const r=solveLayout({annotations,viewport:{width:500,height:400}});assert.equal(r.placements.length,1);assert.equal(r.outcomes[1].reason,'repeat-spacing');assert.notEqual(annotations[0].featureId,annotations[1].featureId);
});
test('hidden repeated names reserve space across their distinct physical source features',()=>{
 const r=solveLayout({annotations:[{id:'new',featureId:'new-source',repeatGroup:'name',repeatDistance:100,candidates:[{id:'p',shape:shape(150)}]}],viewport:{width:500,height:400},repeatReservations:[{id:'old',featureId:'old-source',repeatGroup:'name',distance:100,shape:shape(100)}]});assert.equal(r.placements.length,0);
});
