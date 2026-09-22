import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {solveLayout,solveLayoutAsync} from '../../pipeline/labels/place.js';
import {pointFallback} from '../../pipeline/labels/point-fallback.js';

const box=(x,y,width=8,height=8)=>({bounds:{x,y,width,height},parts:[{x,y,width,height}]});
const candidate=(id,shape)=>({id,shape});
const point=(id,anchor,extra={})=>{
  const annotation={id,kind:'point-label',anchor,maxDisplacement:12,...extra};
  const fallbackData={annotation,metric:box(...anchor),variants:[{id:'wrap',shape:box(...anchor,6,12),textHTML:'Two<br/>lines'}],policy:{maxPointDisplacement:12}};
  return {...annotation,candidates:[],fallbackData};
};
function inputs(scene,replay){
  return {...scene,annotations:scene.annotations.map(a=>{
    const {fallbackData,...rest}=a;
    return fallbackData?{...rest,...(replay?{fallbackData}:{}),fallbackCandidates:()=>pointFallback(fallbackData)}:rest;
  })};
}
async function equivalent(scene){
  const expected=solveLayout(inputs(scene,false));
  assert.deepEqual(solveLayout(inputs(scene,true)),expected);
  assert.deepEqual(await solveLayoutAsync(inputs(scene,true),{budgetMs:1}),expected);
  return expected;
}

test('replayed successful fallbacks retain neighbor repair, previous order and reserves',async()=>{
  const a=point('first',[100,100],{required:true,priority:100});
  const first=pointFallback(a.fallbackData)[0];
  const scene={annotations:[a],viewport:{width:300,height:300},policy:{clearance:1,edgePadding:0,pointPreferredDistance:-1,repairBudget:64,measurementReserves:{first:{left:.25,top:.5,right:.75,bottom:.25}},exhaustiveDiagnostics:true},previous:{placements:[{id:'first',candidateId:'grid-0--6'}]}};
  const before=await equivalent(scene);
  scene.annotations.push({id:'later',priority:10,candidates:[candidate('fixed',first.shape)]});
  const after=await equivalent(scene);
  assert.equal(after.placements.length,2,'later placement must repair the earlier fallback');
  assert.notEqual(after.placements[0].candidateId,before.placements[0].candidateId);
  assert.equal(after.placements[0].candidateId,'grid-0--6','repair must retain previous-candidate tie ordering');
  assert.deepEqual(after.missingRequired,[]);
});

test('required fallback retries preserve final hard, later-label and repeat evidence',async()=>{
  const a=point('blocked',[100,100],{required:true,requiredGroup:'route',featureId:'same',repeatDistance:100});
  const scene={annotations:[a,{id:'later',featureId:'same',repeatDistance:100,allowedObstacleIds:['wall'],candidates:[candidate('fixed',box(65,65,70,70))]}],obstacles:[{id:'wall',shape:box(50,50,100,100)}],viewport:{width:300,height:300},policy:{requiredGroups:['route'],repairBudget:3,measurementReserves:{blocked:1},exhaustiveDiagnostics:true}};
  const result=await equivalent(scene);
  assert.deepEqual(result.missingRequired,['blocked','route:route']);
  assert.deepEqual(result.outcomes[0],{id:'blocked',reason:'no-valid-candidate',blockerIds:['later','wall']});
});

test('fallback replay matches the one-shot path across competing wraps and repair budgets',async()=>{
  for(const repairBudget of [0,3,64])for(const exhaustiveDiagnostics of [true,false]){
    const annotations=Array.from({length:12},(_,i)=>point('label-'+i,[60+i%4*11,60+Math.floor(i/4)*11],{priority:100-i,required:i===0,requiredGroup:i<3?'route':undefined,featureId:'feature-'+(i%5),repeatDistance:20}));
    const scene={annotations,obstacles:[{id:'trail',kind:'trail',line:{a:{x:30,y:70},b:{x:140,y:70},width:1}}],viewport:{width:160,height:140},previous:{placements:annotations.map(a=>({id:a.id,candidateId:'wrap-grid-0--8'}))},policy:{clearance:1,repairBudget,repairMaxNeighbors:2,requiredGroups:['route'],measurementReserves:{'label-1':.5},exhaustiveDiagnostics}};
    await equivalent(scene);
  }
});

test('exhaustive fallback geometry is released within a 128 MiB heap',()=>{
  const source=`
    import assert from 'node:assert/strict';
    import {solveLayout} from ${JSON.stringify(new URL('../../pipeline/labels/place.js',import.meta.url).href)};
    import {pointFallback} from ${JSON.stringify(new URL('../../pipeline/labels/point-fallback.js',import.meta.url).href)};
    const box=(width,height)=>({bounds:{x:207,y:204,width,height},parts:[{x:207,y:204,width,height}]});
    const annotations=Array.from({length:220},(_,i)=>{
      const a={id:'name-'+i,kind:'point-label',anchor:[200,200],candidates:[]};
      a.fallbackData={annotation:{kind:a.kind,anchor:a.anchor},metric:box(20,8),variants:[{id:'wrap',shape:box(12,16),textHTML:'A<br/>B'},{id:'short',shape:box(8,8),textHTML:'AB'}],policy:{}};
      a.fallbackCandidates=()=>pointFallback(a.fallbackData);return a;
    });
    const bounds={x:0,y:0,width:500,height:500};
    const result=solveLayout({annotations,obstacles:[{id:'wall',shape:{bounds,parts:[bounds]}}],viewport:bounds,policy:{exhaustiveDiagnostics:true,repairMaxNeighbors:0}});
    assert.equal(result.placements.length,0);assert.equal(result.outcomes.length,annotations.length);
    assert.ok(result.outcomes.every(o=>o.reason==='no-valid-candidate'&&o.blockerIds.join()==='wall'));
    assert.ok(annotations.every(a=>a.candidates.length===0));
    console.log(JSON.stringify({outcomes:result.outcomes.length,heapUsed:process.memoryUsage().heapUsed}));
  `;
  const output=execFileSync(process.execPath,['--max-old-space-size=128','--input-type=module','-e',source],{encoding:'utf8',timeout:90000,stdio:['ignore','pipe','pipe']});
  assert.equal(JSON.parse(output).outcomes,220);
});
