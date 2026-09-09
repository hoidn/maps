import test from 'node:test';
import assert from 'node:assert/strict';
import {PLACEMENT_ROUNDS,roundEligibility} from '../../pipeline/labels/placement-rounds.js';
test('text enters in importance order while symbols and retained pan placements stay independent',()=>{
 const [primary,context,detail]=PLACEMENT_ROUNDS;
 for(const kind of ['point-label','line-label','region-label','edge-pointer']){
  assert.equal(roundEligibility({kind,priority:799},primary),'round-deferred');
  assert.equal(roundEligibility({kind,textImportance:800,priority:20},primary),undefined);
  assert.equal(roundEligibility({kind,priority:700},context),undefined);
  assert.equal(roundEligibility({kind,priority:699},context),'round-deferred');
  assert.equal(roundEligibility({kind,priority:0},detail),undefined);
  assert.equal(roundEligibility({kind,priority:0},primary,true),undefined);
 }
 for(const kind of ['symbol','facility-group'])assert.equal(roundEligibility({kind,priority:0},primary),undefined);
 assert.equal(roundEligibility({kind:'point-label',priority:0},null),undefined);
});
