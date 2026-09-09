import test from 'node:test';
import assert from 'node:assert/strict';
import {assertStablePan} from '../../scripts/fuzz-cartography.mjs';
const snapshot=()=>({scale:2,placements:{a:{candidateId:'same',application:{transform:'matrix(1 0 0 1 3 4)'},textHTML:'Camp',paintTextHTML:'Camp',geometry:[[10,20,5,6]]}}});
test('pan oracle detects moved and rewrapped labels with unchanged candidate IDs',()=>{
 const before=snapshot();
 for(const change of [p=>p.geometry[0][0]+=.1,p=>p.application.transform='matrix(1 0 0 1 4 4)',p=>p.textHTML='<tspan>Camp</tspan>',p=>p.paintTextHTML='Other']){
  const after=snapshot();change(after.placements.a);assert.throws(()=>assertStablePan(before,after),/Pan changed/);
 }
});
test('pan oracle tolerates subpixel noise and only compares shared visible IDs',()=>{
 const before=snapshot(),after=snapshot();after.placements.a.geometry[0][0]+=.01;
 after.placements.new=structuredClone(after.placements.a);assert.equal(assertStablePan(before,after).shared,1);
 delete after.placements.a;assert.equal(assertStablePan(before,after).shared,0);
});
test('pan oracle rejects a changed scale and non-finite geometry',()=>{
 const before=snapshot(),after=snapshot();after.scale=3;assert.throws(()=>assertStablePan(before,after),/scale/);
 after.scale=2;after.placements.a.geometry[0][0]=NaN;assert.throws(()=>assertStablePan(before,after),/geometry/);
});
