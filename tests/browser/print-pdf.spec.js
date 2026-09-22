import {test,expect} from '@playwright/test';
import {mkdtemp,readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {finalizeStatic} from '../../scripts/finalize-static.mjs';
import {exportPdf} from '../../scripts/print-map.mjs';
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
