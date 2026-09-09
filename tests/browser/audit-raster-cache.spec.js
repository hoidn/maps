import {test,expect} from '@playwright/test';
import {collectManagedInventory} from '../support/managed-map-adapter.js';
async function setup(page){
 const manifest={version:1,map:{width:300,height:200,mode:'interactive'},features:[{id:'feature',anchor:[100,100]}],annotations:[{id:'symbol',elementId:'symbol',featureId:'feature',kind:'symbol',anchor:[100,100],requiredProfiles:[]}]};
 await page.setContent(`<style>body{margin:0}</style><svg id="mapsvg" width="300" height="200"><g id="symbol" data-layout-id="symbol" data-feature-id="feature"><path d="M0 0H10V10"/></g></svg><script id="map-label-manifest" type="application/json">${JSON.stringify(manifest)}</script>`);
 await page.evaluate(()=>{
  window.auditRasterCalls=0;const read=CanvasRenderingContext2D.prototype.getImageData;CanvasRenderingContext2D.prototype.getImageData=function(...args){window.auditRasterCalls++;return read.apply(this,args);};
  const command={kind:'path',path:new Path2D('M0 0H10V10'),matrix:[1,0,0,1,100,100],bounds:{x:0,y:0,width:10,height:10},style:{fill:'none',stroke:'black',width:2,opacity:1,fillOpacity:1,strokeOpacity:1,cap:'round',join:'round',miter:4,fillRule:'nonzero',dash:[],dashOffset:0}};
  window.auditCommand=command;window.mapLayout={view:{x:0,y:0,w:300,h:200},renderer:{active:true,painted:[{id:'symbol',commands:[command],offset:[0,0]}],paintViewport:{x:0,y:0}}};
 });
}
test('audit reuses local path ink but projects every current command and camera offset',async({page})=>{
 await setup(page);
 const first=await page.evaluate(collectManagedInventory),repeat=await page.evaluate(collectManagedInventory);
 expect(await page.evaluate(()=>auditRasterCalls)).toBe(1);
 expect(first.rasterWork.misses).toBe(1);expect(first.rasterWork.scannedPixels).toBeGreaterThan(0);
 expect(repeat.rasterWork).toMatchObject({hits:1,misses:0,scannedPixels:0,entries:1});
 expect(repeat.inventory).toEqual(first.inventory);
 await page.evaluate(()=>{auditCommand.matrix=[2,0,0,2,110,120];mapLayout.renderer.painted[0].offset=[3,4];mapLayout.renderer.paintViewport={x:-5,y:-6};});
 const moved=await page.evaluate(collectManagedInventory);
 expect(moved.rasterWork).toMatchObject({hits:1,misses:0,scannedPixels:0});
 const before=first.inventory[0].polygons[0],after=moved.inventory[0].polygons[0];
 for(let i=0;i<before.length;i++){expect(after[i].x).toBeCloseTo((before[i].x-100)*2+118,8);expect(after[i].y).toBeCloseTo((before[i].y-100)*2+130,8);}
});
test('audit path cache invalidates exact path identity, paint style, and local bounds',async({page})=>{
 await setup(page);const first=await page.evaluate(collectManagedInventory);
 await page.evaluate(()=>{auditCommand.style={...auditCommand.style,width:6,cap:'square'};});
 const styled=await page.evaluate(collectManagedInventory);expect(styled.rasterWork.misses).toBe(1);expect(styled.inventory[0].polygons).not.toEqual(first.inventory[0].polygons);
 await page.evaluate(()=>{auditCommand.bounds={x:-1,y:-1,width:12,height:12};});
 expect((await page.evaluate(collectManagedInventory)).rasterWork.misses).toBe(1);
 await page.evaluate(()=>{auditCommand.path=new Path2D('M0 10H10V0');});
 const changed=await page.evaluate(collectManagedInventory);expect(changed.rasterWork.misses).toBe(1);
 expect((await page.evaluate(collectManagedInventory)).rasterWork).toMatchObject({hits:1,misses:0,scannedPixels:0});
});
test('audit raster work is reused across 30 collections and retention stays bounded',async({page})=>{
 await setup(page);
 await page.evaluate('window.collectAuditForTest='+collectManagedInventory.toString());
 const result=await page.evaluate(()=>{
  const first=collectAuditForTest(),repeat=[];
  for(let i=0;i<30;i++)repeat.push(collectAuditForTest().rasterWork);
  const initialPath=auditCommand.path,initialBounds=auditCommand.bounds,initialStyle=auditCommand.style;
  auditCommand.style={...initialStyle,width:.25};auditCommand.bounds={x:0,y:0,width:1,height:1};
  let filled;
  for(let i=0;i<1025;i++){auditCommand.path=new Path2D('M0 0L1 1');filled=collectAuditForTest().rasterWork;}
  auditCommand.path=initialPath;auditCommand.bounds=initialBounds;auditCommand.style=initialStyle;
  const revisited=collectAuditForTest();
  return {first:first.rasterWork,repeat,filled,revisited:revisited.rasterWork,sameInk:JSON.stringify(first.inventory)===JSON.stringify(revisited.inventory)};
 });
 expect(result.first.misses).toBe(1);
 expect(result.repeat.every(w=>w.hits===1&&w.misses===0&&w.scannedPixels===0)).toBe(true);
 expect(result.filled.entries).toBe(1024);
 expect(result.revisited).toMatchObject({hits:0,misses:1,entries:1024});
 expect(result.sameInk).toBe(true);
});
test('audit caches an empty raster without inventing ink',async({page})=>{
 await setup(page);await page.evaluate(()=>{auditCommand.path=new Path2D();});
 const first=await page.evaluate(collectManagedInventory),second=await page.evaluate(collectManagedInventory);
 expect(first.inventory).toEqual([]);expect(second.inventory).toEqual([]);
 expect(first.rasterWork.misses).toBe(1);expect(second.rasterWork).toMatchObject({hits:1,misses:0,scannedPixels:0});
 expect(await page.evaluate(()=>auditRasterCalls)).toBe(1);
});
