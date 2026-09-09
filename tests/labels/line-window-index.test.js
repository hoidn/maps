import test from 'node:test';
import assert from 'node:assert/strict';
import {lineWindows} from '../../pipeline/labels/candidates.js';
import {referenceLineWindows} from '../support/line-window-reference.js';

test('indexed arc queries preserve exact candidates across seeded path domains',()=>{
 let seed=879263;
 const random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/2**32;};
 for(let trial=0;trial<1200;trial++){
  const points=[[0,0]];
  for(let i=0,n=2+Math.floor(random()*400);i<n;i++){
   const p=points.at(-1);points.push([p[0]+random()*10,p[1]+(random()-.5)*10]);
   if(random()<.08)points.push([...points.at(-1)]);
  }
  const textLength=1+random()*200,policy={linePadding:random()*12,maxLineCandidates:1+Math.floor(random()*24),maxTurnDegrees:random()<.2?Infinity:random()*180,lineSampleStep:1+random()*40,preferredOffset:random()*600,lineOffset:random()*30};
  assert.deepEqual(lineWindows(points,textLength,policy),referenceLineWindows(points,textLength,policy),'seeded trial '+trial);
 }
});
test('vertex endpoints and near-epsilon text windows keep strict curvature boundaries',()=>{
 const points=[[0,0],[5,0],[5,0],[5,5],[10,5],[10,10]];
 for(const length of [1e-8,1e-7,2e-7,5,5+1e-7,10])for(const offset of [0,5-1e-7,5,5+1e-7,10]){
  const policy={linePadding:0,lineSampleStep:5,preferredOffset:offset,maxTurnDegrees:90};
  assert.deepEqual(lineWindows(points,length,policy),referenceLineWindows(points,length,policy));
 }
});
test('long contour domains retain full-window order and measured offsets',()=>{
 const points=Array.from({length:25000},(_,i)=>[i*.15,30*Math.sin(i*.003)]);
 const policy={maxLineCandidates:4,preferredOffset:2200};
 assert.deepEqual(lineWindows(points,40,policy),referenceLineWindows(points,40,policy));
});
