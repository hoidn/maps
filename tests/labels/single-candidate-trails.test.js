import test from 'node:test';
import assert from 'node:assert/strict';
import {solveLayout} from '../../pipeline/labels/place.js';
const shape=(x,y)=>({bounds:{x,y,width:8,height:8},parts:[{x,y,width:8,height:8}]});
const annotations=Array.from({length:12},(_,i)=>({id:'single-'+i,featureId:'f'+i,kind:'point-label',anchor:[10+i*15,20],candidates:[{id:'c',shape:shape(10+i*15,20)}]}));
const obstacles=[{id:'crossing',kind:'trail',line:{a:{x:44,y:0},b:{x:44,y:100},width:2}}];
const args={annotations,viewport:{x:0,y:0,width:250,height:100},policy:{exhaustiveDiagnostics:false,repairMaxNeighbors:0}};
test('single-candidate trail checks avoid building an unused local index and retain collision results',()=>{
 let queries=0,regions=0;
 const query=()=>{queries++;return obstacles;};query.forRegion=()=>{regions++;return query;};
 const expected=solveLayout({...args,queryObstacles:()=>obstacles});
 const actual=solveLayout({...args,queryObstacles:query});
 assert.deepEqual(actual,expected);assert.equal(regions,0);assert.equal(queries,annotations.length);
 assert.equal(actual.outcomes.find(o=>o.id==='single-2').reason,'no-valid-candidate');
});
test('multiple candidates and fallback preparation still use a reusable local neighborhood',()=>{
 let regions=0;
 const query=()=>[];query.forRegion=()=>{regions++;return query;};
 const a={...annotations[0],candidates:[...annotations[0].candidates,{id:'alternate',shape:shape(15,30)}]};
 solveLayout({...args,annotations:[a],queryObstacles:query});assert.equal(regions,1);
 regions=0;solveLayout({...args,annotations:[{...annotations[0],fallbackCandidates:()=>[]}],queryObstacles:query});assert.equal(regions,1);
});
