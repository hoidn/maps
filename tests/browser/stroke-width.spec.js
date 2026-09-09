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

test('drag preview preserves rendered contour width and live road and waterway widths',async({page})=>{
 let html=await fixtureHTML();
 const paths=['contours','hydro','roads'].map((cls,i)=>`<g class="${cls}"><path id="drag-width-${i}" d="M90,100 L150,100" fill="none" stroke="black" style="stroke-width:calc(2px * var(--s))"/></g>`).join('');
 html=html.replace('</svg>',paths+'</svg>');await page.setContent(html);
 await page.addScriptTag({content:await fs.readFile('pipeline/labels/dist/browser.js','utf8')});
 const rows=await page.evaluate(async()=>{
  const l=mapLayout;await l.ready;await l.preview.ready;const rows=[];
  for(const z of [1,4.5,14]){
   l.requestView({x:90,y:90,w:500/z,h:400/z});await l.whenSettled();
   const before=[0,1,2].map(i=>{const e=document.getElementById('drag-width-'+i);return parseFloat(getComputedStyle(e).strokeWidth)*e.getScreenCTM().a});
   l.view={...l.view,x:l.view.x+1};l.render(false);
   const during=[0,1,2].map(i=>{const e=document.getElementById('drag-width-'+i);return e?parseFloat(getComputedStyle(e).strokeWidth)*e.getScreenCTM().a:null});
   const canvas=l.preview.contours?.canvas;
   if(canvas&&canvas.isConnected){const x=Math.round((100-Number(l.preview.contours.element.getAttribute('x')))/Number(l.preview.contours.element.getAttribute('width'))*canvas.width),pixels=canvas.getContext('2d').getImageData(x,0,1,canvas.height).data;let coverage=0;for(let i=3;i<pixels.length;i+=4)coverage+=pixels[i]/255;during[0]=coverage/(canvas.width/canvas.getBoundingClientRect().width);}
   rows.push({z,before,during,active:l.preview.active});l.render(true);
  }return rows;
 });
 for(const row of rows){expect(row.active).toBe(true);for(let i=0;i<3;i++){expect(row.during[i],JSON.stringify(row)).not.toBeNull();expect(Math.abs(row.during[i]-row.before[i])).toBeLessThan(.12);}}
});

test('contour gesture rendering follows zoom detail, theme and layer changes',async({page})=>{
 const paths='<g class="contours"><path d="M95,100 L120,100"/><g class="g-fine"><path d="M95,104 L120,104"/></g><g class="g-finest"><path d="M95,108 L120,108"/></g></g>';
 await page.setContent((await fixtureHTML()).replace('</svg>',paths+'</svg>'));
 await page.addStyleTag({content:'.g-fine,.g-finest{display:none}.z2 .g-fine,.z5 .g-finest{display:inline}:root{--preview-line:rgb(255,0,0)}:root[data-theme="dark"]{--preview-line:rgb(0,0,255)}.contours path{fill:none;stroke:var(--preview-line);stroke-width:calc(2px * var(--s))}'});
 await page.addScriptTag({content:await fs.readFile('pipeline/labels/dist/browser.js','utf8')});
 const result=await page.evaluate(async()=>{
  const l=mapLayout;await l.ready;await l.preview.ready;
  const samples=[];
  function pixels(){const c=l.preview.contours.canvas,e=l.preview.contours.element,x=Number(e.getAttribute('x')),y0=Number(e.getAttribute('y')),w=Number(e.getAttribute('width')),h=Number(e.getAttribute('height'));return [100,104,108].map(y=>[...c.getContext('2d').getImageData(Math.floor((100-x)/w*c.width),Math.floor((y-y0)/h*c.height),1,1).data]);}
  for(const z of [1,2,4.5,14]){l.requestView({x:90,y:90,w:500/z,h:400/z});await l.whenSettled();l.render(false);samples.push({z,pixels:pixels()});l.render(true);}
  document.documentElement.dataset.theme='dark';await new Promise(requestAnimationFrame);await l.preview.ready;l.render(false);const dark=pixels();l.render(true);
  l.setLayer('contours',false);await l.whenSettled();await l.preview.ready;l.render(false);const off=pixels();l.render(true);
  return {samples,dark,off};
 });
 for(const {z,pixels} of result.samples)for(let i=0;i<3;i++)expect(pixels[i][3]>0).toBe(z>=[0,2,4.5][i]);
 expect(result.dark[0][2]).toBe(255);expect(result.dark[0][0]).toBe(0);expect(result.off.every(p=>p[3]===0)).toBe(true);
});

