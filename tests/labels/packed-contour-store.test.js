import test from 'node:test';import assert from 'node:assert/strict';
import {validateContourPayload} from '../../pipeline/labels/packed-contour-store.js';
const packet={version:1,encoding:'delta2-varint',scale:1000,pathCount:2,tiers:[{zoom:0,ids:[1]},{zoom:4.5,ids:[0]}]},paths=[{id:0,zoom:4.5},{id:1,zoom:0}];
test('payload ownership exactly matches authored path identities and contour tiers',()=>{
 assert.doesNotThrow(()=>validateContourPayload(packet,paths));
 for(const data of [{...packet,version:2},{...packet,scale:100},{...packet,pathCount:3},{...packet,tiers:[{zoom:0,ids:[1]},{zoom:4.5,ids:[1]}]},{...packet,tiers:[{zoom:0,ids:[0]},{zoom:4.5,ids:[1]}]}])assert.throws(()=>validateContourPayload(data,paths),/contour/i);
 assert.throws(()=>validateContourPayload(packet,[...paths,{id:2,zoom:0}]),/contour/i);
});

import {PackedContourStore} from '../../pipeline/labels/packed-contour-store.js';
import {execFileSync} from 'node:child_process';
function storeFixture(){
 const script=execFileSync('python3',['-c',"import sys;sys.path.insert(0,'pipeline');from cartography.contour_payload import pack_contours;print(pack_contours('<svg><g class=\"contours\"><path d=\"M0.000,0.000 1.000,1.000\"/></g></svg>')[1])"],{encoding:'utf8'}),packet=JSON.parse(script.slice(script.indexOf('>')+1,script.lastIndexOf('</script>'))),attrs=new Map([['data-packed-contour','0'],['d','']]);
 const path={closest:()=>null,getAttribute:name=>attrs.get(name),setAttribute:(name,value)=>attrs.set(name,value)},svg={};
 return {path,attrs,store:new PackedContourStore(svg,{width:500},'worker source',packet,[path])};
}
test('pagehide preserves a cached page but closes final geometry resources',async()=>{
 const old=globalThis.window;globalThis.window=new EventTarget();const {store}=storeFixture();
 try{window.dispatchEvent(Object.assign(new Event('pagehide'),{persisted:true}));assert.equal(store.closed,undefined);window.dispatchEvent(Object.assign(new Event('pagehide'),{persisted:false}));assert.equal(store.closed,true);assert.equal(store.client.closed,true);}finally{store.close();globalThis.window=old;}
});
test('closing between decode and native hydration prevents detached-source mutation',async()=>{
 const old=globalThis.window;globalThis.window=new EventTarget();const {store,path,attrs}=storeFixture();
 try{await store.get(path);const pending=store.hydrate(path);store.close();await assert.rejects(pending,{name:'AbortError'});assert.equal(attrs.get('d'),'');}finally{store.close();globalThis.window=old;}
});
