import test from 'node:test';
import assert from 'node:assert/strict';
import {paintCommands} from '../../pipeline/render/scene.js';
const outer={a:1,b:0,c:0,d:1,e:0,f:0};
const style={fill:'none',stroke:'red',width:2,opacity:1,fillOpacity:1,strokeOpacity:1,cap:'round',join:'round',miter:4,dash:[],dashOffset:0,fillRule:'nonzero',paintOrder:'normal'};
function context(){const calls=[];return {calls,setTransform(){calls.push('transform');},setLineDash(){calls.push('dash');},fill(){calls.push('fill');},stroke(){calls.push('stroke');},fillText(s){calls.push('fill:'+s);},strokeText(s){calls.push('stroke:'+s);}};}
test('unpainted path passes do not submit Canvas state writes',()=>{
 const ctx=context();paintCommands(ctx,[{kind:'path',matrix:[1,0,0,1,0,0],style}],outer);
 assert.deepEqual(ctx.calls,['transform','dash','stroke']);
 const empty=context();paintCommands(empty,[{kind:'path',matrix:[1,0,0,1,0,0],style:{...style,stroke:'none'}}],outer);
 assert.deepEqual(empty.calls,[]);
});
test('stroke-first text still paints every halo before any glyph fill',()=>{
 const ctx=context(),commands=['a','b'].map(text=>({kind:'glyph',text,group:1,matrix:[1,0,0,1,0,0],style:{...style,fill:'black',font:'12px sans-serif',paintOrder:'stroke fill'}}));
 paintCommands(ctx,commands,outer);
 assert.deepEqual(ctx.calls.filter(c=>c.includes(':')),['stroke:a','stroke:b','fill:a','fill:b']);
});
