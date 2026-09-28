import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {initializeFuzz} from '../../scripts/fuzz-cartography.mjs';

test('readiness waits for completion without exporting its report and preserves rejection',async()=>{
 let resolveReady,enteredEvaluate;const ready=new Promise(resolve=>{resolveReady=resolve;}),evaluating=new Promise(resolve=>{enteredEvaluate=resolve;});
 const readyReport={outcomes:[{id:'unused'}]};let transferred=Symbol('pending'),checks=0;
 const page={
  async goto(){},
  async evaluate(callback){enteredEvaluate();transferred=await vm.runInNewContext(`(${callback.toString()})()`,{mapLayout:{ready}});return transferred;},
  locator(){return{async scrollIntoViewIfNeeded(){}};},
 };
 const waiting=initializeFuzz(page,'http://fixture/',async()=>{checks++;},async()=>{checks++;},()=>{},{});
 await evaluating;await new Promise(setImmediate);assert.equal(checks,0);resolveReady(readyReport);await waiting;assert.equal(checks,2);

 const failure=Error('Failed readiness'),failedPage={
  async goto(){},
  evaluate(callback){return vm.runInNewContext(`(${callback.toString()})()`,{mapLayout:{ready:Promise.reject(failure)}});},
  locator(){assert.fail('Readiness rejection must stop initial checks');},
 };
 const failureReport={};
 await assert.rejects(initializeFuzz(failedPage,'http://fixture/',()=>{},()=>{},()=>{},failureReport),{message:'Failed readiness'});
 assert.equal(failureReport.initialization.failedPhase,'readiness');
 assert.equal(transferred,undefined,'The unused readiness report must not cross page.evaluate');
});

test('initialization rearms the watchdog for each bounded phase and retains every initial check',async t=>{
 let clock=0,deadline=0;const calls=[],report={};t.mock.method(performance,'now',()=>clock);
 const advance=ms=>{clock+=ms;assert.ok(clock<deadline,'A completed phase must not consume the next phase watchdog');};
 const page={
  async goto(url,options){assert.equal(url,'http://fixture/');assert.deepEqual(options,{timeout:120000});calls.push('navigation');advance(80000);},
  async evaluate(){calls.push('readiness');advance(80000);},
  locator(selector){assert.equal(selector,'.map-wrap');return{async scrollIntoViewIfNeeded(){calls.push('scroll');advance(10000);}};},
 };
 await initializeFuzz(page,'http://fixture/',async()=>{calls.push('settled');advance(30000);},async step=>{calls.push('capture:'+step);advance(40000);},phase=>{calls.push('watchdog:'+phase);deadline=clock+120000;},report);
 assert.deepEqual(calls,['watchdog:navigation','navigation','watchdog:readiness','readiness','watchdog:initial-checks','scroll','settled','capture:0']);
 assert.deepEqual(report.initialization,{status:'passed',durationMs:240000,phases:['navigation','readiness','initial-checks'].map((phase,index)=>({phase,startedMs:index*80000,durationMs:80000,status:'passed'}))});
});

for(const failedPhase of ['navigation','readiness','initial-checks'])test(`initialization records timing and the failed ${failedPhase} phase`,async t=>{
 let clock=0;const report={},armed=[];t.mock.method(performance,'now',()=>clock);
 const run=async phase=>{clock+=17;if(phase===failedPhase)throw Error('Failed '+phase);};
 const page={goto:()=>run('navigation'),evaluate:()=>run('readiness'),locator:()=>({scrollIntoViewIfNeeded:()=>run('initial-checks')})};
 await assert.rejects(initializeFuzz(page,'http://fixture/',()=>assert.fail('Settlement must not run after initialization failure'),()=>assert.fail('Capture must not run after initialization failure'),phase=>armed.push(phase),report),{message:'Failed '+failedPhase});
 const phases=['navigation','readiness','initial-checks'].slice(0,armed.length);
 assert.deepEqual(armed,phases);assert.deepEqual(report.initialization,{status:'failed',failedPhase,durationMs:phases.length*17,phases:phases.map((phase,index)=>({phase,startedMs:index*17,durationMs:17,status:phase===failedPhase?'failed':'passed',...(phase===failedPhase?{error:'Failed '+phase}:{})}))});
});
