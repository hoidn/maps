import {test,expect} from '@playwright/test';
import {build} from 'esbuild';
import {fixtureHTML} from '../support/browser-fixture.js';
import {checkTypography} from '../support/typography-audit.js';

let runtime;
test.beforeAll(async()=>{
 runtime=(await build({stdin:{contents:"import {LayoutController} from './pipeline/labels/runtime.js';import policy from './pipeline/labels/policy.json';import {collectTypography} from './tests/support/typography-audit.js';window.printDistance={LayoutController,policy,collectTypography};",resolveDir:process.cwd()},bundle:true,write:false,format:'iife',loader:{'.txt':'text'}})).outputFiles[0].text;
});

test('physical print point fallbacks stay inside the painted distance limit after native rounding',async({page})=>{
 // Ruddell Hill, from the actual San Gabriel 36×24-inch print: retain its source
 // anchor, authored subpixel offset, wrapped name/elevation and physical scale.
 await page.setViewportSize({width:3456,height:2304});
 await page.setContent(await fixtureHTML('static'));
 await page.evaluate(()=>{
  const svg=document.getElementById('mapsvg'),source=document.getElementById('map-label-manifest');
  const annotation={id:'ruddell',elementId:'ruddell',featureId:'osm:node:358804369',sourceId:'osm:node:358804369',kind:'point-label',layer:'peaks',anchor:[1266.3,468.5],text:'Ruddell Hill',style:'l-peak',priority:620,requiredProfiles:[],maxMetersPerPixel:32,textMaxMetersPerPixel:null,variants:[{lines:['Ruddell','Hill']}]};
  source.textContent=JSON.stringify({version:1,map:{width:1300,height:685,mode:'static',metersPerMapUnit:72.91692319998185,requiredRoutes:[],print:{version:1,paperMm:[914.4,609.6],mapWidthMm:null,marginMm:6,tickMarginMm:5,maxPageMm:2438.4,groundMeters:{width:94792.00015997641,height:49917.722385879104,northWidth:94538.25888217885,southWidth:95044.27701510253},points:{place:10,secondary:8,trail:9,region:12,major:12,settlement:12,road:8,roadMajor:9,roadRef:9,contour:7},contourIntervalsFeet:[250,100,50]}},features:[{id:annotation.featureId,sourceId:annotation.sourceId,anchor:annotation.anchor,name:annotation.text}],annotations:[annotation]});
  svg.setAttribute('viewBox','0 0 1300 685');
  svg.style.cssText='position:absolute;left:41.578125px;top:155.546875px;width:3372.85px;height:1777.23px;max-width:none';
  svg.innerHTML='<g><g id="ruddell" data-layout-id="ruddell" data-feature-id="osm:node:358804369"><text class="l-peak" x="0" y="0" style="transform:translate(1266.281px,468.496px) scale(var(--k)) translate(8px,-6px)">Ruddell Hill<tspan class="l-sub" x="0" dy="14">2,470 ft</tspan></text></g></g>';
  document.querySelector('.ctl').remove();
 });
 await page.addScriptTag({content:runtime});
 const result=await page.evaluate(async()=>{
  const {LayoutController,policy,collectTypography}=printDistance,source=document.getElementById('map-label-manifest');
  const controller=new LayoutController(document.getElementById('mapsvg'),JSON.parse(source.textContent),policy);
  await controller.ready;await controller.whenSettled();controller.observer.disconnect();
  const item=controller.prepared[0],candidates=item.fallbackCandidates(),{m,s}=controller.camera(),painted=[];
  for(const candidate of candidates){
   controller.commit({placements:[{...candidate,id:item.id,candidateId:candidate.id,footprint:candidate.shape}]},m,s,true);
   painted.push({candidate:candidate.id,typography:collectTypography()});
  }
  return {painted,policy,anchor:controller.manifest.annotations[0].anchor,sourceId:controller.manifest.annotations[0].sourceId};
 });
 expect(result.painted.length).toBeGreaterThan(100);
 expect(result.anchor).toEqual([1266.3,468.5]);expect(result.sourceId).toBe('osm:node:358804369');
 const failures=result.painted.flatMap(({candidate,typography})=>checkTypography(typography,result.policy).map(f=>({candidate,...f})));
 expect(failures).toEqual([]);
});
