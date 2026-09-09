import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeTimings} from '../../scripts/benchmark-layout.mjs';
test('performance summaries retain explicit unmet gates instead of averaging slow frames away',()=>{
 const summary=summarizeTimings({transactions:[1,2,20,21],frames:[16,17,40,41],settled:120},{transactionP95Ms:8,frameP95Ms:33,settledMs:100});
 assert.equal(summary.status,'fail');assert.deepEqual(summary.unmet,['transactionP95Ms','frameP95Ms','settledMs']);assert.equal(summary.transactionP95Ms,21);
});
test('missing transaction measurements are incomplete rather than a zero-cost pass',()=>{
 assert.equal(summarizeTimings({transactions:[],frames:[16],settled:30},{transactionP95Ms:8,frameP95Ms:33,settledMs:100}).status,'incomplete');
});
