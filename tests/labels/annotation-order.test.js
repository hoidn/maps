import test from 'node:test';
import assert from 'node:assert/strict';
import {annotationOrder} from '../../pipeline/labels/annotation-order.js';
import {solveLayout} from '../../pipeline/labels/place.js';
const reference=a=>a.map((_,i)=>i).sort((i,j)=>Number(!!a[j].pinned)-Number(!!a[i].pinned)||Number(!!a[j].required)-Number(!!a[i].required)||(a[j].priority??0)-(a[i].priority??0)||(a[i].id<a[j].id?-1:a[i].id>a[j].id?1:0));
test('cached ordering follows priority, required, pinned, identity and input changes',()=>{
 let a=[{id:'b',priority:4},{id:'a',priority:4},{id:'c',priority:1}];
 for(const change of [()=>{},()=>{a=a.map(x=>({...x}));},()=>{a[2].priority=9;},()=>{a[1].required=true;},()=>{a[0].pinned=true;},()=>{a[0].pinned=false;a[1].required=false;a[2].priority=4;a[2].id='0';},()=>{a.reverse();},()=>{a.push({id:'extra',priority:10});},()=>{a.splice(1,1);},()=>{a[0].priority=undefined;},()=>{a[0].priority=NaN;}]){
  change();assert.deepEqual(annotationOrder(a),reference(a));assert.deepEqual(annotationOrder(a.map(x=>({...x}))),reference(a));
 }
});
test('unchanged large inventories read each ranking field once per ordering request',()=>{
 let reads=0;
 const a=Array.from({length:2000},(_,i)=>({id:'order-'+i,get priority(){reads++;return (i*997)%2000;}}));
 const first=annotationOrder(a);assert.equal(reads,2000);
 reads=0;assert.strictEqual(annotationOrder(a),first);assert.equal(reads,2000);
});
test('cached indices remain bounded and cannot be changed by a caller',()=>{
 const a=[{id:'cache-a'},{id:'cache-b'}],initial=annotationOrder(a);
 assert.throws(()=>initial.reverse(),TypeError);
 for(let i=0;i<5;i++)annotationOrder([{id:'different-'+i}]);
 assert.deepEqual(annotationOrder(a),[0,1]);assert.notStrictEqual(annotationOrder(a),initial);
});
test('cached uniqueness validation still rejects a changed duplicate in fast and repair solves',()=>{
 for(const repairMaxNeighbors of [0,2]){
  const annotations=[{id:'first',candidates:[]},{id:'second',candidates:[]}],args={annotations,viewport:{width:100,height:100},policy:{repairMaxNeighbors}};
  solveLayout(args);solveLayout(args);annotations[1].id='first';
  assert.throws(()=>solveLayout(args),/^Error: Duplicate annotation ID$/);
  annotations[1].id='third';assert.equal(solveLayout(args).outcomes.length,2);
 }
});

test('optional point text promotes only its associated marker immediately before itself',()=>{
 const a=[{id:'unrelated-marker',kind:'symbol',featureId:'other',priority:490},{id:'own-marker',kind:'symbol',featureId:'peak',priority:490},{id:'name',kind:'point-label',featureId:'peak',priority:620},{id:'important-road',kind:'line-label',featureId:'road',priority:800}];
 assert.deepEqual(annotationOrder(a).map(i=>a[i].id),['important-road','own-marker','name','unrelated-marker']);
 assert.deepEqual(a.map(x=>x.priority),[490,490,620,800]);
});
test('cached associated order tracks entity and annotation kind without geometry-dependent churn',()=>{
 const a=[{id:'marker',kind:'symbol',featureId:'f',priority:450},{id:'text',kind:'point-label',featureId:'f',priority:620}];
 const first=annotationOrder(a);assert.deepEqual(first,[0,1]);
 assert.strictEqual(annotationOrder(a.map(x=>({...x,anchor:[100,200],candidates:[]}))),first);
 a[0].featureId='unrelated';assert.deepEqual(annotationOrder(a),[1,0]);
 a[0].featureId='f';a[1].kind='line-label';assert.deepEqual(annotationOrder(a),[1,0]);
 a[1].kind='point-label';assert.deepEqual(annotationOrder(a),[0,1]);
 a[1].required=true;assert.deepEqual(annotationOrder(a),[1,0]);
 a[1].required=false;a[1].pinned=true;assert.deepEqual(annotationOrder(a),[1,0]);
});

const rectangle=(x,y,width,height)=>({bounds:{x,y,width,height},parts:[{x,y,width,height}]});
function pairedFixture(dx=0,dy=0,name='Named summit'){
 return [
  {id:'marker',featureId:'same-source',kind:'symbol',priority:490,anchor:[100+dx,100+dy],candidates:[{id:'anchored',shape:rectangle(95+dx,95+dy,10,10)}]},
  {id:'text',featureId:'same-source',kind:'point-label',priority:620,anchor:[100+dx,100+dy],text:name,candidates:[
   {id:'preferred',shape:rectangle(106+dx,95+dy,40,10),textHTML:name},
   {id:'clear',shape:rectangle(107+dx,95+dy,40,10),textHTML:name}]}
 ];
}
const pairedSolve=annotations=>solveLayout({annotations,viewport:{x:0,y:0,width:500,height:500},policy:{clearance:2,repairMaxNeighbors:0,exhaustiveDiagnostics:false,maxPointDisplacement:32,maxOptionalPointDisplacement:16}});
test('a named peak keeps its true marker and complete name with unchanged clearance',()=>{
 for(const [dx,dy,name] of [[0,0,'Named summit'],[73,29,'Renamed facility']]){
  const annotations=pairedFixture(dx,dy,name),before=JSON.stringify(annotations),result=pairedSolve(annotations);
  assert.deepEqual(result.placements.map(p=>p.id),['marker','text']);
  assert.equal(result.placements.find(p=>p.id==='text').candidateId,'clear');
  assert.equal(result.placements.find(p=>p.id==='text').textHTML,name);
  assert.equal(JSON.stringify(annotations),before);
 }
});
test('marker reservations preserve translated pan layout and required static text precedence',()=>{
 const first=pairedSolve(pairedFixture()),panned=pairedSolve(pairedFixture(50,60));
 for(let i=0;i<first.placements.length;i++){
  const a=first.placements[i],b=panned.placements[i];assert.equal(a.id,b.id);assert.equal(a.candidateId,b.candidateId);
  assert.equal(b.footprint.bounds.x-a.footprint.bounds.x,50);assert.equal(b.footprint.bounds.y-a.footprint.bounds.y,60);
 }
 const required=pairedFixture();required[1].required=true;required[1].candidates.pop();
 const result=pairedSolve(required);
 assert.deepEqual(result.missingRequired,[]);assert.equal(result.placements[0].id,'text');assert.equal(result.outcomes.find(o=>o.id==='marker').reason,'collision');
});
