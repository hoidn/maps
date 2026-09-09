import {packTrailDataset} from './trail-dataset.js';
import source from './dist/initial-worker.txt';
import {solveInitialPlacementAsync} from './initial-placement.js';
/** Embedded placement worker; cancellation terminates obsolete CPU work. */
export class InitialPlacementClient{
 constructor(){this.pending=new Map();this.next=0;this.start();}
 start(){
  if(this.worker||this.closed||this.blocked)return;
  try{
   this.url=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));this.worker=new Worker(this.url);
   this.worker.onmessage=({data})=>{const p=this.pending.get(data.id);if(!p)return;this.pending.delete(data.id);if(data.error)p.reject(new Error(data.error));else p.resolve(data.result);};
   this.worker.onerror=event=>{
    event.preventDefault?.();this.error=event.message||'Placement worker unavailable';this.blocked=true;this.stop();
    for(const [id,p] of this.pending)this.fallback(id,p);
   };
  }catch(error){this.error=error.message;this.blocked=true;this.stop();}
 }
 fallback(id,p){solveInitialPlacementAsync(p.payload,{signal:p.controller.signal}).then(p.resolve,p.reject).finally(()=>this.pending.delete(id));}
 solve(payload){
  this.start();
  return new Promise((resolve,reject)=>{
   const id=++this.next,p={resolve,reject,payload,controller:new AbortController()};this.pending.set(id,p);
   if(!this.worker){this.fallback(id,p);return;}
   try{const packed=packTrailDataset(payload,this.sentTrailDataset);this.worker.postMessage({kind:'solve-initial',id,payload:packed.payload});this.sentTrailDataset=packed.state;}catch(error){this.pending.delete(id);reject(error);}
  });
 }
 stop(){this.sentTrailDataset=null;this.worker?.terminate();if(this.url)URL.revokeObjectURL(this.url);this.worker=null;this.url=null;}
 cancel(){
  if(!this.pending.size)return;
  this.stop();for(const p of this.pending.values()){p.controller.abort();p.reject(new DOMException('Placement cancelled','AbortError'));}this.pending.clear();
 }
 close(){this.closed=true;this.cancel();this.stop();}
}
