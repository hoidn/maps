import {test,expect,chromium,firefox,webkit} from '@playwright/test';
import {fixtureHTML} from '../support/browser-fixture.js';
import {collectManagedInventory,checkManagedInventory} from '../support/managed-map-adapter.js';
import {measureFontProbes} from '../../scripts/finalize-static.mjs';

// Exact failed 36-inch San Gabriel placements: Devils Chair and its nearby trail.
// Keep the source anchors, physical font sizes, wrapped elevation and rotations.
async function fixture(){
 const annotations=[
  {id:'peak',elementId:'peak',featureId:'osm:node:358807973',kind:'point-label',layer:'peaks',anchor:[762.8,225],text:'Devils Chair'},
  {id:'trail',elementId:'trail',featureId:'osm:way:1219361509',kind:'line-label',layer:'names',anchor:[748.7,222.6],text:"Devil's Chair Trail"},
 ];
 const manifest={version:1,map:{width:1300,height:685,mode:'static',requiredRoutes:[]},features:annotations.map(a=>({id:a.featureId,anchor:a.anchor})),annotations};
 const html=await fixtureHTML('static');
 return html.slice(0,html.indexOf('<div class="map-wrap">'))+`<svg xmlns="http://www.w3.org/2000/svg" id="mapsvg" class="map" viewBox="0 0 1300 685" data-layout-frozen="true" style="position:absolute;left:41.578125px;top:155.546875px;width:3372.85px;height:1777.23px;max-width:none;--k:0.38543370083170686">
 <g id="peak" data-layout-id="peak" data-feature-id="osm:node:358807973" transform="translate(-1.785033225711268 12.535053618875793)" style="visibility:visible"><text x="0" y="0" style="font-size:10.6667px;transform:translate(762.812px,224.953px) scale(var(--k)) translate(8px,-6px)"><tspan x="0" dy="0">Devils</tspan><tspan x="0" dy="11.946704000000002">Chair</tspan><tspan x="0" dy="13.866666666666667">4,967 ft</tspan></text></g>
 <g id="trail" data-layout-id="trail" data-feature-id="osm:way:1219361509" transform="matrix(0.9641463393411015 0.2653711294303778 -0.2653711294303778 0.9641463393411015 727.8007747910556 235.20793884277418)" style="visibility:visible"><text dy="-4" style="font-size:4.6252px;stroke-width:1.07921px;font-weight:600;font-style:italic">Devil's Chair Trail</text></g>
 </svg><script id="map-label-manifest" type="application/json">${JSON.stringify(manifest)}</script>`;
}

test('print font probes cover actual scale-dependent Firefox trail ink growth',async({browserName})=>{
 test.skip(browserName!=='chromium','One differential regression measures all three engines.');
 const html=await fixture(),rows=[];let probes;
 for(const [name,engine] of Object.entries({chromium,firefox,webkit})){
  const browser=await engine.launch();
  try{
   const page=await browser.newPage({viewport:{width:3456,height:2304}});await page.setContent(html);
   await page.evaluate(async()=>{for(const t of document.querySelectorAll('text'))await document.fonts.load(getComputedStyle(t).font,t.textContent);await document.fonts.ready;});
   probes??=await page.evaluate(()=>{
    const t=document.querySelector('#trail text'),computed=getComputedStyle(t),style={};
    for(const key of ['font-family','font-size','font-weight','font-style','font-stretch','font-variant','letter-spacing','word-spacing','text-anchor','dominant-baseline'])style[key]=computed.getPropertyValue(key);
    const m=t.getScreenCTM();return [{text:t.textContent,style,scale:Math.hypot(m.a,m.b)}];
   });
   const inventory=await page.evaluate(collectManagedInventory),ink=inventory.inventory.find(a=>a.id==='trail'),right=Math.max(...ink.polygons.flat().map(p=>p.x))-ink.anchor.x;
   rows.push({name,right,scale:probes[0].scale,probe:(await measureFontProbes(page,probes))[0],audit:checkManagedInventory(inventory,{clearance:2,requiredRoutes:[]})});
  }finally{await browser.close();}
 }
 const [reference,firefoxResult]=rows;
 expect(reference.audit.overlaps).toHaveLength(0);expect(firefoxResult.audit.overlaps).toHaveLength(1);
 const growth=firefoxResult.right-reference.right;expect(growth).toBeGreaterThan(.7);
 // The finalizer reserves the maximum outward difference across all engines.
 const a=reference.probe,reserve=Math.max(...rows.slice(1).map(({probe:b})=>Math.max(0,a.x-b.x,a.y-b.y,b.x+b.width-a.x-a.width,b.y+b.height-a.y-a.height)*reference.scale));
 for(const row of rows.slice(1)){
  expect(reserve,`${row.name} probe must enclose its actual painted right edge`).toBeGreaterThanOrEqual(Math.max(0,row.right-reference.right));
 }
});
