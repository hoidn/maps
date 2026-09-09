import {test,expect} from '@playwright/test';
import {build} from 'esbuild';
let bundle;
test.beforeAll(async()=>{bundle=(await build({stdin:{contents:"export * from './pipeline/labels/line-candidates.js'; export {measureElement} from './pipeline/labels/measure.js';",resolveDir:process.cwd()},bundle:true,format:'iife',globalName:'lineReuse',write:false})).outputFiles[0].text;});
async function fixture(page){
 await page.setContent('<svg width="600" height="400" viewBox="0 0 300 200"><path id="trail" d="M20,150 L260,30"/><path id="curve" d="M10,100 Q150,60 280,100"/><g id="straight"><g transform="translate(30,30) rotate(30)"><text text-anchor="middle" font-size="9" stroke="white" stroke-width=".3" stroke-linejoin="round">North Kaibab Trail</text></g></g><g id="curved"><text font-size="9" dy="-4" text-anchor="middle" stroke="white" stroke-width=".3" stroke-linejoin="round"><textPath href="#curve" startOffset="50%">Colorado River</textPath></text></g></svg>');
 await page.addScriptTag({content:bundle});
}
test('translated line sides reuse glyph measurements but preserve independently measured footprints',async({page})=>{
 await fixture(page);
 const results=await page.evaluate(()=>{
  const rows=[];
  for(const canvasInk of [false,true])for(const zoom of [1,2.5,10])for(const kind of ['straight','curve','wrapped','curve-wrap']){
   const svg=document.querySelector('svg');svg.setAttribute('viewBox',`0 0 ${300/zoom} ${200/zoom}`);
   for(const text of document.querySelectorAll('text'))text.setAttribute('font-size',String(9/zoom));
   const curved=kind.startsWith('curve'),wrap=kind.includes('wrap'),element=document.getElementById(curved?'curved':'straight'),original=element.outerHTML;
   const annotation=curved?{geometryId:'curve',style:'l-river'}:{geometryIds:['trail']};
   if(wrap)Object.assign(annotation,{text:curved?'Colorado River':'North Kaibab Trail',requiredGroup:'route',variants:[{lines:curved?['Colorado','River']:['North Kaibab','Trail']}]});
   const candidates=lineReuse.buildLineCandidates({annotation,element,policy:{maxLineCandidates:4},measurement:{canvasInk}}),restored=element.outerHTML===original;
   let maximum=0,partsMatch=true;
   for(const candidate of candidates){
    lineReuse.applyLineCandidate(element,candidate);
    const actual=lineReuse.measureElement(element,0,{canvasInk}),a=[actual.bounds,...actual.parts],b=[candidate.shape.bounds,...candidate.shape.parts];
    partsMatch&&=a.length===b.length;
    for(let i=0;i<Math.min(a.length,b.length);i++)for(const key of ['x','y','width','height'])maximum=Math.max(maximum,Math.abs(a[i][key]-b[i][key]));
   }
   element.outerHTML=original;
   rows.push({canvasInk,zoom,kind,count:candidates.length,restored,maximum,partsMatch});
  }
  return rows;
 });
 for(const row of results){expect(row.restored,JSON.stringify(row)).toBe(true);expect(row.count,JSON.stringify(row)).toBeGreaterThan(0);expect(row.partsMatch,JSON.stringify(row)).toBe(true);expect(row.maximum,JSON.stringify(row)).toBeLessThan(.005);}
});
test('measuring additional translated sides does not perform another per-glyph SVG scan',async({page})=>{
 await fixture(page);
 const result=await page.evaluate(()=>{
  const element=document.getElementById('straight'),text=element.querySelector('text'),getExtent=text.getExtentOfChar.bind(text);let reads=0;text.getExtentOfChar=i=>{reads++;return getExtent(i);};
  const candidates=lineReuse.buildLineCandidates({annotation:{geometryIds:['trail']},element,policy:{maxLineCandidates:4}}),windows=new Set(candidates.map(c=>c.windowStart));
  return {reads,characters:text.getNumberOfChars(),windows:windows.size,candidates:candidates.length};
 });
 expect(result.candidates).toBeGreaterThan(result.windows*2);
 expect(result.reads).toBeLessThanOrEqual(result.characters*(result.windows+1));
});
test('shared arc indexes invalidate when source geometry or screen transform changes',async({page})=>{
 await fixture(page);
 const result=await page.evaluate(()=>{
  const svg=document.querySelector('svg'),path=document.getElementById('trail'),element=document.getElementById('straight'),args={annotation:{geometryIds:['trail']},element,policy:{maxLineCandidates:2}};
  const before=lineReuse.buildLineCandidates(args);svg.setAttribute('viewBox','-20 -30 150 100');const zoomed=lineReuse.buildLineCandidates(args);
  path.setAttribute('d','M0,0 L.1,0');const empty=lineReuse.buildLineCandidates(args);
  path.setAttribute('d','M20,100 L260,100');const changed=lineReuse.buildLineCandidates(args);
  return {before:before.length,zoomed:zoomed.length,empty:empty.length,changed:changed.length,zoomMoved:JSON.stringify(before[0].shape)!==JSON.stringify(zoomed[0].shape),changedAngle:changed[0].angle};
 });
 expect(result.before).toBeGreaterThan(0);expect(result.zoomed).toBeGreaterThan(0);expect(result.empty).toBe(0);expect(result.changed).toBeGreaterThan(0);expect(result.zoomMoved).toBe(true);expect(result.changedAngle).toBe(0);
});
