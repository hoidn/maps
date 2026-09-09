import source from './dist/initial-worker.txt';
import {solveInitialPlacement} from './initial-placement.js';
/** Embedded worker preserves standalone file delivery. Blocked workers fall back explicitly. */
export class InitialPlacementClient{
 constructor(){
  this.pending=new Map();this.next=0;
  try{this.url=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));this.worker=new Worker(this.url);this.worker.onmessage=({data})=>{const p=this.pending.get(data.id);if(!p)return;this.pending.delete(data.id);if(data.error)p.reject(new Error(data.error));else p.resolve(data.result);};this.worker.onerror=event=>{event.preventDefault?.();this.error=event.message||'Initial placement worker unavailable';this.worker.terminate();this.worker=null;for(const p of this.pending.values())Promise.resolve().then(()=>solveInitialPlacement(p.payload)).then(p.resolve,p.reject);this.pending.clear();};}
  catch(error){this.error=error.message;this.worker=null;}
 }
 solve(payload){
  if(!this.worker)return Promise.resolve().then(()=>solveInitialPlacement(payload));
  return new Promise((resolve,reject)=>{const id=++this.next;this.pending.set(id,{resolve,reject,payload});try{this.worker.postMessage({kind:'solve-initial',id,payload});}catch(error){this.pending.delete(id);reject(error);}});
 }
 close(){this.worker?.terminate();if(this.url)URL.revokeObjectURL(this.url);this.worker=null;this.url=null;}
}
