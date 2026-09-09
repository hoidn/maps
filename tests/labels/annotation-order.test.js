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
