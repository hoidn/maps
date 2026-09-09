import test from 'node:test';
import assert from 'node:assert/strict';
import {CanvasMapRenderer} from '../../pipeline/render/canvas-renderer.js';
test('scene preparation overlaps contour preparation but renderer readiness awaits both',async()=>{
 let finishContours,finishScene,sceneStarted=false,ready=false;
 const contours=new Promise(resolve=>{finishContours=resolve;}),scene=new Promise(resolve=>{finishScene=resolve;});
 const renderer={controller:{preview:{ready:contours,contours:{layers:[]}}},svg:{children:[]},requestedBackend:'canvas',scene:{prepare(){sceneStarted=true;return scene;}}};
 const pending=CanvasMapRenderer.prototype.prepare.call(renderer).then(()=>{ready=true;});
 await Promise.resolve();assert.equal(sceneStarted,true);assert.equal(ready,false);
 finishContours();await Promise.resolve();await Promise.resolve();assert.equal(ready,false);
 finishScene();await pending;assert.equal(ready,true);
});
