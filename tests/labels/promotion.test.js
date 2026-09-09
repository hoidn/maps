import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {promotePair} from '../../scripts/verify-maps.mjs';
const setup=async()=>{const dir=await mkdtemp(join(tmpdir(),'map-promotion-'));const sources=['a','b'].map(n=>join(dir,n+'.candidate')),destinations=['a','b'].map(n=>join(dir,n+'.html'));for(let i=0;i<2;i++){await writeFile(sources[i],'new'+i);await writeFile(destinations[i],'old'+i);}return {dir,sources,destinations};};
test('failed verification preserves both delivered files',async()=>{const f=await setup();try{await assert.rejects(promotePair({...f,verify:async()=>{throw new Error('collision');}}),/collision/);assert.deepEqual(await Promise.all(f.destinations.map(p=>readFile(p,'utf8'))),['old0','old1']);}finally{await rm(f.dir,{recursive:true});}});
test('successful promotion copies exactly the verified bytes',async()=>{const f=await setup();try{const r=await promotePair({...f,verify:async paths=>{assert(paths.every(p=>p.endsWith('.html')));return {status:'pass'};}});assert.equal(r.hashes.length,2);assert.deepEqual(await Promise.all(f.destinations.map(p=>readFile(p,'utf8'))),['new0','new1']);assert.equal((await readdir(f.dir)).length,4);}finally{await rm(f.dir,{recursive:true});}});
test('source mutation after audit is rejected',async()=>{const f=await setup();try{await assert.rejects(promotePair({...f,verify:async()=>{await writeFile(f.sources[0],'changed');return {status:'pass'};}}),/changed/);assert.equal(await readFile(f.destinations[0],'utf8'),'old0');}finally{await rm(f.dir,{recursive:true});}});
test('failure replacing second destination rolls the first back',async()=>{const f=await setup();try{await assert.rejects(promotePair({...f,verify:async()=>({status:'pass'}),beforeReplace:async i=>{if(i===1)throw new Error('disk failure');}}),/disk failure/);assert.deepEqual(await Promise.all(f.destinations.map(p=>readFile(p,'utf8'))),['old0','old1']);assert.equal((await readdir(f.dir)).length,4);}finally{await rm(f.dir,{recursive:true});}});

test('late candidate mutation rejects and rolls back the pair',async()=>{const f=await setup();let snapshots;try{await assert.rejects(promotePair({...f,verify:async paths=>{snapshots=paths;return {status:'pass'};},beforeReplace:async i=>{if(i===1)await writeFile(snapshots[1],'unverified');}}),/changed/);assert.deepEqual(await Promise.all(f.destinations.map(p=>readFile(p,'utf8'))),['old0','old1']);}finally{await rm(f.dir,{recursive:true});}});
