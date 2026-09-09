import test from 'node:test';
import assert from 'node:assert/strict';
import {textEligibility} from '../../pipeline/labels/text-importance.js';
test('text detail appears at its ground-scale boundary and stays stable under translation',()=>{
 const a={kind:'point-label',textMaxMetersPerPixel:12};
 assert.equal(textEligibility(a,12.01),'below-text-importance');assert.equal(textEligibility(a,12),undefined);assert.equal(textEligibility({...a,anchor:[999,-88],text:'Renamed'},6),undefined);
});
test('text selection never gates symbols and legacy or required labels keep their visibility',()=>{
 for(const a of [{kind:'symbol',textMaxMetersPerPixel:1},{kind:'point-label'},{kind:'line-label',textMaxMetersPerPixel:null}])assert.equal(textEligibility(a,100),undefined);
});
