import {test,expect} from '@playwright/test';
import {build} from 'esbuild';
import {readFile} from 'node:fs/promises';

let bundle,fonts;
test.beforeAll(async()=>{
 const result=await build({stdin:{contents:"export * from './pipeline/labels/line-candidates.js'; export {measureElement,measureTextAdvance,ensureFonts} from './pipeline/labels/measure.js';",resolveDir:process.cwd()},bundle:true,format:'iife',globalName:'advanceTest',write:false});
 bundle=result.outputFiles[0].text;
 fonts=await Promise.all(['b6f2cc8d9905e97b.ttf','2e9f0fccac3e4024.ttf'].map(async name=>(await readFile('pipeline/labels/fonts/'+name)).toString('base64')));
});

test('unconstrained advances preserve SVG metrics and reuse probes outside the map until fonts change',async({page})=>{
 await page.setContent('<svg id="map" width="1000" height="800" viewBox="0 0 500 400"><defs><path id="line" d="M10,100 L490,100"/></defs><g id="label"><text font-size="14" text-anchor="middle" style="font-family:AdvanceRegression"><textPath href="#line" startOffset="120%">Repeated mountain road</textPath></text></g></svg>');
 await page.addScriptTag({content:bundle});
 const result=await page.evaluate(async fonts=>{
  const svg=document.getElementById('map'),element=document.getElementById('label'),text=element.querySelector('text'),tp=text.querySelector('textPath');
  let face=new FontFace('AdvanceRegression','url(data:font/ttf;base64,'+fonts[0]+')');document.fonts.add(face);await advanceTest.ensureFonts(['AdvanceRegression']);
  const native=SVGTextContentElement.prototype.getComputedTextLength;let probes=0;
  SVGTextContentElement.prototype.getComputedTextLength=function(){if(this!==text&&!this.querySelector('textPath'))probes++;return native.call(this);};
  // The previous implementation's on-map unconstrained measurement is the
  // differential reference, including the original SVG viewport and scale.
  function reference(){
   const plain=document.createElementNS(svg.namespaceURI,'text'),style=getComputedStyle(tp);
   for(const property of ['fontFamily','fontSize','fontWeight','fontStyle','letterSpacing'])plain.style[property]=style[property];
   for(const name of ['textLength','lengthAdjust'])if(text.hasAttribute(name))plain.setAttribute(name,text.getAttribute(name));
   plain.textContent=tp.textContent;plain.style.visibility='hidden';svg.append(plain);
   try{return native.call(plain);}finally{plain.remove();}
  }
  function check(){
   const advance=reference(),scale=Math.hypot(text.getScreenCTM().a,text.getScreenCTM().b),before=element.outerHTML;
   const observer=new MutationObserver(()=>{});observer.observe(svg,{childList:true});
   const options={annotation:{geometryId:'line'},element,policy:{maxLineCandidates:2}};
   const start=probes,first=advanceTest.buildLineCandidates(options),afterFirst=probes;
   const restored=element.outerHTML===before,again=advanceTest.buildLineCandidates(options),afterAgain=probes;
   let overflow;try{advanceTest.measureElement(element);}catch(error){overflow=error.message;}
   const inserted=observer.takeRecords().flatMap(record=>[...record.addedNodes]).filter(node=>node.localName==='text').length;observer.disconnect();
   return {advance,scale,first:first.length,again:again.length,window:first[0]?.windowEnd-first[0]?.windowStart,restored,overflow,inserted,firstProbes:afterFirst-start,repeatedProbes:afterAgain-afterFirst,metricProbes:probes-afterAgain};
  }
  const rows=[];
  for(const width of [1000,743.375,7165.375]){
   svg.style.width=width+'px';svg.style.height=width*.8+'px';
   for(const [spacing,length,adjust] of [['0px',null,null],['1.25px',null,null],['1.25px','120','spacing'],['1.25px','120','spacingAndGlyphs'],['1.25px','20%','spacingAndGlyphs']]){
    text.style.letterSpacing=spacing;
    for(const [name,value] of [['textLength',length],['lengthAdjust',adjust]])if(value===null)text.removeAttribute(name);else text.setAttribute(name,value);
    rows.push({width,spacing,length,adjust,...check()});
   }
  }
  text.removeAttribute('textLength');text.removeAttribute('lengthAdjust');text.style.letterSpacing='0px';
  const beforeFont=check();document.fonts.delete(face);face=new FontFace('AdvanceRegression','url(data:font/ttf;base64,'+fonts[1]+')');document.fonts.add(face);
  await advanceTest.ensureFonts(['AdvanceRegression']);const afterFont=check();
  element.setAttribute('transform','scale(.73)');const nested={expected:reference(),actual:advanceTest.measureTextAdvance(text)};
  SVGTextContentElement.prototype.getComputedTextLength=native;
  return {rows,beforeFont,afterFont,nested};
 },fonts);
 for(const row of [...result.rows,result.afterFont]){
  expect(row.inserted).toBe(0);
  expect(row.first,JSON.stringify(row)).toBeGreaterThan(0);expect(row.again).toBe(row.first);
  expect(row.window).toBeCloseTo(row.advance*row.scale,6);
  expect(row.restored).toBe(true);expect(row.overflow).toContain('overflow');
  expect(row.firstProbes).toBe(1);expect(row.repeatedProbes).toBe(0);expect(row.metricProbes).toBe(0);
 }
 expect(result.beforeFont.firstProbes).toBe(0);
 expect(result.afterFont.advance).not.toBeCloseTo(result.beforeFont.advance,2);
 expect(result.nested.actual).toBeCloseTo(result.nested.expected,6);
});
