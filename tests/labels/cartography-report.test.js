import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
import * as audit from '../../scripts/audit-cartography.mjs';

test('scene inventories persist intact without accumulating in the coverage index',async t=>{
 assert.equal(typeof audit.writeCoverageScene,'function','Persist scene evidence before retaining the coverage summary');
 const dir=await mkdtemp(join(tmpdir(),'cartography-report-')),output=join(dir,'coverage.json');
 const stringify=JSON.stringify;t.mock.method(JSON,'stringify',(...args)=>{
  const text=stringify(...args);if(text.length>10000)throw RangeError('Invalid string length');return text;
 });
 const scenes=Array.from({length:12},(_,i)=>({profile:'Peak '+i,targetMetersPerPixel:12,mechanicalStatus:'passed',geometrySourceIds:{poi:['osm:'+i]},paintedIds:['symbol:'+i],outcomes:[{id:'symbol:'+i,reason:'placed',blockerIds:[]},{id:'name:'+i,reason:'collision',blockerIds:['trail:'+i],text:'x'.repeat(2048)}]}));
 assert.throws(()=>JSON.stringify({scenes},null,2),/Invalid string length/);
 try{
  const summaries=[];
  for(const [index,scene] of scenes.entries())summaries.push(await audit.writeCoverageScene(output,index+1,scene));
  const report={schemaVersion:2,status:audit.coverageStatus(summaries),scenes:summaries,errors:[]};
  const browser={async close(){this.closed=true;}},server=createServer();
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>server.close());
  t.mock.method(console,'log',()=>{});
  await audit.finishCoverageAudit(output,report,browser,server);
  assert.deepEqual(JSON.parse(await readFile(output,'utf8')),report);assert.equal(browser.closed,true);assert.equal(server.listening,false);
  for(const [index,summary] of summaries.entries()){
   assert.equal(Object.hasOwn(summary,'outcomes'),false);assert.equal(summary.outcomeCount,2);
   assert.deepEqual(await readFile(summary.reportPath,'utf8').then(JSON.parse),scenes[index]);
   const {outcomes,...metadata}=scenes[index],{outcomeCount,reportPath,...retained}=summary;
   assert.deepEqual(retained,metadata);
  }
  assert.equal(audit.coverageStatus(summaries),audit.coverageStatus(scenes));
 }finally{await rm(dir,{recursive:true,force:true});}
});

for(const failure of ['report-write','browser-close'])test(`coverage cleanup closes the server after ${failure} failure`,async t=>{
 assert.equal(typeof audit.finishCoverageAudit,'function','Report persistence must always release audit resources');
 const dir=await mkdtemp(join(tmpdir(),'cartography-cleanup-')),output=join(dir,'report.json'),server=createServer();
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>server.close());
 const browser={async close(){this.closed=true;if(failure==='browser-close')throw Error('browser close failed');}};
 try{
  if(failure==='report-write')await mkdir(output);
  t.mock.method(console,'log',()=>{});
  await assert.rejects(audit.finishCoverageAudit(output,{status:'failed',scenes:[],errors:['original scene error']},browser,server),failure==='report-write'?{code:'EISDIR'}:/browser close failed/);
  assert.equal(browser.closed,true);assert.equal(server.listening,false);
 }finally{await rm(dir,{recursive:true,force:true});}
});
