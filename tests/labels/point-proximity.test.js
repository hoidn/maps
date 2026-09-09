import test from 'node:test';
import assert from 'node:assert/strict';
import {solveLayout} from '../../pipeline/labels/place.js';
const c=(id,gap)=>{const r={x:50+gap,y:50,width:40,height:15};return {id,shape:{bounds:r,parts:[r]}};};
const solve=(a,extra={})=>solveLayout({annotations:[{id:'place',kind:'point-label',anchor:[50,50],...a}],viewport:{width:200,height:150},...extra}).placements[0]?.candidateId;
test('a previous distant point label yields to a closer feasible placement',()=>{
 assert.equal(solve({candidates:[c('far',30),c('near',8)]},{previous:[{id:'place',candidateId:'far'}]}),'near');
});
test('retention breaks ties only among similarly close point placements',()=>{
 assert.equal(solve({candidates:[c('new',8),c('retained',9)]},{previous:[{id:'place',candidateId:'retained'}]}),'retained');
});
test('a distant ordinary placement still searches for a closer fallback',()=>{
 assert.equal(solve({candidates:[c('far',30)],fallbackCandidates:()=>[c('near',10)]}),'near');
});
test('an obstructed closer fallback cannot replace a safe distant placement',()=>{
 const r={x:58,y:48,width:20,height:20};
 assert.equal(solve({candidates:[c('far',30)],fallbackCandidates:()=>[c('blocked',8)]},{obstacles:[{id:'obstacle',shape:{bounds:r,parts:[r]}}]}),'far');
});
