import test from 'node:test';
import assert from 'node:assert/strict';
import {solveLayout} from '../../pipeline/labels/place.js';
const candidate=(id,x)=>({id,shape:{bounds:{x,y:20,width:20,height:10},parts:[{x,y:20,width:20,height:10}]}});
test('fallback search is lazy, collision checked, and leaves the input reusable',()=>{
 let calls=0;
 const a={id:'a',kind:'point-label',candidates:[candidate('blocked',20)],fallbackCandidates:()=>{calls++;return [candidate('also-blocked',21),candidate('fits',70)];}};
 const input={annotations:[a],obstacles:[{id:'rock',shape:{bounds:{x:15,y:15,width:30,height:30},parts:[{x:15,y:15,width:30,height:30}]}}],viewport:{width:120,height:100}};
 assert.equal(solveLayout(input).placements[0]?.candidateId,'fits');
 assert.equal(a.candidates.length,1);assert.equal(typeof a.fallbackCandidates,'function');
 assert.equal(solveLayout(input).placements[0]?.candidateId,'fits');assert.equal(calls,2);
 solveLayout({...input,obstacles:[]});assert.equal(calls,2);
});
