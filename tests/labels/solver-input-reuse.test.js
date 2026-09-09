import test from 'node:test';
import assert from 'node:assert/strict';
import {solveLayout} from '../../pipeline/labels/place.js';
const shape={bounds:{x:20,y:20,width:10,height:10},parts:[{x:20,y:20,width:10,height:10}]};
test('ordinary immutable solver inputs do not copy irrelevant metadata',()=>{
 const annotation=Object.freeze({id:'plain',candidates:Object.freeze([Object.freeze({id:'candidate',shape})]),get unusedMetadata(){throw Error('Copied unused metadata');}});
 const result=solveLayout({annotations:[annotation],viewport:{x:0,y:0,width:100,height:100}});
 assert.equal(result.placements[0].id,'plain');assert.strictEqual(annotation.candidates[0].shape,shape);
});
test('fallback and measurement reserves still isolate source candidates',()=>{
 const candidate={id:'candidate',shape};let fallbackCalls=0;
 const fallback=()=>{fallbackCalls++;return [{id:'fallback',shape}];};
 const a={id:'reserved',candidates:[candidate],fallbackCandidates:fallback};
 const before=JSON.stringify(a.candidates);
 solveLayout({annotations:[a],viewport:{x:0,y:0,width:10,height:10},policy:{measurementReserves:{reserved:2}}});
 assert.equal(fallbackCalls,1);assert.strictEqual(a.fallbackCandidates,fallback);assert.equal(JSON.stringify(a.candidates),before);
});
