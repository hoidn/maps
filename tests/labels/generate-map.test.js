import test from 'node:test';
import assert from 'node:assert/strict';
import {parseGenerateArgs} from '../../scripts/generate-map.mjs';
test('selected bounds drive generation without a configured region',()=>{
 const request=parseGenerateArgs(['--title','New area','--bbox=-118.45,34.10,-117.42,34.55','--cached']);
 assert.deepEqual(request.bbox,[-118.45,34.1,-117.42,34.55]);assert.equal(request.cached,true);
 assert.equal(request.id,undefined);
 for(const args of [[],['--title','X','--bbox=1,2,3'],['--title','X','--bbox=NaN,2,3,4'],['--title','X','--bbox=4,2,3,4'],['--title','X','--bbox=1,2,3,4','--id','../x']])assert.throws(()=>parseGenerateArgs(args));
});
