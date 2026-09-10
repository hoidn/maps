const invalid=reason=>new Error('Invalid packed contour: '+reason);
/** Validate ownership against the authored SVG shells before starting a worker. */
export function validateContourPayload(packet,paths){
 if(!packet||packet.version!==1||packet.encoding!=='delta2-varint'||packet.scale!==1000||!Number.isSafeInteger(packet.pathCount)||packet.pathCount<1||packet.pathCount!==paths.length||!Array.isArray(packet.tiers)||!packet.tiers.length)throw invalid('manifest');
 const source=new Map();for(const {id,zoom} of paths){if(!Number.isSafeInteger(id)||id<0||id>=packet.pathCount||source.has(id))throw invalid('source identity');source.set(id,zoom);}
 const seen=new Set(),zooms=new Set();
 for(const tier of packet.tiers){
  if(!tier||![0,2,4.5].includes(tier.zoom)||zooms.has(tier.zoom)||!Array.isArray(tier.ids)||!tier.ids.length)throw invalid('tier');zooms.add(tier.zoom);
  for(const id of tier.ids){if(!source.has(id)||source.get(id)!==tier.zoom||seen.has(id))throw invalid('tier identity');seen.add(id);}
 }
 if(seen.size!==packet.pathCount)throw invalid('missing source geometry');
}

import {PackedContourClient} from './packed-contour-client.js';
import {contourPathString} from './packed-contours.js';
const tierOf=e=>e.closest('.g-finest')?4.5:e.closest('.g-fine')?2:0;
/** Retain decoded world geometry; native d strings are hydrated only on demand. */
export class PackedContourStore{
 static from(svg,map,source){
  const node=svg.ownerDocument.getElementById('map-contour-payload'),paths=[...svg.querySelectorAll('[data-packed-contour]')];
  if(!node){if(paths.length)throw invalid('missing payload');return null;}
  let packet;try{packet=JSON.parse(node.textContent);}catch{throw invalid('manifest JSON');}
  return new PackedContourStore(svg,map,source,packet,paths);
 }
 constructor(svg,map,source,packet,paths){
  const descriptors=paths.map(e=>{const text=e.getAttribute('data-packed-contour'),id=Number(text);if(String(id)!==text)throw invalid('source identity');return {id,zoom:tierOf(e)};});
  validateContourPayload(packet,descriptors);
  this.svg=svg;this.map=map;this.packet=packet;this.paths=paths;this.pathSet=new Set(paths);this.records=new Map();this.jobs=new Map();this.hydrated=new WeakSet();this.tierById=new Map();
  for(const tier of packet.tiers)for(const id of tier.ids)this.tierById.set(id,tier);
  this.client=new PackedContourClient(source);
  this.pageHidden=event=>{if(!event.persisted)this.close();};window.addEventListener('pagehide',this.pageHidden);
 }
 load(tier){
  if(this.closed)return Promise.reject(new DOMException('Contour store closed','AbortError'));
  if(!this.jobs.has(tier.zoom))this.jobs.set(tier.zoom,this.client.decode(tier).then(items=>{if(this.closed)throw new DOMException('Contour store closed','AbortError');for(const item of items)this.records.set(item.id,item);return items;}).catch(error=>{this.error??=error;throw error;}));
  return this.jobs.get(tier.zoom);
 }
 prefetch(view){for(const tier of this.packet.tiers)if(tier.zoom<=this.map.width/view.w)this.load(tier).catch(()=>{});}
 async get(element){
  if(this.closed)throw new DOMException('Contour store closed','AbortError');
  const id=Number(element.getAttribute('data-packed-contour')),tier=this.tierById.get(id);
  if(!tier||!this.pathSet.has(element))throw invalid('unknown source path');
  if(!this.records.has(id))await this.load(tier);
  const record=this.records.get(id);if(!record)throw invalid('missing decoded path');return record;
 }
 annotationPaths(annotation){return (annotation.geometryId?[annotation.geometryId]:annotation.geometryIds||[]).map(id=>this.svg.ownerDocument.getElementById(id)).filter(e=>e?.hasAttribute('data-packed-contour'));}
 needsAnnotation(annotation){return this.annotationPaths(annotation).some(e=>!this.hydrated.has(e));}
 async hydrate(element){if(this.hydrated.has(element))return;const item=await this.get(element);if(this.closed)throw new DOMException('Contour store closed','AbortError');element.setAttribute('d',contourPathString(item));this.hydrated.add(element);}
 async ensureAnnotation(annotation){for(const e of this.annotationPaths(annotation))await this.hydrate(e);}
 async hydrateAll(){
  if(this.allHydrated)return;if(this.hydrating)return this.hydrating;
  this.hydrating=(async()=>{let deadline=performance.now()+8;for(const e of [...this.paths].sort((a,b)=>tierOf(a)-tierOf(b))){await this.hydrate(e);if(performance.now()>=deadline){await new Promise(resolve=>setTimeout(resolve,0));deadline=performance.now()+8;}}this.allHydrated=true;})();
  return this.hydrating;
 }
 close(){if(this.closed)return;this.closed=true;this.client.close();window.removeEventListener('pagehide',this.pageHidden);}
}
