import test from 'node:test';
import assert from 'node:assert/strict';
import { validateManifest } from '../../pipeline/labels/schema.js';
const valid = () => ({version:1,map:{width:1300,height:1070},features:[{id:'f',anchor:[2,3]}],annotations:[{id:'a',elementId:'a',featureId:'f',kind:'point-label',anchor:[2,3]}]});
test('validates references, unique IDs and finite geometry',()=>{
 assert.equal(validateManifest(valid()).annotations.length,1);
 for(const alter of [m=>m.annotations.push({...m.annotations[0]}),m=>m.annotations[0].featureId='missing',m=>m.annotations[0].anchor=[NaN,0],m=>m.annotations[0].kind='unknown',m=>m.annotations=[]]) {
  const m=valid();alter(m);assert.throws(()=>validateManifest(m));
 }
});
