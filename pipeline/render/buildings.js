import {SpatialIndex} from '../labels/spatial-index.js';
import {captureCommands,commandBounds} from './scene.js';

const NS='http://www.w3.org/2000/svg';
const ATTRIBUTES={class:'area-building','data-max-mpp':'8','fill-rule':'evenodd',style:'fill:var(--building-fill);stroke:var(--building-edge);stroke-width:calc(.15px * var(--s))'};
const abort=()=>new DOMException('Building preparation cancelled','AbortError');
const pause=()=>new Promise(resolve=>setTimeout(resolve,0));

/** Materializes only the indexed building paths needed by the current view. */
export class BuildingMaterializer{
 constructor(svg,map,controller){
  this.svg=svg;this.map=map;this.controller=controller;this.themeGeneration=0;this.nodes=new Map();this.committed=null;this.pending=null;this.closed=false;
  this.ready=this.initialize();
  this.pageHidden=event=>{if(!event.persisted)this.close();};window.addEventListener('pagehide',this.pageHidden);
 }
 async initialize(){
  const marked=[...this.svg.querySelectorAll('.buildings[data-building-payload]')],payload=document.getElementById('map-building-payload');
  if(!marked.length&&!payload){this.legacy=true;return;}
  if(marked.length!==1)throw new Error('Building geometry unavailable: expected one marked buildings group');
  this.group=marked[0];
  if(this.group.dataset.buildingPayload!=='map-building-payload'||!payload)throw new Error('Building geometry unavailable: marked group has no matching payload');
  let parsed;try{parsed=JSON.parse(payload.textContent);}catch(error){throw new Error('Building geometry unavailable: invalid payload JSON ('+error.message+')');}
  if(parsed?.version!==1||!parsed.attributes||!Array.isArray(parsed.paths)||!parsed.paths.length)throw new Error('Building geometry unavailable: invalid payload schema');
  const keys=Object.keys(ATTRIBUTES).sort(),given=Object.keys(parsed.attributes).sort();
  if(keys.length!==given.length||keys.some((key,i)=>key!==given[i]||parsed.attributes[key]!==ATTRIBUTES[key]))throw new Error('Building geometry unavailable: unexpected shared attributes');
  for(const [i,row] of parsed.paths.entries()){
   if(!Array.isArray(row)||row.length!==3||typeof row[0]!=='string'||!row[0].trim()||typeof row[1]!=='string'||!row[1].trim()||!Array.isArray(row[2])||row[2].length!==4||!row[2].every(Number.isFinite)||row[2][0]>row[2][2]||row[2][1]>row[2][3])throw new Error('Building geometry unavailable: invalid path record '+i);
  }
  // JSON.parse has made its own arrays; release the large serialized source now.
  payload.remove();this.attributes=parsed.attributes;this.records=parsed.paths;parsed=null;
  this.index=new SpatialIndex();let deadline=performance.now()+8;
  for(let i=0;i<this.records.length;i++){
   const [,,b]=this.records[i];this.index.insert(i,{x:b[0],y:b[1],width:b[2]-b[0],height:b[3]-b[1]});
   if(performance.now()>=deadline){await pause();if(this.closed)throw abort();deadline=performance.now()+8;}
  }
  this.enabled=true;
 }
 viewKey(view){
  const rect=this.svg.getBoundingClientRect(),scale=Math.min(rect.width/view.w,rect.height/view.h);
  return JSON.stringify([view.x,view.y,view.w,view.h,rect.width,rect.height,scale,this.themeGeneration]);
 }
 select(view){
  if(!this.enabled)return [];
  const rect=this.svg.getBoundingClientRect(),scale=Math.min(rect.width/view.w,rect.height/view.h),meters=this.map.metersPerMapUnit||0,mpp=meters/scale,maxMpp=Number(this.attributes['data-max-mpp']);
  if(!this.svg.isConnected||!(rect.width>0&&rect.height>0&&scale>0&&Number.isFinite(mpp)))throw new Error('Building geometry unavailable: map viewport has no finite scale');
  if(mpp>maxMpp)return [];
  const zoom=this.map.width/view.w,stroke=.15/zoom,pad=.001+stroke*4/2;
  const query={x:view.x-pad,y:view.y-pad,width:view.w+2*pad,height:view.h+2*pad};
  return this.index.query(query).filter(i=>{const b=this.records[i][2];return b[2]>=query.x&&b[0]<=query.x+query.width&&b[3]>=query.y&&b[1]<=query.y+query.height;}).sort((a,b)=>a-b);
 }
 async prepare(view,{capture=false}={}){
  await this.ready;if(this.closed)throw abort();if(this.legacy)return null;
  const key=this.viewKey(view),committedReady=this.committed?.key===key&&(!capture||this.committed.indices.every(i=>this.nodes.get(i)?.commands&&this.nodes.get(i)?.themeGeneration===this.themeGeneration));
  if(committedReady)return this.committed;
  const indices=this.select(view);
  if(this.pending?.key===key&&(!capture||this.pending.capture))return this.pending.promise;
  if(this.pending)this.cancelPending();
  const token={key,view:{...view},indices,capture,themeGeneration:this.themeGeneration,cancelled:false};this.pending=token;
  const keep=new Set([...this.committed?.indices||[],...indices]);
  for(const [i,node] of this.nodes)if(!keep.has(i)){node.element.remove();this.nodes.delete(i);}
  let rejectCancelled;const cancelled=new Promise((_,reject)=>{rejectCancelled=reject;});
  token.rejectCancelled=()=>rejectCancelled(abort());token.promise=Promise.race([this.build(token),cancelled]);this.controller.resolveWaiters();
  return token.promise;
 }
 current(token){return !this.closed&&!token.cancelled&&this.pending===token&&token.themeGeneration===this.themeGeneration;}
 async build(token){
  if(!this.current(token))throw abort();
  const zoom=this.map.width/token.view.w;
  token.stage=document.createElementNS(NS,'g');token.stage.dataset.layoutRuntime='';token.stage.setAttribute('visibility','hidden');token.stage.style.setProperty('--s',String(1/zoom));this.group.append(token.stage);
  const items=[];let deadline=performance.now()+8;
  try{
   for(const i of token.indices){
    if(!this.current(token))throw abort();
    let node=this.nodes.get(i);
    if(!node){
     const [d,sourceId]=this.records[i],element=document.createElementNS(NS,'path');
     for(const [name,value] of Object.entries(this.attributes))element.setAttribute(name,value);
     element.setAttribute('d',d);element.dataset.sourceId=sourceId;node={element,commands:null,themeGeneration:-1};this.nodes.set(i,node);
    }
    if(node.element.parentElement!==this.group&&node.element.parentElement!==token.stage)token.stage.append(node.element);
    // A previously committed path already has the current inherited camera scale.
    if(token.capture&&(node.themeGeneration!==this.themeGeneration||!node.commands)){
     const currentZoom=this.map.width/this.svg.viewBox.baseVal.width,normalize=node.element.parentElement===this.group?currentZoom:zoom;
     const commands=captureCommands(node.element,this.svg,{world:true});
     for(const command of commands){command.style.width*=normalize;command.style.dash=command.style.dash.map(n=>n*normalize);command.style.dashOffset*=normalize;}
     node.commands=commands;node.themeGeneration=this.themeGeneration;
    }
    items.push({kind:'commands',element:node.element,layer:'buildings',commands:node.commands||[],maxMpp:Number(this.attributes['data-max-mpp']),bounds:node.commands?commandBounds(node.commands):null,constantStroke:true,sourceIndex:i});
    if(performance.now()>=deadline){await pause();if(!this.current(token))throw abort();deadline=performance.now()+8;}
   }
   if(!this.current(token))throw abort();
   token.items=items;token.done=true;return token;
  }catch(error){if(this.pending===token)this.pending=null;this.cleanupStage(token);throw error;}
 }
 cleanupStage(token,keep=[]){
  const retain=new Set([...this.committed?.indices||[],...this.pending?.indices||[],...keep]);
  for(const [i,node] of this.nodes)if(!retain.has(i)){node.element.remove();this.nodes.delete(i);}
  token?.stage?.remove();
 }
 isPrepared(view,{capture=true}={}){
  if(this.legacy)return true;if(!this.enabled)return false;
  const key=this.viewKey(view),ready=p=>p?.key===key&&p.done===true&&(!capture||p.indices.every(i=>this.nodes.get(i)?.commands&&this.nodes.get(i)?.themeGeneration===this.themeGeneration));
  return ready(this.committed)||ready(this.pending);
 }
 commit(prepared=this.pending){
  if(this.legacy||!this.enabled)return null;
  prepared??=this.committed;
  if(!prepared||prepared.done!==true||prepared.cancelled||prepared.themeGeneration!==this.themeGeneration||prepared.key!==this.viewKey(prepared.view))throw abort();
  if(prepared===this.committed)return prepared.items;
  const fragment=document.createDocumentFragment();for(const i of prepared.indices)fragment.append(this.nodes.get(i).element);
  this.group.replaceChildren(fragment);prepared.stage?.remove();
  const items=prepared.items||prepared.indices.map(i=>{const node=this.nodes.get(i);return {kind:'commands',element:node.element,layer:'buildings',commands:node.commands||[],maxMpp:Number(this.attributes['data-max-mpp']),bounds:node.commands?commandBounds(node.commands):null,constantStroke:true,sourceIndex:i};});
  this.committed={key:prepared.key,view:prepared.view,indices:prepared.indices,items,done:true,themeGeneration:prepared.themeGeneration};
  if(this.pending===prepared)this.pending=null;
  const keep=new Set(prepared.indices);for(const [i,node] of this.nodes)if(!keep.has(i)){node.element.remove();this.nodes.delete(i);}
  this.controller.resolveWaiters();return items;
 }
 cancelPending(){if(!this.pending)return;const token=this.pending;token.cancelled=true;this.pending=null;this.cleanupStage(token);token.rejectCancelled?.();}
 invalidateTheme(){if(!this.enabled)return;this.themeGeneration++;if(this.pending)this.cancelPending();}
 close(){if(this.closed)return;this.closed=true;this.cancelPending();window.removeEventListener('pagehide',this.pageHidden);this.controller.resolveWaiters();}
}
