import test from 'node:test';import assert from 'node:assert/strict';
import {solveLayout,solveLayoutAsync} from '../../pipeline/labels/place.js';
test('cooperative placement preserves results and supports cancellation between slices',async()=>{
 const annotations=Array.from({length:200},(_,i)=>({id:String(i),kind:'point-label',candidates:[{id:'a',shape:{bounds:{x:i*5,y:0,width:3,height:3},parts:[{x:i*5,y:0,width:3,height:3}]}}]}));
 const args={annotations,viewport:{x:0,y:0,width:2000,height:100},policy:{edgePadding:0,clearance:0}};
 assert.deepEqual(await solveLayoutAsync(args),solveLayout(args));
 const controller=new AbortController();setTimeout(()=>controller.abort(),0);
 await assert.rejects(solveLayoutAsync(args,{signal:controller.signal,budgetMs:0}),{name:'AbortError'});
});
