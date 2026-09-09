import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeTimings} from '../../scripts/benchmark-layout.mjs';
test('performance summaries retain explicit unmet gates instead of averaging slow frames away',()=>{
 const summary=summarizeTimings({transactions:[1,2,20,21],frames:[16,17,40,41],settled:120,completionStatus:'ready'},{transactionP95Ms:8,frameP95Ms:33,settledMs:100});
 assert.equal(summary.status,'fail');assert.deepEqual(summary.unmet,['transactionP95Ms','frameP95Ms']);assert.equal(summary.transactionP95Ms,21);
});
test('missing transaction measurements are incomplete rather than a zero-cost pass',()=>{
 assert.equal(summarizeTimings({transactions:[],frames:[16],settled:30,completionStatus:'ready'},{transactionP95Ms:8,frameP95Ms:33,settledMs:100}).status,'incomplete');
});

test('idle label latency is informational while camera limits remain enforced',()=>{
 const summary=summarizeTimings({transactions:[2,3],frames:[16,17],settled:850,completionStatus:'ready'},{transactionP95Ms:8,frameP95Ms:33,settledMs:100});
 assert.equal(summary.status,'pass');assert.equal(summary.settledMs,850);assert.equal(summary.labelCompletion.status,'complete');assert.match(summary.labelCompletion.measurement,/quiet/);
});
test('failed or unfinished label completion cannot pass a fast camera benchmark',()=>{
 for(const completionStatus of ['loading','error'])assert.equal(summarizeTimings({transactions:[2],frames:[16],settled:150,completionStatus},{transactionP95Ms:8,frameP95Ms:33}).status,'incomplete');
 assert.equal(summarizeTimings({transactions:[2],frames:[16],settled:NaN,completionStatus:'ready'},{transactionP95Ms:8,frameP95Ms:33}).status,'incomplete');
});
