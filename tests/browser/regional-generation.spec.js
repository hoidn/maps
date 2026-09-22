import {test,expect} from '@playwright/test';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
let directory;
test.beforeAll(async()=>{
 directory=await mkdtemp(join(tmpdir(),'regional-generation-'));
 const python=process.env.MAP_PYTHON||resolve('.venv/bin/python');
 execFileSync(python,[resolve('tests/support/build-fixture.py'),directory,'--regional']);
 for(const mode of ['interactive','static'])execFileSync(python,[resolve('pipeline/build_region.py'),'--map',join(directory,'custom-region.json'),'--mode',mode],{cwd:directory});
});
test.afterAll(async()=>{await rm(directory,{recursive:true,force:true})});
test('generated regional explorer works offline with its original feature anchors',async({page})=>{
 const requests=[],errors=[];
 await page.route('http**/*',route=>{requests.push(route.request().url());return route.abort()});
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto(pathToFileURL(join(directory,'sequoia_trails_interactive.html')).href);
 await page.evaluate(()=>mapLayout.whenSettled());
 expect(await page.locator('#mapsvg').getAttribute('viewBox')).toBe('0 0 800 600');
 const anchor=await page.evaluate(()=>mapLayout.manifest.features.find(f=>f.sourceId==='osm:synthetic:peak').anchor);
 expect(anchor[0]).toBeCloseTo(160);expect(anchor[1]).toBeCloseTo(80);
 await page.locator('#zin').click();await page.evaluate(()=>mapLayout.whenSettled());
 expect((await page.locator('#mapsvg').getAttribute('viewBox')).split(' ')[2]*1).toBeLessThan(800);
 await page.locator('.layers summary').click();await page.locator('[data-layer="no-water"]').uncheck();
 await expect(page.locator('#mapsvg')).toHaveClass(/no-water/);
 await page.locator('#zreset').click();await page.evaluate(()=>mapLayout.whenSettled());
 expect((await page.locator('#mapsvg').getAttribute('viewBox')).split(' ')[2]*1).toBe(800);
 expect(errors).toEqual([]);expect(requests).toEqual([]);
});
test('regional static finalizes with the normal policy and opens without JavaScript',async({browserName,browser})=>{
 test.skip(browserName!=='chromium','One finalization checks all three browser engines');
 test.setTimeout(120000);
 const {finalizeStatic}=await import('../../scripts/finalize-static.mjs');
 const output=join(directory,'frozen.html');
 const result=await finalizeStatic({input:join(directory,'sequoia_trails_static.html'),output,reportDir:join(directory,'reports')});
 expect(result.audits).toHaveLength(6);expect(result.audits.every(a=>a.status==='pass')).toBe(true);
 const html=await readFile(output,'utf8');expect(html).not.toContain('id="map-layout-runtime"');
 const context=await browser.newContext({javaScriptEnabled:false});
 try{
  const page=await context.newPage(),requests=[];
  await page.route('http**/*',route=>{requests.push(route.request().url());return route.abort()});
  await page.goto(pathToFileURL(output).href);
  await expect(page.locator('#mapsvg')).toBeVisible();
  await expect(page.locator('#mapsvg [data-layout-id]').filter({hasText:'Synthetic Camp'})).toBeVisible();
  await expect(page.locator('.ctl')).toHaveCount(0);expect(requests).toEqual([]);
 }finally{await context.close()}
});
