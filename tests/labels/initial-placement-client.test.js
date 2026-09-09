import test from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';
test('a failing worker fallback rejects its pending request instead of hanging startup',async()=>{
 const bundle=await build({entryPoints:['pipeline/labels/initial-placement-client.js'],bundle:true,format:'esm',write:false,plugins:[{name:'worker-source',setup(b){b.onResolve({filter:/initial-worker\.txt$/},args=>({path:args.path,namespace:'test-worker'}));b.onLoad({filter:/.*/,namespace:'test-worker'},()=>({contents:'',loader:'text'}));}}]});
 const {InitialPlacementClient}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
 const old=globalThis.Worker;let worker;globalThis.Worker=class{constructor(){worker=this;}postMessage(){}terminate(){}};
 const client=new InitialPlacementClient();
 try{const pending=client.solve({annotations:[{id:'duplicate'},{id:'duplicate'}],viewport:{width:500,height:400}});const rejected=assert.rejects(pending,/Duplicate annotation ID/);assert.doesNotThrow(()=>worker.onerror({message:'Worker failed',preventDefault(){}}));await rejected;assert.equal(client.pending.size,0);}
 finally{client.close();globalThis.Worker=old;}
});
