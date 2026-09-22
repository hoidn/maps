import test from 'node:test';
import assert from 'node:assert/strict';
import {resolvePrintSize} from '../../scripts/print-layout.mjs';
const profile={paperMm:null,mapWidthMm:2000,marginMm:6,maxPageMm:2438.4,groundMeters:{width:100000,height:50000,northWidth:99000,southWidth:101000}};
test('physical fit preserves scale, aspect and measured collar space',()=>{
 const exact=resolvePrintSize(profile,2,50);
 assert.equal(exact.mapWidthMm,2000);assert.equal(exact.pageWidthMm,2012);assert.equal(exact.pageHeightMm,1062);assert.equal(exact.scaleDenominator,50000);
 const fit=resolvePrintSize({...profile,mapWidthMm:null,paperMm:[914.4,609.6]},2,50);
 assert.equal(fit.mapWidthMm,902.4);assert.equal(fit.mapHeightMm,451.2);
 assert.throws(()=>resolvePrintSize({...profile,paperMm:[914.4,609.6]},2,50),/fit/i);
 assert.throws(()=>resolvePrintSize({...profile,paperMm:[110,100],mapWidthMm:null},2,100),/fit/i);
});
