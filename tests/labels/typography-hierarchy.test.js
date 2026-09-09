import test from 'node:test';
import assert from 'node:assert/strict';
import {checkTypography} from '../support/typography-audit.js';
test('independent typography audit enforces settlement, road and route minima',()=>{
 const item=(id,style,size)=>({id,kind:'line-label',style,fonts:[{size}],angles:[]});
 const report=checkTypography({mode:'interactive',items:[item('settlement','l-settlement',14),item('road','l-road',12),item('major','l-road-major',12),item('ref','l-road-ref',12)]},{sizes:{place:14,settlement:18,road:12,roadMajor:14,roadRef:14}});
 assert.deepEqual(report.map(f=>[f.id,f.reason,f.minimum]),[['settlement','minimum-font-size',18],['major','minimum-font-size',14],['ref','minimum-font-size',14]]);
});
