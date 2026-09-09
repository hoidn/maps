import test from 'node:test';
import assert from 'node:assert/strict';
import {validRect,intersects,contains,lineHitsRect} from '../../pipeline/labels/geometry.js';
// Retain the prior clipping formula independently to check floating-point boundaries.
function reference(line,rect,gap=0){
 if(!rect||![rect.x,rect.y,rect.width,rect.height].every(Number.isFinite)||rect.width<0||rect.height<0)throw Error('Invalid rectangle');
 const n=(line.width||0)/2+gap,r={x:rect.x-n,y:rect.y-n,width:rect.width+2*n,height:rect.height+2*n},a=line.a,b=line.b;
 if(![a.x,a.y,b.x,b.y].every(Number.isFinite))throw Error('Invalid line');
 let lo=0,hi=1;const dx=b.x-a.x,dy=b.y-a.y;
 for(const [p,q] of [[-dx,a.x-r.x],[dx,r.x+r.width-a.x],[-dy,a.y-r.y],[dy,r.y+r.height-a.y]]){
  if(Math.abs(p)<1e-12){if(q<0)return false;continue;}
  const t=q/p;if(p<0)lo=Math.max(lo,t);else hi=Math.min(hi,t);if(lo>hi)return false;
 }
 return true;
}
test('hot rectangle and clipping checks avoid temporary array validation and iteration',()=>{
 const rect={x:0,y:0,width:10,height:10},line={a:{x:-2,y:5},b:{x:12,y:5},width:1};
 const every=Array.prototype.every,iterator=Array.prototype[Symbol.iterator];let validations=0,iterations=0;
 Array.prototype.every=function(...args){validations++;return every.apply(this,args);};
 Array.prototype[Symbol.iterator]=function(){iterations++;return iterator.call(this);};
 let result;
 try{result=[validRect(rect),intersects(rect,rect),contains(rect,rect),lineHitsRect(line,rect)];}
 finally{Array.prototype.every=every;Array.prototype[Symbol.iterator]=iterator;}
 assert.deepEqual(result,[rect,true,true,true]);assert.equal(validations,0);assert.equal(iterations,0);
});
test('allocation-free clipping retains prior exact results around boundaries and degeneracies',()=>{
 let seed=74201;const random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/2**32);
 const cases=[];
 for(let i=0;i<10000;i++)cases.push([{a:{x:random()*200-100,y:random()*200-100},b:{x:random()*200-100,y:random()*200-100},width:random()*6},{x:random()*100-50,y:random()*100-50,width:random()*50,height:random()*50},random()*4]);
 for(const delta of [-1e-7,-1e-12,-1e-13,-0,0,1e-13,1e-12,1e-7])for(const width of [0,1,NaN,Infinity,-2]){
  cases.push([{a:{x:0,y:delta},b:{x:delta,y:10},width},{x:0,y:0,width:0,height:10},0]);
  cases.push([{a:{x:-1,y:delta},b:{x:11,y:delta},width},{x:0,y:0,width:10,height:10},delta]);
 }
 for(const [line,rect,gap] of cases)assert.equal(lineHitsRect(line,rect,gap),reference(line,rect,gap));
});
test('invalid rectangle and endpoint errors remain unchanged',()=>{
 const rect={x:0,y:0,width:10,height:10},line={a:{x:0,y:0},b:{x:10,y:10}};
 for(const key of ['x','y','width','height'])for(const value of [NaN,Infinity,-Infinity,null,undefined,'1']){
  const invalid={...rect,[key]:value};assert.throws(()=>validRect(invalid),/^Error: Invalid rectangle$/);assert.throws(()=>lineHitsRect(line,invalid),/^Error: Invalid rectangle$/);
 }
 for(const key of ['width','height'])assert.throws(()=>validRect({...rect,[key]:-1}),/^Error: Invalid rectangle$/);
 for(const endpoint of ['a','b'])for(const coordinate of ['x','y'])for(const value of [NaN,Infinity,-Infinity,null,undefined,'1'])assert.throws(()=>lineHitsRect({...line,[endpoint]:{...line[endpoint],[coordinate]:value}},rect),/^Error: Invalid line$/);
 assert.equal(validRect({...rect,width:-0,height:0}).width,-0);
});
