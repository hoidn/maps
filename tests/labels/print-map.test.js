import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,symlink,rm} from 'node:fs/promises';
import {join,resolve,relative} from 'node:path';
import {tmpdir} from 'node:os';
import {parsePrintArgs,exportPdf,printMap} from '../../scripts/print-map.mjs';
test('print command rejects unsafe outputs and malformed requests before building',()=>{
 assert.equal(parsePrintArgs(['--map','san_gabriel']).map,'san_gabriel');
 for(const args of [[],['--map','../x'],['--map','x','--scale','NaN'],['--map','x','--scale','0'],['--map','x','--paper','97x24in'],['--map','x','--output','pipeline/x.html'],['--map','x','--unknown']])assert.throws(()=>parsePrintArgs(args));
 assert.equal(parsePrintArgs(['--map','sequoia','--scale','50000']).scale,50000);
});
test('neither PDF nor its sibling report may replace a supplied input',async()=>{
 assert.throws(()=>parsePrintArgs(['--map','/tmp/area.print.json','--output','/tmp/sub/../area.pdf']),/input/);
 await assert.rejects(exportPdf({input:'/tmp/area.print.json',output:'/tmp/area.pdf'}),/input/);
 const dir=await mkdtemp(join(tmpdir(),'print-paths-'));
 try{
  await writeFile(join(dir,'area.print.json'),JSON.stringify({id:'print_source',title:'Test',bbox:[0,0,1,1]}));
  await assert.rejects(printMap({map:relative(process.cwd(),join(dir,'area.print.json')),output:join(dir,'area.pdf')}),/every input/);
  await symlink(join(dir,'area.print.json'),join(dir,'source.json'));
  assert.throws(()=>parsePrintArgs(['--map',join(dir,'source.json'),'--output',join(dir,'area.pdf')]),/input/);
  await symlink(resolve('pipeline'),join(dir,'alias'));
  assert.throws(()=>parsePrintArgs(['--map','san_gabriel','--output',join(dir,'alias','new-folder','area.pdf')]),/outside/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
