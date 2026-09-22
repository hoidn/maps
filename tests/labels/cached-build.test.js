import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,copyFile,mkdir,rm,cp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
async function checkout(callback){
 const root=await mkdtemp(join(tmpdir(),'map-cache-check-'));try{
  const dir=join(root,'pipeline');await mkdir(dir);
  for(const name of ['build_maps.sh','map_spec.py'])await copyFile('pipeline/'+name,join(dir,name));
  await cp('pipeline/maps',join(dir,'maps'),{recursive:true});
  await callback((args=[])=>spawnSync('bash',[join(dir,'build_maps.sh'),...args],{encoding:'utf8',env:{...process.env,MAP_PYTHON:process.env.MAP_PYTHON||resolve('.venv/bin/python')}}));
 }finally{await rm(root,{recursive:true});}
}
test('cached build lists missing legacy inputs before any fetch or builder',()=>checkout(run=>{
 const result=run();assert.equal(result.status,1);
 for(const name of ['osm.json','osm2.json','dem.npy','terrain.json','dem_hi.npy','terrain_hi.json'])assert(result.stderr.includes(name));
 assert(result.stderr.includes('run_all.sh'));assert(!result.stderr.includes('build-labels'));assert.equal(result.stdout,'');
}));
test('explicit regional preflight requires only its own essentials',()=>checkout(run=>{
 const result=run(['--map','san_gabriel']);assert.equal(result.status,1);
 for(const name of ['features.json','dem.npy','dem.json'])assert(result.stderr.includes('cache/san_gabriel/'+name),result.stderr);
 for(const name of ['grand_canyon','osm.json','terrain.json','dem_hi.npy','run_all.sh'])assert(!result.stderr.includes(name),result.stderr);
 assert(result.stderr.includes('fetch_region.py --map san_gabriel'));assert.equal(result.stdout,'');
}));
test('map selection rejects invalid arguments before preflight',()=>checkout(run=>{
 for(const args of [['--map'],['--map','unknown'],['--map','../sequoia'],['--unknown'],['--map','sequoia','extra'],['--map','sequoia','--map','san_gabriel']]){
  const result=run(args);assert.equal(result.status,2,JSON.stringify(args)+result.stderr);
  assert.match(result.stderr,/Usage:|Unknown map/);assert(!result.stderr.includes('Missing cached build inputs'));assert.equal(result.stdout,'');
 }
}));
