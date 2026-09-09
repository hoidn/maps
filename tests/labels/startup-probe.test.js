import test from 'node:test';
import assert from 'node:assert/strict';
import {isCorrectCameraFrame,observeRendererDraw,interleavedRuns} from '../../scripts/startup-probe.mjs';
const before={x:0,y:0,w:1300,h:1070},target={x:10,y:10,w:1200,h:980};
test('active Canvas and changed SVG are insufficient without a completed matching draw',()=>{
 const l={view:target,revision:3,renderer:{active:true}};
 assert.equal(isCorrectCameraFrame(l,before,0,'10 10 1200 980'),false);
 l.renderer.paintedView=before;l.renderer.paintedRevision=3;
 assert.equal(isCorrectCameraFrame(l,before,0,'10 10 1200 980'),false);
 l.renderer.paintedView=target;l.renderer.paintedRevision=2;
 assert.equal(isCorrectCameraFrame(l,before,0,'10 10 1200 980'),false);
 l.renderer.paintedRevision=3;
 assert.equal(isCorrectCameraFrame(l,before,0,'0 0 1300 1070'),true);
});
test('old renderer evidence is published only after successful active draw returns',()=>{
 const l={view:target,revision:3},r={active:false,draw(){assert.notEqual(this.startupPaint?.view.x,l.view.x);}};
 observeRendererDraw(r,l);r.draw();assert.equal(r.startupPaint,undefined);
 r.active=true;r.draw();assert.deepEqual(r.startupPaint,{view:target,revision:3});
 l.view={...target,x:11};r.draw();assert.equal(r.startupPaint.view.x,11);
 const broken={active:true,draw(){throw Error('failed draw');}};observeRendererDraw(broken,l);
 assert.throws(()=>broken.draw(),/failed draw/);assert.equal(broken.startupPaint,undefined);
});
test('SVG requires a changed view and the exact current viewBox',()=>{
 const l={view:target,revision:3};
 assert.equal(isCorrectCameraFrame(l,before,0,'0 0 1300 1070'),false);
 assert.equal(isCorrectCameraFrame(l,before,0,'10 10 1200 980'),true);
 assert.equal(isCorrectCameraFrame({view:before,revision:0},before,0,'0 0 1300 1070'),false);
});
test('each repetition interleaves immutable variants at all three input phases',()=>{
 const runs=interleavedRuns(['baseline','candidate'],3,[25,100,250]);
 assert.equal(runs.length,18);
 assert.deepEqual(runs.slice(0,4),[{repeat:0,offset:25,file:'baseline'},{repeat:0,offset:25,file:'candidate'},{repeat:0,offset:100,file:'baseline'},{repeat:0,offset:100,file:'candidate'}]);
 assert.equal(runs[6].file,'candidate');
});
test('pending Canvas initialization cannot pass through the SVG comparison',()=>{
 const l={view:target,revision:3};
 assert.equal(isCorrectCameraFrame(l,before,0,'10 10 1200 980','canvas'),false);
 l.renderer={active:false};
 assert.equal(isCorrectCameraFrame(l,before,0,'10 10 1200 980','canvas'),false);
});
