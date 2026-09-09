import test from 'node:test';
import assert from 'node:assert/strict';
import {paintCommands,createPaintState} from '../../pipeline/render/scene.js';
const outer={a:1,b:0,c:0,d:1,e:0,f:0};
const style={fill:'none',stroke:'red',width:2,opacity:1,fillOpacity:1,strokeOpacity:1,cap:'round',join:'round',miter:4,dash:[4,2],dashOffset:0,fillRule:'nonzero',paintOrder:'normal',font:'12px serif'};
const command=(s=style,more={})=>({kind:'path',path:'p',matrix:[1,0,0,1,0,0],style:s,...more});
function context(){
 const values={},counts={},paints=[];
 const target={values,counts,paints,setTransform(...args){values.transform=args;},setLineDash(args){counts.dash=(counts.dash||0)+1;values.dash=[...args];},fill(p,rule){paints.push(['fill',p,rule,structuredClone(values)]);},stroke(p){paints.push(['stroke',p,structuredClone(values)]);},fillText(t){paints.push(['fillText',t,structuredClone(values)]);},strokeText(t){paints.push(['strokeText',t,structuredClone(values)]);}};
 return new Proxy(target,{set(o,k,v){counts[k]=(counts[k]||0)+1;values[k]=v;return true;}});
}
test('draw-local paint state removes redundant native setters across independent command calls',()=>{
 const ctx=context(),state=createPaintState(ctx);
 for(let i=0;i<100;i++)paintCommands(ctx,[command({...style,dash:[4,2]})],outer,{state});
 assert.equal(ctx.paints.length,100);assert.equal(ctx.counts.dash,1);
 for(const key of ['lineWidth','lineCap','lineJoin','miterLimit','lineDashOffset','strokeStyle'])assert.equal(ctx.counts[key],1,key);
 assert.equal(ctx.counts.globalAlpha,100,'opacity remains uncached across sprite paints');
});
test('cached and reference calls have identical paint-time state and order across styles, glyph halos and camera changes',()=>{
 const ref=context(),ctx=context(),state=createPaintState(ctx);
 const sequences=[
  [command()],
  [command({...style,stroke:'blue',fill:'green',opacity:.7,fillOpacity:.5,cap:'butt',join:'miter',miter:8,dash:[2,1,3],dashOffset:-2,paintOrder:'stroke fill'})],
  ['A','B'].map(text=>command({...style,fill:'black',paintOrder:'stroke fill'},{kind:'glyph',group:1,text})),
  [command({...style,width:3,dash:[]})],
 ];
 for(const factor of [1,.25,2])for(const opacity of [1,.25])for(const commands of sequences){
  // Renderer draws sprites between layers, changing only alpha and transform.
  for(const c of [ref,ctx]){c.globalAlpha=.2;c.setTransform(1,0,0,1,10,20);}
  paintCommands(ref,commands,outer,{strokeFactor:factor,opacity});
  paintCommands(ctx,commands,outer,{strokeFactor:factor,opacity,state});
 }
 assert.deepEqual(ctx.paints,ref.paints);
 assert.ok(ctx.counts.dash<ref.counts.dash);
});
test('default calls and a state for another context remain independent of external style mutations',()=>{
 const ctx=context(),other=context(),foreign=createPaintState(other);
 for(const state of [undefined,foreign]){
  paintCommands(ctx,[command()],outer,{state});ctx.lineWidth=99;ctx.strokeStyle='pink';
  paintCommands(ctx,[command()],outer,{state});
  assert.equal(ctx.values.lineWidth,2);assert.equal(ctx.values.strokeStyle,'red');
 }
});
test('fresh draw state restores native state after clear/resize, and changed dash contents are submitted',()=>{
 const ctx=context(),s={...style,dash:[4,2]};let state=createPaintState(ctx);
 paintCommands(ctx,[command(s)],outer,{state});s.dash[0]=8;
 paintCommands(ctx,[command(s)],outer,{state});assert.deepEqual(ctx.values.dash,[8,2]);
 for(const key of Object.keys(ctx.values))delete ctx.values[key];
 state=createPaintState(ctx);paintCommands(ctx,[command(s)],outer,{state});
 assert.equal(ctx.values.lineWidth,2);assert.deepEqual(ctx.values.dash,[8,2]);assert.equal(ctx.values.strokeStyle,'red');
});
