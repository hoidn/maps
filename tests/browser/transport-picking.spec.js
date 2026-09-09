import {test,expect} from '@playwright/test';
import {fixtureHTML} from '../support/browser-fixture.js';
import fs from 'node:fs/promises';
for(const backend of ['canvas','webgl'])test(`${backend} only picks trails visible at the current ground scale`,async({page})=>{
 let html=(await fixtureHTML()).replace('class="map" data-w',`class="map" data-renderer="${backend}" data-w`).replace('"width":500,"height":400,"mode"','"width":500,"height":400,"metersPerMapUnit":30,"mode"');
 html=html.replace('<defs>','<g class="trails"><path id="detail-trail" d="M150,200 L350,200" stroke="red" fill="none" data-max-mpp="8"/></g><g class="hits"><path id="detail-hit" class="hit" d="M150,200 L350,200" data-name="Minor path" data-max-mpp="8"/></g><defs>');
 await page.setContent(html);await page.addScriptTag({content:await fs.readFile('pipeline/labels/dist/browser.js','utf8')});
 const result=await page.evaluate(async()=>{const l=mapLayout;await l.ready;await l.whenSettled();const pick=()=>{const r=l.svg.getBoundingClientRect();return l.pickTrail(r.x+(250-l.view.x)*r.width/l.view.w,r.y+(200-l.view.y)*r.height/l.view.h)?.id||null;};const overview=pick();l.requestView({x:200,y:160,w:100,h:80});await l.whenSettled();return{overview,detail:pick(),active:l.renderer.active,backend:l.renderer.backend};});
 expect(result.active).toBe(true);expect(result.overview).toBeNull();expect(result.detail).toBe('detail-hit');
});
