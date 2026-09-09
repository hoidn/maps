import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fixtureHTML} from '../support/browser-fixture.js';
const metricPath=path.resolve('pipeline/labels/measure.js');
test('Canvas glyph ink stays inside each measured wrapped line at fractional font sizes',async({page})=>{
 await page.setContent(await fixtureHTML());
 await page.evaluate(()=>document.querySelector('#mapsvg').innerHTML='<g id="ink"><text x="40" y="40" style="font-size:14.4307px;font-weight:600;stroke:black;stroke-width:2.8px;stroke-linejoin:round"><tspan data-layout-primary x="40" dy="0">Cliff</tspan><tspan data-layout-primary x="40" dy="1.12em">Spring</tspan></text></g>');
 const source=await fs.readFile(metricPath,'utf8');
 await page.addScriptTag({content:source.replaceAll('export ','')+'\nwindow.measureElement=measureElement;window.ensureFonts=ensureFonts;'});
 await page.evaluate(()=>ensureFonts());
 const result=await page.evaluate(()=>{
  const e=document.getElementById('ink'),measured=measureElement(e,0,{canvasInk:true}),svg=measureElement(e),context=document.createElement('canvas').getContext('2d'),missed=[];
  [...e.querySelectorAll('tspan')].forEach((span,line)=>{
   const style=getComputedStyle(span);context.font=`${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;context.fontKerning='none';
   for(let i=0;i<span.getNumberOfChars();i++){
    const at=span.getStartPositionOfChar(i),ink=context.measureText(span.textContent[i]),m=span.getScreenCTM(),halo=parseFloat(style.strokeWidth)/2,b=measured.parts[line];
    const left=m.a*(at.x-ink.actualBoundingBoxLeft)+m.e-halo,right=m.a*(at.x+ink.actualBoundingBoxRight)+m.e+halo;
    if(left<b.x-1e-7||right>b.x+b.width+1e-7)missed.push({line,char:span.textContent[i],left,right,b});
   }
  });
  return {measured,svg,missed};
 });
 expect(result.measured.parts).toHaveLength(2);
 expect(result.measured.parts[0].width).toBeLessThan(result.measured.parts[1].width);
 expect(result.missed).toEqual([]);
});
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

test('wrapped point footprints preserve blank space beside short lines and secondary paint',async({page})=>{
 await page.setContent('<svg width="600" height="300"><g id="wrapped" transform="translate(40,20)"><text x="0" y="40" style="font:italic 20px serif;stroke:black;stroke-width:2;stroke-linejoin:round"><tspan data-layout-primary x="0" dy="0">Long campground name</tspan><tspan data-layout-primary x="0" dy="25">Camp</tspan><tspan x="0" dy="22" style="font-size:12px">2,500 ft</tspan></text></g></svg>');
 const source=await fs.readFile(metricPath,'utf8');
 await page.addScriptTag({content:source.replaceAll('export ','')+'\nwindow.measureElement=measureElement;'});
 const result=await page.evaluate(()=>measureElement(document.querySelector('#wrapped')));
 expect(result.parts).toHaveLength(3);
 expect(result.parts[1].width).toBeLessThan(result.parts[0].width/2);
 expect(result.parts[2].y).toBeGreaterThan(result.parts[1].y);
 const screenshot=await page.screenshot();
 const check=spawnSync('.venv/bin/python',['-c',`import sys,json,base64,io
from PIL import Image
j=json.load(sys.stdin); im=Image.open(io.BytesIO(base64.b64decode(j['png']))).convert('RGB')
missed=painted=0
for y in range(im.height):
 for x in range(im.width):
  if min(im.getpixel((x,y)))<220:
   painted+=1
   if not any(p['x']-1<=x<=p['x']+p['width']+1 and p['y']-1<=y<=p['y']+p['height']+1 for p in j['parts']): missed+=1
print(json.dumps({'painted':painted,'missed':missed}))`],{input:JSON.stringify({png:screenshot.toString('base64'),parts:result.parts}),encoding:'utf8'});
 expect(check.status,check.stderr).toBe(0);
 const pixels=JSON.parse(check.stdout);expect(pixels.painted).toBeGreaterThan(100);expect(pixels.missed).toBe(0);
});
