import {test,expect} from '@playwright/test';
import {build} from 'esbuild';
import {fixtureHTML} from '../support/browser-fixture.js';
let bundle;
test.beforeAll(async()=>{bundle=(await build({entryPoints:['pipeline/labels/line-candidates.js'],bundle:true,format:'iife',globalName:'lineAdapter',write:false})).outputFiles[0].text;});
// The five vertices retain the actual failing 3DHP shape; no real map is loaded.
const bent='M119.805,341.990 122.150,346.451 123.615,351.394 128.108,356.940 128.597,358.220';
async function fixture(page,{path=bent,dy=-4,name='Cave Creek',viewBox='100 320 65 57',fontFamily='Alegreya',fontStyle='italic',fontSize=1.55}={}){
 const css=(await fixtureHTML()).match(/<style>(.*?)<\/style>/s)[1];
 await page.setContent(`<style>${css}svg text{font-family:'${fontFamily}';font-style:${fontStyle};font-size:${fontSize}px;stroke:white;stroke-width:.264px;paint-order:stroke fill}body{margin:0}</style><svg width="650" height="570" viewBox="${viewBox}"><path id="curve" fill="none" stroke="blue" stroke-width=".05" d="${path}"/><g id="label"><text dy="${dy}"><textPath href="#curve" startOffset="50%" text-anchor="middle">${name}</textPath></text></g></svg>`);
 await page.evaluate(()=>document.fonts.ready);await page.addScriptTag({content:bundle});
}
for(const dy of [-4,4,-20])test(`offset curved text at dy ${dy} keeps complete names without compressed or scattered letters`,async({page})=>{
 await fixture(page,{dy,name:dy<0?'Cave Creek':'Meadow Brook'});
 const result=await page.evaluate(()=>{
  const e=document.querySelector('#label'),t=e.querySelector('text'),before=e.outerHTML,name=t.textContent,path=document.querySelector('#curve').getAttribute('d'),diagnostics={};
  const cs=lineAdapter.buildLineCandidates({annotation:{geometryId:'curve',style:'l-hydro'},element:e,diagnostics});
  const restored=e.outerHTML===before;let bad=0;const names=[],offsets=[];
  for(const c of cs){lineAdapter.applyLineCandidate(e,c);names.push(t.textContent);
   if(!t.querySelector('textPath'))continue;
   const m=t.getScreenCTM(),size=parseFloat(getComputedStyle(t).fontSize)*Math.hypot(m.a,m.b);
   offsets.push(parseFloat(t.getAttribute('dy'))*Math.hypot(m.a,m.b));
   for(let i=1;i<t.getNumberOfChars();i++){const a=t.getEndPositionOfChar(i-1),b=t.getStartPositionOfChar(i),dx=b.x-a.x,dy=b.y-a.y;
    if(Math.hypot(m.a*dx+m.c*dy,m.b*dx+m.d*dy)>Math.max(.25,size*.2)+1e-5)bad++;
   }
  }
  return {bad,count:cs.length,restored,name,names,offsets,pathUnchanged:document.querySelector('#curve').getAttribute('d')===path,diagnostics};
 });
 expect(result.bad).toBe(0);expect(result.count).toBeGreaterThan(0);expect(result.restored).toBe(true);expect(result.pathUnchanged).toBe(true);
 expect(new Set(result.names)).toEqual(new Set([result.name]));for(const offset of result.offsets)expect(offset).toBeCloseTo(dy,5);
 if(dy===-20)expect(result.diagnostics.legibilityRejected).toBeGreaterThan(0);
});
test('curved baseline offset stays in CSS pixels through committed clones and zoom changes',async({page})=>{
 await fixture(page);
 const result=await page.evaluate(()=>{
  let e=document.querySelector('#label');const source=e.outerHTML,read=()=>parseFloat(e.querySelector('text').getAttribute('dy'))*Math.hypot(e.querySelector('text').getScreenCTM().a,e.querySelector('text').getScreenCTM().b);
  const options=()=>({annotation:{geometryId:'curve',style:'l-hydro'},element:e});
  const first=lineAdapter.buildLineCandidates(options()).find(c=>c.startOffset!==undefined),restored=e.outerHTML===source;lineAdapter.applyLineCandidate(e,first);const before=read();
  const clone=e.cloneNode(true);e.replaceWith(clone);e=clone;document.querySelector('svg').setAttribute('viewBox','100 320 130 114');e.querySelector('text').style.fontSize='3.1px';
  const candidate=lineAdapter.buildLineCandidates(options()).find(c=>c.startOffset!==undefined);lineAdapter.applyLineCandidate(e,candidate);
  return {restored,before,after:read(),authored:e.querySelector('text').getAttribute('data-layout-authored-dy')};
 });
 expect(result.restored).toBe(true);expect(result.before).toBeCloseTo(-4,5);expect(result.after).toBeCloseTo(-4,5);expect(result.authored).toBe('-4');
});
test('gentle offset text keeps curved candidates instead of forcing every name straight',async({page})=>{
 await fixture(page,{path:'M110,340 Q120,342 135,355',dy:-.4});
 const result=await page.evaluate(()=>{const diagnostics={},cs=lineAdapter.buildLineCandidates({annotation:{geometryId:'curve',style:'l-hydro'},element:document.querySelector('#label'),diagnostics});return {curved:cs.filter(c=>c.startOffset!==undefined).length,diagnostics};});
 expect(result.curved).toBeGreaterThan(0);
});
test('Pima Street source path preserves contiguous complete letters near its junction bends',async({page})=>{
 // User screenshot: osm:way:171056820 / geometry-5834e4e8c1f7c9ef.
 const path='M421.911,818.774 422.230,818.072 422.670,817.726 424.404,816.620 426.010,815.180 427.313,813.907 428.122,813.479 428.845,813.344 429.424,813.144 430.424,812.419 430.923,811.834 431.623,811.999 431.775,812.070';
 await fixture(page,{path,name:'Pima Street',viewBox:'415 801 32.5 28.5',fontFamily:'Source Sans 3',fontStyle:'normal',fontSize:.825});
 const result=await page.evaluate(()=>{
  const e=document.querySelector('#label'),t=e.querySelector('text'),before=e.outerHTML,cs=lineAdapter.buildLineCandidates({annotation:{geometryId:'curve',style:'l-road'},element:e}),restored=e.outerHTML===before;
  let bad=0,largest=0;const names=[],offsets=[];
  for(const c of cs){lineAdapter.applyLineCandidate(e,c);names.push(t.textContent);if(!t.querySelector('textPath'))continue;
   const m=t.getScreenCTM(),scale=Math.hypot(m.a,m.b);offsets.push(parseFloat(t.getAttribute('dy'))*scale);
   for(let i=1;i<t.getNumberOfChars();i++){const a=t.getEndPositionOfChar(i-1),b=t.getStartPositionOfChar(i),gap=Math.hypot(b.x-a.x,b.y-a.y)*scale;largest=Math.max(largest,gap);if(gap>parseFloat(getComputedStyle(t).fontSize)*scale*.2+.00001)bad++;}
  }
  return {count:cs.length,bad,largest,names,offsets,restored};
 });
 expect(result.count).toBeGreaterThan(0);expect(result.bad).toBe(0);expect(result.restored).toBe(true);expect(new Set(result.names)).toEqual(new Set(['Pima Street']));
 for(const offset of result.offsets)expect(offset).toBeCloseTo(-4,5);
});

