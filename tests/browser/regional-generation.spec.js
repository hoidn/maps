import {test,expect} from '@playwright/test';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {selectPlace,restoreUrl} from '../../scripts/fuzz-cartography.mjs';
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
async function fuzzFixture(page,{brokenRestore=false}={}){
 let html=await readFile(join(directory,'sequoia_trails_interactive.html'),'utf8');
 if(brokenRestore){expect(html).toContain('if(m){ var z=');html=html.replace('if(m){ var z=','if(false){ var z=');}
 await page.route('http://regional.test/**',route=>route.fulfill({contentType:'text/html',body:html}));
 await page.goto('http://regional.test/?renderer=svg');await page.evaluate(()=>mapLayout.whenSettled());
}
test('regional fuzz uses the real directory and restores the serialized camera',async({page})=>{
 await fuzzFixture(page);
 const selected={u:.99};await selectPlace(page,selected);
 expect(selected.selection).toMatchObject({sourceId:'osm:synthetic:peak',selected:selected.selection.featureId,name:'Synthetic Summit',details:'Synthetic Summit'});
 for(const zoom of [3.3373,14]){
  await page.evaluate(z=>{const l=mapLayout,{width:W,height:H}=l.manifest.map,w=W/z,h=w*H/W;l.requestView({x:W-w,y:H-h,w,h});return l.whenSettled();},zoom);
  const restored={};await restoreUrl(page,restored);
  expect(restored.hashRestore.before.hash).toMatch(/^#v=/);
  expect(restored.hashRestore.after).toEqual(restored.hashRestore.expected);
  expect(restored.hashRestore.after).not.toEqual(restored.hashRestore.before.view);
  expect(new URL(page.url()).search).toBe('?renderer=svg');
 }
});
test('regional fuzz rejects a directory event that does not select its feature',async({page})=>{
 await fuzzFixture(page);
 await page.evaluate(()=>mapLayout.select=()=>{});
 await expect(selectPlace(page,{u:.99})).rejects.toThrow(/Place selection/);
});
test('regional fuzz rejects a reload that loses the saved camera',async({page})=>{
 await fuzzFixture(page,{brokenRestore:true});
 await expect(restoreUrl(page,{})).rejects.toThrow(/Hash restore mismatch/);
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
