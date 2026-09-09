import test from 'node:test';
import assert from 'node:assert/strict';
import {checkTypography} from '../support/typography-audit.js';
const policy={maxPointDisplacement:32,maxOptionalPointDisplacement:16};
const item={id:'point',kind:'point-label',style:'l-place',fonts:[],angles:[],anchor:{x:0,y:0},bounds:{left:24,top:0,right:44,bottom:10}};
test('independent point audit applies the optional limit in both delivered modes',()=>{
 for(const mode of ['interactive','static'])assert.deepEqual(checkTypography({mode,items:[item]},policy),[{id:'point',reason:'point-displacement',distance:24,maximum:16}]);
});
test('only required static names retain the full displacement allowance',()=>{
 const required={...item,requiredProfiles:['static-default']};
 assert.deepEqual(checkTypography({mode:'static',items:[required]},policy),[]);
 assert.equal(checkTypography({mode:'interactive',items:[required]},policy)[0].maximum,16);
 assert.equal(checkTypography({mode:'static',items:[{...required,bounds:{...item.bounds,left:33}}]},policy)[0].maximum,32);
});
