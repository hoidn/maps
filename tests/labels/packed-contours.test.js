import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {decodeContourTier,contourPathString} from '../../pipeline/labels/packed-contours.js';
function fixture(d='M-2.125,3.000 4.500,5.001M6.250,7.125 6.500,7.000'){
 const script=execFileSync('python3',['-c',"import sys,json;sys.path.insert(0,'pipeline');from cartography.contour_payload import pack_contours;print(pack_contours('<svg><g class=\"contours\"><path d=\"'+sys.argv[1]+'\"/></g></svg>')[1])",d],{encoding:'utf8'});
 return JSON.parse(script.slice(script.indexOf('>')+1,script.lastIndexOf('</script>'))).tiers[0];
}
test('Python packed paths recover exact authored coordinates and native source text',async()=>{
 const d='M-2.125,3.000 4.500,5.001M6.250,7.125 6.500,7.000',items=await decodeContourTier(fixture(d));
 assert.equal(items.length,1);assert.equal(items[0].id,0);assert.equal(contourPathString(items[0]),d);
 assert.ok(items[0].runs[0].points instanceof Float64Array);assert.deepEqual([...items[0].runs[0].points],[-2.125,3,4.5,5.001]);
 assert.deepEqual(items[0].bounds,{x:-2.125,y:3,width:8.625,height:4.125});
 assert.deepEqual(items[0].runs[1].chunks,[{start:0,end:4,bounds:{x:6.25,y:7,width:.25,height:.125}}]);
});
test('corrupted, truncated and inconsistent payloads cannot publish geometry',async()=>{
 const tier=fixture();for(const bad of [{...tier,data:tier.data.slice(0,-4)},{...tier,crc32:tier.crc32^1},{...tier,ids:[9]},{...tier,coordinates:tier.coordinates+2},{...tier,data:'!!!!'}])await assert.rejects(decodeContourTier(bad),/contour/i);
});
test('closed decode aborts and fallback decoding yields during large source work',async()=>{
 const signal=AbortSignal.abort();await assert.rejects(decodeContourTier(fixture(),{signal}),{name:'AbortError'});
 const d='M'+Array.from({length:9000},(_,i)=>`${(i/1000).toFixed(3)},${(i/2000).toFixed(3)}`).join(' ');let pauses=0,time=0;
 const items=await decodeContourTier(fixture(d),{now:()=>time+=9,yieldControl:async()=>{pauses++;}});assert.ok(pauses>2);assert.equal(contourPathString(items[0]),d);
});

import {crc32} from 'node:zlib';
test('valid checksums cannot hide malformed integers, coordinates or trailing geometry',async()=>{
 const original=fixture('M0.000,0.000 1.000,1.000'),header=[67,84,80,49];
 const cases=[
  [...header,128,0],
  [...header,1,0,1,3,0,0,0],
  [...header,1,0,1,4,0,0,0,128],
  [...header,1,0,1,4,255,255,255,255,255,255,255,127,0,0,0],
  [...Buffer.from(original.data,'base64'),0],
  [0,84,80,49,1,0,1,4,0,0,0,0]
 ];
 for(const bytes of cases){const raw=Buffer.from(bytes),tier={...original,bytes:raw.length,data:raw.toString('base64'),crc32:crc32(raw)};await assert.rejects(decodeContourTier(tier),/contour/i);}
});
