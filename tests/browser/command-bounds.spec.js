import {test,expect} from '@playwright/test';
import {build} from 'esbuild';

let bundle;
test.beforeAll(async()=>{
 bundle=(await build({entryPoints:['pipeline/render/scene.js'],bundle:true,write:false,format:'iife',globalName:'SceneTest'})).outputFiles[0].text;
});

test('bounds preparation does not allocate native geometry objects per path',async({page})=>{
 await page.addScriptTag({content:bundle});
 const result=await page.evaluate(()=>{
  const Matrix=DOMMatrix,Point=DOMPoint;let matrices=0,points=0;
  window.DOMMatrix=class extends Matrix{constructor(...args){super(...args);matrices++;}};
  window.DOMPoint=class extends Point{constructor(...args){super(...args);points++;}};
  try{return {bounds:SceneTest.commandBounds([{matrix:[2,0,0,3,5,7],bounds:{x:1,y:2,width:4,height:5},style:{stroke:'black',width:2,join:'miter',miter:4}}]),matrices,points};}
  finally{window.DOMMatrix=Matrix;window.DOMPoint=Point;}
 });
 expect(result).toEqual({bounds:{x:7,y:13,right:15,bottom:28,pad:12},matrices:0,points:0});
});

test('affine bounds and culling match native corner transforms, including degenerate paths',async({page})=>{
 await page.setContent('<svg id="map" width="743.375" height="497.125" viewBox="11.2 7.3 310.7 199.8"><g transform="translate(4 5) rotate(17 100 100)"><path d="M10,20L80,50L40,90Z" fill="none" stroke="red" stroke-width="2"/><g transform="scale(-.25 3)"><path d="M10,20L10,80" fill="none" stroke="blue" stroke-linejoin="round" stroke-width="3"/></g></g></svg>');
 await page.addScriptTag({content:bundle});
 const result=await page.evaluate(()=>{
  const native=commands=>{
   let x=Infinity,y=Infinity,right=-Infinity,bottom=-Infinity,pad=0;
   for(const c of commands){if(!c.bounds)return null;const b=c.bounds,m=new DOMMatrix(c.matrix);
    for(const px of [b.x,b.x+b.width])for(const py of [b.y,b.y+b.height]){const p=new DOMPoint(px,py).matrixTransform(m);x=Math.min(x,p.x);y=Math.min(y,p.y);right=Math.max(right,p.x);bottom=Math.max(bottom,p.y);}
    const s=c.style;pad=Math.max(pad,s.stroke==='none'?0:s.width/2*Math.max(1,s.join==='miter'?s.miter:1)*Math.max(Math.hypot(m.a,m.b),Math.hypot(m.c,m.d)));
   }return {x,y,right,bottom,pad};
  };
  const matrices=[[1,0,0,1,0,0],[2,0,0,.25,13,-17],[-2,0,0,-3,-5,7],[0,0,0,0,4,9],[0,2,-3,0,1,-8],[1,.5,-.25,1,100,-200]];
  for(const angle of [-179,-91,-45,-.1,0,.1,37,90,179])matrices.push(SceneTest.matrixArray(new DOMMatrix().translate(17.3,-25.9).rotate(angle).skewX(13).scale(-.7,2.4)));
  const boxes=[{x:0,y:0,width:0,height:0},{x:-17.25,y:21.5,width:0,height:38.75},{x:1.25,y:-2.75,width:123.5,height:0},{x:-1e6,y:1e6,width:1e-6,height:1e-6},{x:12.3,y:-45.6,width:78.9,height:65.4}];
  const styles=[{stroke:'none',width:20,join:'miter',miter:10},{stroke:'black',width:0,join:'miter',miter:4},{stroke:'black',width:2.75,join:'miter',miter:4},{stroke:'black',width:1.5,join:'round',miter:10}];
  const batches=matrices.flatMap(matrix=>boxes.flatMap(bounds=>styles.map(style=>[{matrix,bounds,style}])));
  const svg=document.getElementById('map'),captured=SceneTest.captureCommands(svg,svg,{world:true});batches.push(captured,[...captured,{kind:'glyph'}],[],[{kind:'glyph'}]);
  const scene=new SceneTest.MapScene(svg,{width:1300}),differences=[];let decisions=0;
  for(const [index,commands] of batches.entries()){
   const expected=native(commands),actual=SceneTest.commandBounds(commands);
   if(JSON.stringify(actual)!==JSON.stringify(expected))differences.push({index,expected,actual});
   if(!expected||!Number.isFinite(expected.x))continue;
   for(const constantStroke of [false,true])for(const z of [1,5,14]){
    const pad=expected.pad/(constantStroke?z:1),item={layer:'roads',constantStroke};
    for(const epsilon of [-1e-9,0,1e-9])for(const view of [{x:expected.right+pad+epsilon,y:expected.y-1,w:10,h:expected.bottom-expected.y+2},{x:expected.x-pad-10-epsilon,y:expected.y-1,w:10,h:expected.bottom-expected.y+2},{x:expected.x-1,y:expected.bottom+pad+epsilon,w:expected.right-expected.x+2,h:10},{x:expected.x-1,y:expected.y-pad-10-epsilon,w:expected.right-expected.x+2,h:10}]){
     decisions++;if(scene.visible({...item,bounds:actual},{},z,view)!==scene.visible({...item,bounds:expected},{},z,view))differences.push({index,constantStroke,z,view});
    }
   }
  }
  return {batches:batches.length,decisions,differences};
 });
 expect(result.batches).toBe(304);expect(result.decisions).toBe(21672);expect(result.differences).toEqual([]);
});
