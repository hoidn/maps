import test from 'node:test';
import assert from 'node:assert/strict';
import {RoundFailures} from '../../pipeline/labels/round-failures.js';
import {solveLayout} from '../../pipeline/labels/place.js';
const box=(x=40)=>({bounds:{x,y:40,width:30,height:12},parts:[{x,y:40,width:30,height:12}]});

test('only complete infeasible domains enter a round-local failure cache',()=>{
 const cache=new RoundFailures(),annotations=[{id:'blocked'},{id:'empty'},{id:'deferred',eligibleReason:'round-deferred'},{id:'invalid',metricError:'fonts'},{id:'placed'},{id:'required',required:true}],outcomes=annotations.map(a=>({id:a.id,reason:a.id==='placed'?'placed':a.id==='empty'?'no-valid-candidate':'collision',blockerIds:['protected']}));
 cache.capture(annotations,{outcomes});assert.deepEqual([...cache.entries.keys()],['blocked','empty']);
 outcomes[0].blockerIds.push('later');assert.deepEqual(cache.get('blocked').blockerIds,['protected']);
 assert.equal(new RoundFailures().has('blocked'),false);
});
test('cached failed domains preserve exact outcome evidence without candidate search',()=>{
 let generated=0;const failure={id:'old',reason:'collision',blockerIds:['retained'],candidateDiagnostics:{windows:4}};
 const result=solveLayout({annotations:[{id:'retained',priority:100,candidates:[{id:'fixed',shape:box()}]},{id:'old',priority:90,cachedFailure:failure,candidates:[],fallbackCandidates:function*(){generated++;yield {id:'otherwise-valid',shape:box(120)};}},{id:'new',priority:80,candidates:[{id:'fresh',shape:box(200)}]}],viewport:{width:400,height:200},policy:{repairMaxNeighbors:0,reuseRoundFailures:true,exhaustiveDiagnostics:false}});
 assert.equal(generated,0);assert.deepEqual(result.outcomes.find(o=>o.id==='old'),failure);assert.deepEqual(result.placements.map(p=>p.id),['retained','new']);
});
test('prior failures cannot bypass required or repairable layout without explicit opt-in',()=>{
 const annotation={id:'old',cachedFailure:{id:'old',reason:'collision',blockerIds:['retained']},candidates:[]},args={annotations:[annotation],viewport:{width:400,height:200}};
 assert.throws(()=>solveLayout(args),/round failure/);
 assert.throws(()=>solveLayout({...args,policy:{reuseRoundFailures:true,exhaustiveDiagnostics:false,repairMaxNeighbors:2}}),/round failure/);
 assert.throws(()=>solveLayout({...args,annotations:[{...annotation,required:true}],policy:{reuseRoundFailures:true,exhaustiveDiagnostics:false,repairMaxNeighbors:0}}),/round failure/);
 assert.throws(()=>solveLayout({...args,annotations:[{...annotation,cachedFailure:{...annotation.cachedFailure,reason:'budget-deferred'}}],policy:{reuseRoundFailures:true,exhaustiveDiagnostics:false,repairMaxNeighbors:0}}),/round failure/);
});
test('exhaustive final diagnostics cannot reuse incomplete placement-time blockers',()=>{
 const args={annotations:[{id:'old',cachedFailure:{id:'old',reason:'collision',blockerIds:['retained']},candidates:[]}],viewport:{width:400,height:200},policy:{reuseRoundFailures:true,repairMaxNeighbors:0,exhaustiveDiagnostics:true}};
 assert.throws(()=>solveLayout(args),/round failure/);
});
