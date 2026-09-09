import test from 'node:test';
import assert from 'node:assert/strict';
import {contourRuns} from '../../pipeline/labels/contour-geometry.js';
test('only the generated absolute polyline syntax is optimized',()=>{
 const runs=contourRuns('M0,0 1,2 3,4M10,20 30,40');assert.equal(runs.length,2);assert.deepEqual([...runs[1]],[10,20,30,40]);
 for(const d of ['M0,0 C1,2 3,4 5,6','m0,0 1,2','M0,0 1,2 Z'])assert.equal(contourRuns(d),null);
});
test('contour chunks retain every segment and join without inventing connections',async()=>{
 const {contourChunks}=await import('../../pipeline/labels/contour-geometry.js');
 const points=new Float64Array(Array.from({length:300},(_,i)=>[i,Math.sin(i)]).flat()),chunks=contourChunks(points,32);
 assert.ok(chunks.length>1);
 for(let i=0;i<298;i++)assert.ok(chunks.some(({points:p})=>{const j=[...p].findIndex((x,k)=>k%2===0&&x===i);return j>=0&&p[j+2]===i+1&&p[j+4]===i+2;}));
 for(const {points:p,bounds:b} of chunks)for(let i=0;i<p.length;i+=2){assert.ok(p[i]>=b.x&&p[i]<=b.x+b.width);assert.ok(p[i+1]>=b.y-1e-12&&p[i+1]<=b.y+b.height+1e-12);}
});
