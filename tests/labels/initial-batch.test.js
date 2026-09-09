import test from 'node:test';
import assert from 'node:assert/strict';
import {initialBatch} from '../../pipeline/labels/initial-batch.js';
const name=(id,featureId,priority=820,extra={})=>({id,featureId,kind:'point-label',text:id,priority,importanceClass:'primary',...extra});
test('first batch prioritizes eight distinct named features and their markers without dropping inventory',()=>{
 const annotations=[{id:'trail',featureId:'route',kind:'line-label',text:'Major route',priority:850},...Array.from({length:12},(_,i)=>name('name'+i,'feature'+i,830-i)),name('alias','feature0',830),...Array.from({length:12},(_,i)=>({id:'marker'+i,featureId:'feature'+i,kind:'symbol',priority:800-i})),{id:'service',featureId:'service',kind:'symbol',priority:900}];
 const batch=initialBatch(annotations);
 assert.equal(batch.namedIds.size,8);assert.equal(batch.minimumIds.size,16);
 assert.deepEqual([...batch.namedIds],Array.from({length:8},(_,i)=>i===0?'alias':'name'+i));
 for(let i=0;i<8;i++)assert.equal(batch.minimumIds.has('marker'+i),true);
 assert.equal(batch.minimumIds.has('service'),false);
 assert.deepEqual(new Set(batch.ordered.map(a=>a.id)),new Set(annotations.map(a=>a.id)));
 assert.equal(batch.ordered.length,annotations.length);
 assert.equal(batch.ordered.slice(0,16).every(a=>batch.minimumIds.has(a.id)),true);
});
test('small and low-tier views use available names and exclude hidden names and numeric contours',()=>{
 const annotations=[name('off','off',900),name('minor','minor',400,{importanceClass:'minor'}),name('primary','primary',820),{id:'river',featureId:'river',kind:'line-label',text:'River',priority:650},{id:'contour',featureId:'contour',kind:'line-label',text:'5000',style:'l-contour',priority:850}];
 const batch=initialBatch(annotations,{eligible:a=>a.id!=='off'});
 assert.equal(batch.eligibleNamedFeatures,3);assert.deepEqual([...batch.namedIds],['primary','river','minor']);
 assert.equal(batch.minimumIds.has('off'),false);assert.equal(batch.minimumIds.has('contour'),false);
});
