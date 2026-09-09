import {test,expect} from '@playwright/test';
import {fixtureHTML} from '../support/browser-fixture.js';
import fs from 'node:fs/promises';

test('line paint and protected trail footprints retain screen width through maximum zoom',async({page})=>{
 let html=await fixtureHTML();
 const paths=['trails','contours','hydro','roads'].map((cls,i)=>`<g class="${cls}"><path id="width-${i}" ${i===0?'data-layout-obstacle="trail"':''} d="M100,100 L200,100" fill="none" stroke="black" style="stroke-width:calc(2.6px * var(--s))"/></g>`).join('');
 html=html.replace('</svg>',paths+'</svg>');await page.setContent(html);
 await page.addScriptTag({content:await fs.readFile('pipeline/labels/dist/browser.js','utf8')});
 const samples=await page.evaluate(async()=>{
  const ctl=mapLayout;await ctl.ready;const rows=[];
  for(const zoom of [1,2,4.5,14,1]){
   await ctl.requestView({x:90,y:90,w:500/zoom,h:400/zoom});await ctl.whenSettled();
   const widths=[0,1,2,3].map(i=>{const e=document.getElementById('width-'+i),m=e.getScreenCTM();return parseFloat(getComputedStyle(e).strokeWidth)*Math.hypot(m.a,m.b)});
   const m=ctl.svg.getScreenCTM(),query=ctl.trailQuery(m,Math.hypot(m.a,m.b),zoom),a={x:m.a*100+m.e,y:m.d*100+m.f};
   const obstacles=query({x:a.x-5,y:a.y-5,width:10,height:10});rows.push({zoom,widths,obstacle:obstacles[0]?.line.width});
  }return rows;
 });
 for(const row of samples){for(const width of row.widths)expect(width,JSON.stringify(row)).toBeCloseTo(2.6,3);expect(row.obstacle).toBeCloseTo(2.6,3);}
});
