import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,copyFile,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
test('cached build lists missing inputs before attempting any fetch or builder',async()=>{
 const root=await mkdtemp(join(tmpdir(),'map-cache-check-'));try{
  const dir=join(root,'pipeline');await mkdir(dir);await copyFile('pipeline/build_maps.sh',join(dir,'build_maps.sh'));
  const result=spawnSync('bash',[join(dir,'build_maps.sh')],{encoding:'utf8'});
  assert.equal(result.status,1);for(const name of ['osm.json','osm2.json','dem.npy','terrain.json','dem_hi.npy','terrain_hi.json'])assert(result.stderr.includes(name));
  assert(result.stderr.includes('run_all.sh'));assert(!result.stderr.includes('build-labels'));assert.equal(result.stdout,'');
 }finally{await rm(root,{recursive:true});}
});
