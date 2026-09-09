import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const metricPath=path.resolve('pipeline/labels/measure.js');
test('measures parent transforms, multiline paint and curved glyph footprints',async({page})=>{
 await page.setContent('<svg width="600" height="400"><defs><path id="curve" d="M10,160 Q160,20 320,160"/></defs><g transform="translate(40,20) rotate(25)"><g id="label"><text x="20" y="40" style="font:italic 20px serif;stroke:black;stroke-width:4">Élévation<tspan x="20" dy="24">é 2,500 ft</tspan></text></g></g><g id="curved"><text font-size="16"><textPath href="#curve">Colorado River</textPath></text></g></svg>');
 const source=await fs.readFile(metricPath,'utf8');
 await page.addScriptTag({content:source.replaceAll('export ','')+'\nwindow.measureElement=measureElement;'});
 const result=await page.evaluate(()=>({point:measureElement(document.querySelector('#label')),curve:measureElement(document.querySelector('#curved'))}));
 expect(result.point.parts.length).toBeGreaterThan(0);
 expect(result.point.bounds.width).toBeGreaterThan(60);
 expect(result.curve.parts.length).toBeGreaterThan(2);
 expect(result.curve.bounds.width).toBeGreaterThan(20);
 const screenshot=await page.screenshot();
 const check=spawnSync('.venv/bin/python',['-c',`import sys,json,base64,io
from PIL import Image
j=json.load(sys.stdin); im=Image.open(io.BytesIO(base64.b64decode(j['png']))).convert('RGB')
parts=j['parts']; missed=[]; painted=0
for y in range(im.height):
 for x in range(im.width):
  if min(im.getpixel((x,y)))<220:
   painted+=1
   if not any(p['x']-1<=x<=p['x']+p['width']+1 and p['y']-1<=y<=p['y']+p['height']+1 for p in parts): missed.append([x,y])
print(json.dumps({'painted':painted,'missed':len(missed),'examples':missed[:3]}))`],{input:JSON.stringify({png:screenshot.toString('base64'),parts:[...result.point.parts,...result.curve.parts]}),encoding:'utf8'});
 expect(check.status,check.stderr).toBe(0);
 const pixels=JSON.parse(check.stdout);expect(pixels.painted).toBeGreaterThan(100);expect(pixels.missed,JSON.stringify(pixels)).toBe(0);
});
test('missing declared fonts is an explicit error',async({page})=>{
 const source=await fs.readFile(metricPath,'utf8');
 await page.addScriptTag({content:source.replaceAll('export ','')+'\nwindow.ensureFonts=ensureFonts;'});
 expect(await page.evaluate(()=>ensureFonts(['Source Sans 3']).then(()=>null,e=>e.message))).toContain('Missing font');
});
test('embedded font faces load without network access',async({page})=>{
 const directory=path.resolve('pipeline/labels/fonts');
 let css=await fs.readFile(path.join(directory,'fonts.css'),'utf8');
 const assets=JSON.parse(await fs.readFile(path.join(directory,'manifest.json'),'utf8'));
 for(const name of Object.keys(assets)) css=css.replaceAll('url('+name+')','url(data:font/ttf;base64,'+(await fs.readFile(path.join(directory,name))).toString('base64')+')');
 await page.route('**/*',route=>route.abort());
 await page.setContent('<style>'+css+'</style><svg><text style="font:12px Source Sans 3">Phantom Ranch</text></svg>');
 const source=await fs.readFile(metricPath,'utf8');
 await page.addScriptTag({content:source.replaceAll('export ','')+'\nwindow.ensureFonts=ensureFonts;'});
 expect(await page.evaluate(()=>ensureFonts().then(()=>[...document.fonts].every(f=>f.status==='loaded')))).toBe(true);
});

test('text exceeding its textPath is rejected',async({page})=>{
 await page.setContent('<svg><defs><path id="tiny" d="M10,100 L30,100"/></defs><g id="bad"><text font-size="24"><textPath href="#tiny">Overflow long label</textPath></text></g></svg>');
 const source=await fs.readFile(metricPath,'utf8');
 await page.addScriptTag({content:source.replaceAll('export ','')+'\nwindow.measureElement=measureElement;'});
 expect(await page.evaluate(()=>{try{measureElement(document.querySelector('#bad'));return null;}catch(e){return e.message;}})).toContain('path overflow');
});
