import test from 'node:test';
import assert from 'node:assert/strict';
import {solveLayout} from '../../pipeline/labels/place.js';
const shape=x=>({bounds:{x,y:100,width:20,height:12},parts:[{x,y:100,width:20,height:12}]});
const annotation=id=>({id,featureId:'contour',kind:'line-label',repeatDistance:180,candidates:[{id:'position',shape:shape(200)}]});
test('hidden fixed labels reserve their feature repeat distance for newly revealed labels',()=>{
 const result=solveLayout({annotations:[annotation('new')],viewport:{width:500,height:400},repeatReservations:[{id:'old',featureId:'contour',distance:180,shape:shape(100)}]});
 assert.equal(result.placements.length,0);assert.equal(result.outcomes[0].reason,'repeat-spacing');assert.deepEqual(result.outcomes[0].blockerIds,['old']);
});
test('a repeat reservation does not block its own label',()=>{
 const result=solveLayout({annotations:[annotation('old')],viewport:{width:500,height:400},repeatReservations:[{id:'old',featureId:'contour',distance:180,shape:shape(200)}]});
 assert.equal(result.placements.length,1);
});