test('High Sierra Trail source window keeps every glyph joined at deep zoom',async({page})=>{
 // Confirmed source reproduction: osm:way:505209745 / geometry-de429deb6cf65267.
 // The user crop has no camera metadata; this does not claim its exact label ID.
 const path="M690.515,499.961 691.224,499.436 693.967,498.470 695.234,498.418 696.133,498.599 697.069,498.945 697.546,499.018 698.812,499.054 700.308,498.989 701.271,498.472 702.492,497.517 705.538,496.125 706.723,496.545 707.070,497.315 708.093,498.590 708.554,499.931 708.818,501.762 709.053,502.838 709.684,503.154 711.291,503.199 712.044,503.723 713.016,503.878 714.448,504.405 714.732,505.237 714.998,506.777 715.301,507.428 716.210,507.988 717.403,508.560 718.964,508.781 720.394,508.714 721.090,508.263 721.725,507.689 722.376,507.204 723.101,506.857 725.258,506.298 726.277,506.580 727.963,506.743 728.854,506.530 729.801,506.834 731.985,507.180 732.819,506.934 733.085,506.989 733.829,506.716 734.150,506.707 734.315,506.762 734.590,507.044 735.075,507.711 735.663,507.802 736.628,507.280 737.361,507.262 737.811,507.026 738.141,507.289 738.655,507.343 739.004,507.307 739.545,507.871 740.353,509.290 740.848,510.291 741.610,511.236 742.693,511.491 742.950,511.710 743.078,512.046 743.921,512.586 744.344,513.574 745.097,514.693 746.013,515.140 746.776,515.375 747.519,515.821 748.226,515.848 748.740,515.693 749.088,515.102 750.143,513.638 751.951,512.246 752.074,511.992 752.078,511.729 752.199,511.373 752.262,510.692 752.542,510.582 752.842,510.688 752.979,510.645 753.493,511.000 753.943,510.918 754.411,510.663 754.667,510.363 754.970,510.182 755.383,510.263 755.631,510.409 755.713,511.773 755.622,512.555 755.695,513.383 755.823,513.674 756.053,513.793 756.815,513.947 757.081,514.311 757.448,516.630 757.650,516.830 758.035,517.003 759.155,517.285 759.879,517.276 760.476,516.976 761.008,516.576 761.219,516.466 761.467,516.485 761.586,516.676 761.870,517.949 762.054,518.331 762.605,518.640 762.824,518.945 763.265,519.295 763.907,519.359 766.183,518.713 767.596,518.040 768.064,517.394 768.606,517.276 769.166,517.331 770.055,516.957 771.294,516.312 772.882,515.266 774.065,514.566 774.478,514.056 774.854,514.111 775.102,514.292 775.818,515.066 776.167,515.266 777.387,516.639 777.828,516.376 778.736,516.366 779.047,516.426 779.395,517.245 779.801,517.549 780.588,517.209 780.974,517.372 781.469,517.845 781.837,518.104 782.277,518.027 783.352,517.294 784.600,516.776 785.617,516.827 787.672,516.426 788.774,516.539 789.306,516.272 789.727,515.926 790.637,515.321 791.489,515.098 792.124,514.429 792.847,514.352 793.375,513.966 793.568,513.698 793.921,513.616 794.164,513.670 794.508,514.166 794.871,514.493 795.418,514.693 796.426,514.935 797.336,515.329 799.472,517.350 799.894,517.372 800.281,518.049 801.887,518.240 802.868,518.201 804.060,517.801 805.327,517.658 807.135,516.994 809.246,515.639 810.705,514.493 812.861,512.619 813.834,511.992 814.559,511.309 815.145,510.860 816.058,510.757";
 await fixture(page,{path,name:'High Sierra Trail',viewBox:'740 500 21.6666666667 19',fontFamily:'Source Sans 3',fontStyle:'normal',fontSize:.55});
 const result=await page.evaluate(()=>{
  const e=document.querySelector('#label'),t=e.querySelector('text'),before=e.outerHTML,diagnostics={};
  const cs=lineAdapter.buildLineCandidates({annotation:{geometryId:'curve',style:'l-trail'},element:e,diagnostics});
  const restored=e.outerHTML===before;let bad=0,curved=0;const names=[];
  for(const c of cs){lineAdapter.applyLineCandidate(e,c);names.push(t.textContent);if(!t.querySelector('textPath'))continue;curved++;
   const m=t.getScreenCTM(),scale=Math.hypot(m.a,m.b),limit=parseFloat(getComputedStyle(t).fontSize)*scale*.2;
   for(let i=1;i<t.getNumberOfChars();i++){const a=t.getEndPositionOfChar(i-1),b=t.getStartPositionOfChar(i);if(Math.hypot(b.x-a.x,b.y-a.y)*scale>limit+1e-5)bad++;}
  }
  return {bad,curved,names,restored,path:document.querySelector('#curve').getAttribute('d')};
 });
 expect(result.bad).toBe(0);expect(result.curved).toBeGreaterThan(0);expect(result.restored).toBe(true);expect(result.path).toBe(path);
 expect(new Set(result.names)).toEqual(new Set(['High Sierra Trail']));
});
