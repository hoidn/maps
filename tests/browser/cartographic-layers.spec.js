import {test,expect} from '@playwright/test';
import {fixtureHTML} from '../support/browser-fixture.js';
import fs from 'node:fs/promises';
test('Canvas honors independent area layers and ground-scale building detail',async({page})=>{
 let html=await fixtureHTML();html=html.replace('class="map" data-w','class="map" data-renderer="canvas" data-w').replace('"width":500,"height":400,"mode"','"width":500,"height":400,"metersPerMapUnit":30,"mode"');
 html=html.replace('<defs>','<g class="boundaries"><path d="M10,10 H490 V390 H10 Z" fill="none" stroke="purple"/></g><g class="buildings"><path d="M200,200 H220 V220 H200 Z" fill="brown" data-max-mpp="8"/></g><defs>');
 await page.setContent(html);await page.addScriptTag({content:await fs.readFile('pipeline/labels/dist/browser.js','utf8')});
 const result=await page.evaluate(async()=>{const l=mapLayout;await l.whenSettled();const scene=l.renderer.scene,b=scene.items.find(i=>i.layer==='buildings'),bound=scene.items.find(i=>i.layer==='boundaries'),visible=i=>scene.visible(i,l.layers,500/l.view.w,l.view);const overview=visible(b);l.setLayer('boundaries',false);await l.whenSettled();const off=visible(bound);l.requestView({x:150,y:150,w:100,h:80});await l.whenSettled();return{overview,off,zoom:visible(b),paintedView:l.renderer.paintedView,requested:l.view}});
 expect(result.overview).toBe(false);expect(result.off).toBe(false);expect(result.zoom).toBe(true);expect(result.paintedView).toEqual(result.requested);
});
for(const backend of ['svg','canvas'])test(`${backend} semantic label layers remain independent`,async({page})=>{
 let html=await fixtureHTML();if(backend==='canvas')html=html.replace('class="map" data-w','class="map" data-renderer="canvas" data-w');
 html=html.replace('</style>',(await fs.readFile('pipeline/cartography/map.css','utf8'))+(await fs.readFile('pipeline/cartography/styles.css','utf8'))+'</style>');
 await page.setContent(html);
 await page.evaluate(()=>{const node=document.getElementById('map-label-manifest'),m=JSON.parse(node.textContent),svg=document.getElementById('mapsvg');m.annotations.find(a=>a.id==='curve').layer='water';for(const [id,layer,group,anchor] of [['boundary','boundaries','boundary-labels',[300,300]],['peak','peaks','peaks',[300,100]]]){const g=document.createElementNS(svg.namespaceURI,'g');g.setAttribute('class',group);g.innerHTML=`<g id="${id}" data-layout-id="${id}"><text x="${anchor[0]}" y="${anchor[1]}">${id}</text></g>`;svg.append(g);m.features.push({id,name:id,anchor,directory:false});m.annotations.push({id,elementId:id,featureId:id,kind:'point-label',layer,anchor,text:id,style:'l-place',priority:500,requiredProfiles:[]})}node.textContent=JSON.stringify(m)});
 await page.addScriptTag({content:await fs.readFile('pipeline/labels/dist/browser.js','utf8')});
 const r=await page.evaluate(async()=>{const l=mapLayout;await l.whenSettled();const read=id=>{const e=l.elements.get(id);return l.result.placements.some(p=>p.id===id)&&[e,...function*(e){while((e=e.parentElement))yield e}(e)].every(e=>getComputedStyle(e).display!=='none')};l.setLayer('names',false);l.setLayer('places',false);await l.whenSettled();const independent=['curve','boundary','peak'].map(read);l.setLayer('water',false);l.setLayer('boundaries',false);l.setLayer('peaks',false);await l.whenSettled();return {independent,off:['curve','boundary','peak'].map(read)}});
 expect(r.independent).toEqual([true,true,true]);expect(r.off).toEqual([false,false,false]);
});
for(const backend of ['svg','canvas'])test(`${backend} area outlines keep constant screen width when zooming`,async({page})=>{
 let html=await fixtureHTML();if(backend==='canvas')html=html.replace('class="map" data-w','class="map" data-renderer="canvas" data-w');
 html=html.replace('<defs>','<g class="boundaries"><path id="boundary-stroke" d="M30,30 H470 V370 H30 Z" style="fill:none;stroke:purple;stroke-width:calc(1.3px * var(--s));stroke-dasharray:calc(8px * var(--s)),calc(3px * var(--s))"/></g><defs>');
 await page.setContent(html);await page.addScriptTag({content:await fs.readFile('pipeline/labels/dist/browser.js','utf8')});
 const result=await page.evaluate(async()=>{const l=mapLayout;await l.whenSettled();l.requestView({x:200,y:160,w:100,h:80});await l.whenSettled();if(l.renderer?.active){const item=l.renderer.scene.items.find(i=>i.element.id==='boundary-stroke');return {width:item.commands[0].style.width*(item.constantStroke?1:5),dash:item.commands[0].style.dash[0]*(item.constantStroke?1:5)}}const e=document.getElementById('boundary-stroke'),s=getComputedStyle(e),scale=Math.hypot(e.getScreenCTM().a,e.getScreenCTM().b);return{width:parseFloat(s.strokeWidth)*scale,dash:parseFloat(s.strokeDasharray)*scale}});
 expect(result.width).toBeCloseTo(1.3,3);expect(result.dash).toBeCloseTo(8,3);
});
test('protected path queries follow painted ground-scale visibility',async({page})=>{
 let html=await fixtureHTML();html=html.replace('"width":500,"height":400,"mode"','"width":500,"height":400,"metersPerMapUnit":30,"mode"').replace('<defs>','<g class="trails"><path id="detail-path" data-layout-obstacle="trail" data-max-mpp="8" d="M10,100 L490,100" style="fill:none;stroke:red;stroke-width:calc(1.3px * var(--s))"/></g><defs>');
 await page.setContent(html);await page.addScriptTag({content:await fs.readFile('pipeline/labels/dist/browser.js','utf8')});
 const r=await page.evaluate(async()=>{const l=mapLayout;await l.whenSettled();const query=()=>{const {m,s,z}=l.camera();return l.trailQuery(m,s,z)(l.lastViewport).length};const overview=query();l.requestView({x:50,y:60,w:100,h:80});await l.whenSettled();return {overview,detail:query()}});expect(r.overview).toBe(0);expect(r.detail).toBeGreaterThan(0);
});
