import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {selectProfiles,checkProfileEvidence,coverageStatus} from '../../scripts/audit-cartography.mjs';
import {selectCases,summarizeBackend,parseArguments} from '../../scripts/fuzz-cartography-matrix.mjs';
const profile={name:'A real place',expectedKinds:['trail','poi']};
const profiles={groundScalesMetersPerPixel:[32,12,3],regions:{example:[profile],empty:[]}};
const evidence={featureFound:true,status:'ready',geometrySourceIds:{trail:['source:trail'],poi:['source:peak']}};
test('unknown regions, empty profiles and empty ground scales fail selection',()=>{
 assert.throws(()=>selectProfiles(profiles,'unknown'),/Unknown region/);
 assert.throws(()=>selectProfiles(profiles,'empty'),/No coverage profiles/);
 assert.throws(()=>selectProfiles({...profiles,groundScalesMetersPerPixel:[]},'example'),/ground scales/);
 assert.throws(()=>selectProfiles({...profiles,regions:{example:[{name:'Empty expectations',expectedKinds:[]}]}},'example'),/expected kinds/);
 assert.deepEqual(selectProfiles(profiles,'example'),[profile]);
});
test('missing expected feature, geometry and empty runs are mechanical failures',()=>{
 const good=checkProfileEvidence(profile,evidence);
 assert.equal(good.mechanicalStatus,'passed');
 const missing=checkProfileEvidence(profile,{...evidence,featureFound:false});
 assert.equal(missing.mechanicalStatus,'failed');assert.equal(missing.missingFeature,true);
 const missingKind=checkProfileEvidence(profile,{...evidence,geometrySourceIds:{poi:['source:peak']}});
 assert.equal(missingKind.mechanicalStatus,'failed');assert.deepEqual(missingKind.missingKinds,['trail']);
 assert.equal(coverageStatus([],[],false),'failed');
 assert.equal(coverageStatus([missingKind],[],true),'failed');
 assert.equal(coverageStatus([good],['browser failed'],true),'failed');
 assert.equal(coverageStatus([good],[],false),'review-required');
 assert.equal(coverageStatus([good],[],true),'passed');
});
test('selected configured region covers every browser/backend deterministically',async()=>{
 const names=await Promise.all(['grand_canyon','sequoia','san_gabriel'].map(async id=>JSON.parse(await readFile(`pipeline/maps/${id}.json`,'utf8')).id));
 assert.throws(()=>selectCases('unknown',names),/Unknown map/);
 const cases=selectCases('san_gabriel',names);assert.equal(cases.length,9);
 assert.deepEqual(cases,selectCases('san_gabriel',names));assert.equal(new Set(cases.map(row=>row[3])).size,9);
 for(const browser of ['chromium','firefox','webkit'])assert.deepEqual(cases.filter(row=>row[1]===browser).map(row=>row[2]),['svg','canvas','webgl']);
 const defaults=selectCases(null,names);assert.equal(defaults.length,6);assert.deepEqual(defaults[0],['grand_canyon','chromium','webgl',73191]);
});
test('explicit generated map specifications select safe IDs without a preset',()=>{
 const spec={id:'unregistered-mountains',bbox:[-118.45,34.10,-117.42,34.55]};
 const cases=selectCases(spec,['grand_canyon']);
 assert.equal(cases.length,9);assert.ok(cases.every(row=>row[0]===spec.id));
 assert.deepEqual(cases,selectCases(spec,[]));
 for(const id of ['../outside','../outside/file','',null])assert.throws(()=>selectCases({id},[]),/Invalid map ID/);
});
test('fallback and missing backend evidence cannot pass the requested backend',()=>{
 assert.deepEqual(summarizeBackend('webgl',{status:'passed',checks:[{backend:'canvas'}]}),{requestedBackend:'webgl',activeBackends:['canvas'],status:'fallback'});
 assert.equal(summarizeBackend('webgl',{status:'passed',checks:[]}).status,'failed');
 assert.equal(summarizeBackend('webgl',{status:'failed',checks:[{backend:'webgl'}]}).status,'failed');
 assert.equal(summarizeBackend('svg',{status:'passed',checks:[{backend:'svg'}]}).status,'passed');
});
test('matrix map flags are parsed without leaking them into child browser options',()=>{
 assert.deepEqual(parseArguments(['out','--map','san_gabriel','--headless']),{directory:'out',map:'san_gabriel',browserArgs:['--headless']});
 for(const args of [['--map'],['--map','sequoia','--map','san_gabriel'],['--unknown'],['out','extra']])assert.throws(()=>parseArguments(args),/Usage:/);
});
