import {test,expect} from '@playwright/test';
import {mkdtemp,readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {finalizeStatic} from '../../scripts/finalize-static.mjs';
import {exportPdf} from '../../scripts/print-map.mjs';
import {generateMap} from '../../scripts/generate-map.mjs';
test('physical PDF keeps vectors, embedded text, page size and calibration; failure preserves destination',async({browserName})=>{
 test.skip(browserName!=='chromium','PDF export uses Chromium');test.setTimeout(240000);
 const dir=await mkdtemp(join(tmpdir(),'map-print-pdf-')),python=resolve('.venv/bin/python');
 execFileSync(python,['tests/support/build-fixture.py',dir,'--regional']);
 for(const paper of ['36x24in','96x60in']){
  const input=join(dir,'input.html'),frozen=join(dir,'frozen.html'),output=join(dir,paper+'.pdf');
  execFileSync(python,[resolve('pipeline/build_region.py'),'--map',join(dir,'custom-region.json'),'--mode','static','--print','--paper',paper,'--output',input],{cwd:dir});
  const finalization=await finalizeStatic({input,output:frozen,reportDir:join(dir,paper)});
  const report=await exportPdf({input:frozen,output,finalization,python});
  expect(report.pdf.pages).toBe(1);expect(report.pdf.vectorPaths).toBeGreaterThan(0);
  expect(report.pdf.textOperations).toBeGreaterThan(0);expect(report.pdf.calibrationMm).toBeCloseTo(100,0);
  expect(report.pdf.mapVectorPaths).toBeGreaterThan(0);expect(report.pdf.mapTextOperations).toBeGreaterThan(0);
  expect(report.pdf.fontsEmbedded).toBe(true);
  if(paper==='36x24in'){
   const badOutput=join(dir,'occupied.pdf'),sidecar=join(dir,'occupied.print.json');await mkdir(badOutput);await writeFile(sidecar,'old report');
   await expect(exportPdf({input:frozen,output:badOutput,finalization,python})).rejects.toThrow();expect(await readFile(sidecar,'utf8')).toBe('old report');
   const originalHtml=await readFile(frozen,'utf8'),rasterized=join(dir,'rasterized.html');await writeFile(rasterized,originalHtml.replace('</head>','<style>[data-print-map]{filter:blur(.1px)}</style></head>'));
   const hash=createHash('sha256').update(await readFile(rasterized)).digest('hex'),report=structuredClone(finalization);report.artifactSha256=hash;for(const audit of report.audits)audit.artifactSha256=hash;
   await expect(exportPdf({input:rasterized,output,finalization:report,python})).rejects.toThrow(/map interior/);
  }
  const original=await readFile(output);await writeFile(frozen,(await readFile(frozen,'utf8')).replace('100 mm calibration','missing bar').replace('id="print-calibration"','id="missing"'));
  const hash=createHash('sha256').update(await readFile(frozen)).digest('hex');finalization.artifactSha256=hash;for(const audit of finalization.audits)audit.artifactSha256=hash;
  await expect(exportPdf({input:frozen,output,finalization,python})).rejects.toThrow();
  expect(await readFile(output)).toEqual(original);
 }
});

test('a selected area absent from the region registry generates HTML and PDF with no manual spec',async({browserName})=>{
 test.skip(browserName!=='chromium','Generation finalizes in all three engines');test.setTimeout(240000);
 const dir=await mkdtemp(join(tmpdir(),'map-selected-area-')),python=resolve('.venv/bin/python'),id='test_area_'+randomUUID().replaceAll('-','');
 try{
  // Seed explicitly synthetic provider caches only. The public command must create the spec.
  execFileSync(python,['tests/support/build-fixture.py',dir,'--regional']);
  execFileSync(python,['-c',`import sys,json,shutil
from pathlib import Path
sys.path.insert(0,sys.argv[1]);from map_spec import MapSpec
from sources.catalog import atomic_json,record_source
source=Path(sys.argv[2])/'cache/sequoia';target=Path(sys.argv[1])/'cache'/sys.argv[3];shutil.copytree(source,target)
spec=MapSpec.for_extent('Selected Area Test',[-118.2,34.1,-118.1,34.175],map_id=sys.argv[3])
for name in ['features.json','dem.json']:
 p=target/name;d=json.loads(p.read_text());d['frame']=spec.frame;atomic_json(p,d)
record_source(target/'features.json',provider='Synthetic OSM fixture',url='synthetic:test-fixture',retrieved_at='2026-01-01T00:00:00Z',dataset_version='synthetic-test-only',bbox=spec.bbox)`,resolve('pipeline'),dir,id]);
  const report=await generateMap({title:'Selected Area Test',bbox:[-118.2,34.1,-118.1,34.175],id,cached:true,paper:'36x24in',output:join(dir,'selected.pdf')});
  expect(report.status).toBe('pass');expect(report.sourceInventory.missing).toContain('gnis');
  const spec=JSON.parse(await readFile(resolve('pipeline/cache',id,'map.json'),'utf8'));
  expect(spec.title).toBe('Selected Area Test');expect(spec.sources).toContain('3dep');
  for(const mode of ['interactive','static_final'])expect((await readFile(resolve('pipeline',id+'_trails_'+mode+'.html'),'utf8')).includes('Selected Area Test')).toBe(true);
 }finally{
  await rm(resolve('pipeline/cache',id),{recursive:true,force:true});
  for(const mode of ['interactive','static','static_final'])await rm(resolve('pipeline',id+'_trails_'+mode+'.html'),{force:true});
 }
});
