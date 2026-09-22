import {test,expect,chromium,firefox,webkit} from '@playwright/test';
import {build} from 'esbuild';
import {fixtureHTML} from '../support/browser-fixture.js';

const scale=5.511815693430657;
// Exact source paths/font sizes from the failed 1:50k San Gabriel placements.
const cases=[
 {id:'road',text:'228th Street East',d:'M919.258,93.876 919.342,100.472 919.286,100.675 919.324,110.972 919.364,111.302 919.460,111.638 919.516,122.611',size:1.93524,weight:600,offset:8.164278895576766,style:'l-road'},
 {id:'ref',text:'270',d:'M566.921,630.367 566.936,626.228 566.907,624.356',size:2.17714,weight:700,offset:3.0056258964911815,style:'l-road-ref'},
];
let bundle,prefix;
test.beforeAll(async()=>{
 bundle=(await build({stdin:{contents:"export * from './pipeline/labels/line-candidates.js';",resolveDir:process.cwd()},bundle:true,format:'iife',globalName:'lineAdapter',write:false})).outputFiles[0].text;
 const html=await fixtureHTML();prefix=html.slice(0,html.indexOf('<div class="map-wrap">'));
});
function fixture(physical){
 // The native case expresses the same painted paths directly in CSS-sized units.
 const factor=physical?1:scale,viewWidth=1300*factor,viewHeight=685*factor;
 return prefix+`<svg viewBox="0 0 ${viewWidth} ${viewHeight}" style="width:${1300*scale}px;height:${685*scale}px;max-width:none"><defs>${cases.map(c=>`<path id="${c.id}-path" d="${c.d.replace(/\d+(?:\.\d+)?/g,n=>String(Number(n)*factor))}"/>`).join('')}</defs>${cases.map(c=>`<g id="${c.id}"><text dy="${-4/scale*factor}" data-layout-authored-dy="-4" style="font-family:'Source Sans 3';font-size:${c.size*factor}px;font-weight:${c.weight};stroke:white;stroke-width:${.508*factor}px;stroke-linejoin:round;paint-order:stroke"><textPath href="#${c.id}-path" startOffset="${c.offset*factor}" text-anchor="middle">${c.text}</textPath></text></g>`).join('')}</svg>`;
}
async function mount(page,html){
 await page.setContent(html);await page.addScriptTag({content:bundle});
 await page.evaluate(async()=>{for(const t of document.querySelectorAll('text'))await document.fonts.load(getComputedStyle(t).font,t.textContent);await document.fonts.ready;});
}
test('Chromium line candidates stay upright across engines at native and physical scale',async({browserName})=>{
 test.skip(browserName!=='chromium','One differential test applies identical candidates in all engines.');
 for(const physical of [true,false]){
  let candidates;
  for(const [name,engine] of Object.entries({chromium,firefox,webkit})){
   const browser=await engine.launch();
   try{
    const page=await browser.newPage();await mount(page,fixture(physical));
    candidates??=await page.evaluate(cases=>cases.map(c=>({id:c.id,candidates:lineAdapter.buildLineCandidates({annotation:{id:c.id,geometryId:c.id+'-path',style:c.style},element:document.getElementById(c.id),policy:{maxLineCandidates:24}})})),cases);
    for(const row of candidates)expect(row.candidates.length,row.id).toBeGreaterThan(0);
    const bad=await page.evaluate(rows=>rows.flatMap(row=>row.candidates.flatMap(c=>{
     const e=document.getElementById(row.id);lineAdapter.applyLineCandidate(e,c);const t=e.querySelector('text'),m=t.getScreenCTM(),base=Math.atan2(m.b,m.a)*180/Math.PI;
     return Array.from({length:t.getNumberOfChars()},(_,i)=>({id:row.id,candidate:c.id,char:i,angle:((t.getRotationOfChar(i)+base+540)%360)-180})).filter(g=>Math.abs(g.angle)>90+1e-5);
    })),candidates);
    expect(bad,`${name}, ${physical?'physical':'native'}`).toEqual([]);
   }finally{await browser.close();}
  }
 }
});

test('a backwards segment only excludes the occupied window including its ink reserve',async({page})=>{
 await mount(page,prefix+'<svg width="600" height="200"><defs><path id="path" d="M20,100 L220,100 L219,101 L520,101"/></defs><g id="label"><text font-family="Source Sans 3" font-size="12" stroke="white" stroke-width="2"><textPath href="#path" startOffset="175" text-anchor="end">Road</textPath></text></g></svg>');
 const result=await page.evaluate(()=>{
  const e=document.getElementById('label'),annotation={id:'label',geometryId:'path'},options={annotation,element:e,policy:{maxLineCandidates:1}},before=e.outerHTML;
  const clear=lineAdapter.buildLineCandidates(options),reserved=lineAdapter.buildLineCandidates({...options,policy:{...options.policy,measurementReserves:{label:{left:0,top:30,right:0,bottom:0}}}});
  return {clear:clear.length,reserved:reserved.length,restored:e.outerHTML===before,path:document.getElementById('path').getAttribute('d')};
 });
 expect(result.clear).toBeGreaterThan(0);expect(result.reserved).toBe(0);expect(result.restored).toBe(true);expect(result.path).toBe('M20,100 L220,100 L219,101 L520,101');
});
