import {pointCandidates} from '../../pipeline/labels/candidates.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {solveLayout} from '../../pipeline/labels/place.js';
const ring=(x,y,w,h)=>[[x,y],[x+w,y],[x+w,y+h],[x,y+h],[x,y]];
const footprint=(x,y,width,height)=>({bounds:{x,y,width,height},parts:[{x,y,width,height}]});
const solve=(shape,areaPolygons)=>solveLayout({viewport:{width:100,height:100},policy:{edgePadding:0},annotations:[{id:'area',areaPolygons,candidates:[{id:'c',shape}]}]});
test('area label checks its entire footprint and enclosed holes',()=>{
 const polygons=[[ring(10,10,80,80),ring(40,40,5,5)]];
 assert.equal(solve(footprint(20,20,10,10),polygons).placements.length,1);
 assert.equal(solve(footprint(5,20,20,10),polygons).placements.length,0);
 assert.equal(solve(footprint(35,35,20,20),polygons).placements.length,0);
 assert.deepEqual(solve(footprint(35,35,20,20),polygons).outcomes[0].blockerIds,['area-boundary']);
});
test('concave exterior crossing a footprint is rejected even with all corners inside',()=>{
 const concave=[[[10,10],[90,10],[90,90],[60,90],[60,30],[40,30],[40,90],[10,90],[10,10]]];
 assert.equal(solve(footprint(20,20,60,20),[concave]).placements.length,0);
});
test('disconnected label parts and multipolygons retain exact per-part containment',()=>{
 const parts=[{x:15,y:15,width:5,height:5},{x:75,y:75,width:5,height:5}];
 assert.equal(solve({bounds:{x:15,y:15,width:65,height:65},parts},[[ring(10,10,20,20)],[ring(70,70,20,20)]]).placements.length,1);
});

test('lake names try centered interior placement instead of only point-marker offsets',()=>{
 const a={id:'lake',kind:'point-label',anchor:[100,100],areaPolygons:[[[[75,75],[125,75],[125,125],[75,125],[75,75]]]]};
 a.candidates=pointCandidates(a,{bounds:{x:108,y:74,width:40,height:40},parts:[{x:108,y:74,width:40,height:40}]});
 const r=solveLayout({annotations:[a],viewport:{width:300,height:300}});
 assert.equal(r.placements.length,1);assert.equal(r.placements[0].candidateId,'area-center');
});