test('panning reuses contour pixels until the viewport reaches the cached margin',async({page})=>{
 await page.setContent((await fixtureHTML()).replace('</svg>','<g class="contours"><path d="M0,100 500,100" fill="none" stroke="black" style="stroke-width:calc(2px * var(--s))"/></g></svg>'));
 await page.addScriptTag({content:await fs.readFile('pipeline/labels/dist/browser.js','utf8')});
 const result=await page.evaluate(async()=>{
  const l=mapLayout;await l.ready;await l.preview.ready;l.requestView({x:90,y:90,w:125,h:100});await l.whenSettled();
  const c=l.preview.contours;let strokes=0;const stroke=c.context.stroke.bind(c.context);c.context.stroke=(...args)=>{strokes++;return stroke(...args)};
  l.view.x+=1;l.render(false);const first=strokes;l.view.x+=1;l.render(false);const near=strokes;
  l.view.x+=50;l.render(false);const far=strokes;l.view.w/=2;l.view.h/=2;l.render(false);const zoom=strokes;
  return {first,near,far,zoom,zoomWidth:Number(c.element.getAttribute('width')),viewWidth:l.view.w};
 });
 expect(result.near).toBe(result.first);expect(result.far).toBeGreaterThan(result.near);expect(result.zoom).toBeGreaterThan(result.far);expect(result.zoomWidth).toBeCloseTo(result.viewWidth,5);
});

test('culled contour sections match the original path pixels including joins',async({page})=>{
 const d='M'+Array.from({length:501},(_,i)=>`${i},${100+12*Math.sin(i*.4)}`).join(' ');
 await page.setContent((await fixtureHTML()).replace('</svg>',`<g class="contours"><path d="${d}" fill="none" stroke="black" opacity=".5" stroke-linejoin="round" style="stroke-width:calc(2px * var(--s))"/></g></svg>`));
 await page.addScriptTag({content:await fs.readFile('pipeline/labels/dist/browser.js','utf8')});
 const result=await page.evaluate(async d=>{
  const l=mapLayout;await l.ready;await l.preview.ready;l.requestView({x:90,y:80,w:125,h:100});await l.whenSettled();l.render(false);
  const c=l.preview.contours,e=c.element,x=Number(e.getAttribute('x')),y=Number(e.getAttribute('y')),w=Number(e.getAttribute('width')),h=Number(e.getAttribute('height'));
  const ref=document.createElement('canvas');ref.width=c.canvas.width;ref.height=c.canvas.height;const ctx=ref.getContext('2d'),sx=ref.width/w,sy=ref.height/h;
  ctx.setTransform(sx,0,0,sy,-x*sx,-y*sy);ctx.strokeStyle='black';ctx.lineWidth=.5;ctx.lineJoin='round';ctx.globalAlpha=.5;ctx.stroke(new Path2D(d));
  const a=c.context.getImageData(0,0,ref.width,ref.height).data,b=ctx.getImageData(0,0,ref.width,ref.height).data;let max=0,total=0,ink=0;
  for(let i=3;i<a.length;i+=4){max=Math.max(max,Math.abs(a[i]-b[i]));total+=Math.abs(a[i]-b[i]);ink+=b[i];}
  return {max,total,ink};
 },d);
 // Canvas string parsing and lineTo have small browser-specific edge coverage differences.
 expect(result.max,JSON.stringify(result)).toBeLessThanOrEqual(20);expect(result.total/result.ink).toBeLessThan(.001);
});
