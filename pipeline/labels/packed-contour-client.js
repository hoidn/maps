import {decodeContourTier} from './packed-contours.js';
const cancelled=()=>new DOMException('Contour decoding cancelled','AbortError');
/** Worker transport failures retry the unchanged tier through the portable decoder. */
export class PackedContourClient{
 constructor(source){this.source=source;this.pending=new Map();this.next=0;this.url=null;}
 start(){
  if(this.worker||this.closed||this.blocked)return;
  try{
   this.url=URL.createObjectURL(new Blob([this.source],{type:'text/javascript'}));const worker=this.worker=new Worker(this.url);
   worker.onmessage=({data})=>{
    if(this.worker!==worker)return;const p=this.pending.get(data?.id);if(!p)return;
    if(data.error){this.pending.delete(data.id);p.reject(new Error(data.error));return;}
    if(!Array.isArray(data.items)){this.unavailable(new Error('Invalid contour worker response'));return;}
    this.pending.delete(data.id);p.resolve(data.items);
   };
   worker.onerror=event=>{event.preventDefault?.();if(this.worker===worker)this.unavailable(new Error(event.message||'Contour worker unavailable'));};
   worker.onmessageerror=()=>{if(this.worker===worker)this.unavailable(new Error('Contour worker message unavailable'));};
  }catch(error){this.unavailable(error);}
 }
 unavailable(error){this.error=error.message;this.blocked=true;this.stop();for(const [id,p] of this.pending)this.fallback(id,p);}
 fallback(id,p){
  if(p.fallback||this.closed)return;p.fallback=true;
  decodeContourTier(p.tier,{signal:p.controller.signal}).then(p.resolve,p.reject).finally(()=>this.pending.delete(id));
 }
 decode(tier){
  if(this.closed)return Promise.reject(cancelled());this.start();
  return new Promise((resolve,reject)=>{
   const id=++this.next,p={tier,resolve,reject,controller:new AbortController()};this.pending.set(id,p);
   if(!this.worker){this.fallback(id,p);return;}
   try{this.worker.postMessage({id,tier});}catch(error){this.unavailable(error);}
  });
 }
 stop(){
  if(this.worker){this.worker.onmessage=this.worker.onerror=this.worker.onmessageerror=null;this.worker.terminate();}
  this.worker=null;if(this.url)URL.revokeObjectURL(this.url);this.url=null;
 }
 close(){if(this.closed)return;this.closed=true;this.stop();for(const p of this.pending.values()){p.controller.abort();p.reject(cancelled());}this.pending.clear();}
}
