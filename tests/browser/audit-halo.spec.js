import { test, expect } from '@playwright/test';
import { collectManagedInventory, checkManagedInventory } from '../support/managed-map-adapter.js';

for (const gap of [2.05, 1.5, -1]) {
  test(`rotated round text halo retains a ${gap}px gap`, async ({ page }) => {
    const annotations = ['a', 'b'].map(id => ({id,elementId:id,featureId:id,kind:id==='a'?'point-label':'symbol',anchor:[150,150],requiredProfiles:[]}));
    await page.setContent(`<style>body{margin:0}</style><svg id="mapsvg" width="500" height="500" viewBox="0 0 500 500"><g id="a" data-layout-id="a" data-feature-id="a"><text transform="translate(150 250) rotate(-67)" font-size="24" stroke="black" stroke-width="2.8" stroke-linejoin="round">Trail</text></g><g id="b" data-layout-id="b" data-feature-id="b"><rect width="20" height="160" /></g></svg><script id="map-label-manifest" type="application/json">${JSON.stringify({version:1,map:{width:500,height:500,mode:'static'},features:annotations.map(a=>({id:a.id,anchor:a.anchor})),annotations})}</script>`);
    const edge = await page.evaluate(gap => {
      const t=document.querySelector('text'),m=t.getScreenCTM(),points=[];
      for(let i=0;i<t.getNumberOfChars();i++){const b=t.getExtentOfChar(i);for(const x of [b.x,b.x+b.width])for(const y of [b.y,b.y+b.height])points.push(new DOMPoint(x,y).matrixTransform(m));}
      const edge=Math.max(...points.map(p=>p.x))+1.4,rect=document.querySelector('rect');rect.setAttribute('x',edge+gap);rect.setAttribute('y',120);return edge;
    },gap);
    const inventory = await page.evaluate(collectManagedInventory);
    const label = inventory.inventory.find(a=>a.id==='a');
    expect(Math.max(...label.polygons.flat().map(p=>p.x))).toBeLessThanOrEqual(edge+1e-6);
    const findings=checkManagedInventory(inventory,{clearance:2,edgePadding:4,requiredRoutes:[]});
    expect(findings.overlaps).toEqual(gap>=2?[]:[{ids:['a','b']}]);
  });
}

test('miter text keeps its conservative join extent', async ({ page }) => {
  await page.setContent(`<svg id="mapsvg" width="500" height="500" viewBox="0 0 500 500"><g id="a" data-layout-id="a" data-feature-id="a"><text x="150" y="200" stroke="black" stroke-width="4" stroke-linejoin="miter" stroke-miterlimit="4">V</text></g></svg><script id="map-label-manifest" type="application/json">${JSON.stringify({version:1,map:{width:500,height:500,mode:'static'},features:[{id:'a',anchor:[150,200]}],annotations:[{id:'a',elementId:'a',featureId:'a',kind:'point-label',anchor:[150,200],requiredProfiles:[]}]})}</script>`);
  const right = await page.evaluate(()=>{const t=document.querySelector('text'),b=t.getBBox(),m=t.getScreenCTM();return new DOMPoint(b.x+b.width,b.y).matrixTransform(m).x;});
  const inventory=await page.evaluate(collectManagedInventory);
  expect(Math.max(...inventory.inventory[0].polygons.flat().map(p=>p.x))-right).toBeCloseTo(8,5);
});
