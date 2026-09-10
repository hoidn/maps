import test from 'node:test';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
import {PackedContourClient} from '../../pipeline/labels/packed-contour-client.js';
const script=execFileSync('python3',['-c',"import sys;sys.path.insert(0,'pipeline');from cartography.contour_payload import pack_contours;print(pack_contours('<svg><g class=\"contours\"><path d=\"M0.000,0.000 1.000,1.000\"/></g></svg>')[1])"],{encoding:'utf8'});
const tier=JSON.parse(script.slice(script.indexOf('>')+1,script.lastIndexOf('</script>'))).tiers[0];
for(const failure of ['constructor','post','async'])test(`worker ${failure} failure decodes pending geometry through real portable fallback`,async()=>{
 const prior=globalThis.Worker;let stopped=0;
 globalThis.Worker=class{constructor(){if(failure==='constructor')throw Error('Worker disabled');}postMessage(){if(failure==='post')throw Error('Worker transport failed');queueMicrotask(()=>this.onerror({message:'Worker load failed',preventDefault(){}}));}terminate(){stopped++;}};
 const client=new PackedContourClient('worker source');try{const items=await client.decode(tier);assert.equal(items.length,1);assert.deepEqual([...items[0].runs[0].points],[0,0,1,1]);assert.equal(client.blocked,true);if(failure!=='constructor')assert.equal(stopped,1);}finally{client.close();globalThis.Worker=prior;}
});
test('closing worker rejects every pending decode and releases owned resources',async()=>{
 const prior=globalThis.Worker;let stopped=0;globalThis.Worker=class{postMessage(){}terminate(){stopped++;}};
 const client=new PackedContourClient('worker source');try{const pending=client.decode(tier);client.close();await assert.rejects(pending,{name:'AbortError'});await assert.rejects(client.decode(tier),{name:'AbortError'});assert.equal(client.pending.size,0);assert.equal(client.url,null);assert.equal(stopped,1);}finally{client.close();globalThis.Worker=prior;}
});
