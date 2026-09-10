import {contourChunks} from './contour-geometry.js';
const crcTable=Uint32Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
const invalid=reason=>new Error('Invalid packed contour: '+reason);
const integer=n=>Number.isSafeInteger(n)&&n>=0;
/** Decode the same portable integer stream in a worker or cooperative fallback. */
export async function decodeContourTier(tier,{signal,now=()=>performance.now(),yieldControl=()=>new Promise(resolve=>setTimeout(resolve,0))}={}){
 const check=()=>{if(signal?.aborted)throw new DOMException('Contour decoding cancelled','AbortError');};check();
 if(!tier||!Array.isArray(tier.ids)||!tier.ids.length||tier.ids.some(id=>!integer(id))||new Set(tier.ids).size!==tier.ids.length||!integer(tier.coordinates)||!integer(tier.bytes)||!integer(tier.crc32)||tier.crc32>0xffffffff||typeof tier.data!=='string'||tier.data.length%4||!/^[A-Za-z0-9+/]*={0,2}$/.test(tier.data))throw invalid('metadata');
 let deadline=now()+8;const pause=async()=>{check();if(now()>=deadline){await yieldControl();check();deadline=now()+8;}};
 let raw;try{raw=atob(tier.data);}catch{throw invalid('base64');}
 if(raw.length!==tier.bytes||tier.coordinates>raw.length)throw invalid('byte count');
 const bytes=new Uint8Array(raw.length);let crc=0xffffffff;
 for(let i=0;i<raw.length;i++){const value=raw.charCodeAt(i);bytes[i]=value;crc=crcTable[(crc^value)&255]^(crc>>>8);if((i&4095)===4095)await pause();}
 if(((crc^0xffffffff)>>>0)!==tier.crc32)throw invalid('checksum');
 if(bytes[0]!==67||bytes[1]!==84||bytes[2]!==80||bytes[3]!==49)throw invalid('version');
 let offset=4;const uint=()=>{let value=0,multiplier=1,count=0;for(;;){if(offset>=bytes.length)throw invalid('truncated integer');const b=bytes[offset++];value+=(b&127)*multiplier;if(!Number.isSafeInteger(value)||++count>8)throw invalid('integer overflow');if(!(b&128)){if(count>1&&b===0)throw invalid('noncanonical integer');return value;}multiplier*=128;}};
 const count=uint();if(count!==tier.ids.length)throw invalid('path count');
 const items=[];let coordinates=0;
 for(let index=0;index<count;index++){
  const id=uint(),runCount=uint();if(id!==tier.ids[index]||runCount<1||runCount>Math.floor((bytes.length-offset)/5))throw invalid('path identity or run count');
  const runs=[];
  for(let j=0;j<runCount;j++){
   const length=uint();if(length<4||length%2||length>bytes.length-offset||coordinates+length>tier.coordinates)throw invalid('coordinate count');
   const points=new Float64Array(length),previous=[0,0],delta=[0,0];let x=Infinity,y=Infinity,right=-Infinity,bottom=-Infinity;
   for(let i=0;i<length;i++){
    const encoded=uint(),residual=encoded%2?-(encoded+1)/2:encoded/2,axis=i%2,change=delta[axis]+residual,value=previous[axis]+change;
    if(!Number.isSafeInteger(value)||value< -2147483648||value>2147483647)throw invalid('coordinate overflow');
    delta[axis]=change;previous[axis]=value;points[i]=value/1000;
    if(axis){y=Math.min(y,points[i]);bottom=Math.max(bottom,points[i]);}else{x=Math.min(x,points[i]);right=Math.max(right,points[i]);}
    if((i&4095)===4095)await pause();
   }
   coordinates+=length;runs.push({points,bounds:{x,y,width:right-x,height:bottom-y},chunks:contourChunks(points).map(({start,end,bounds})=>({start,end,bounds}))});await pause();
  }
  let x=Infinity,y=Infinity,right=-Infinity,bottom=-Infinity;for(const run of runs){const b=run.bounds;x=Math.min(x,b.x);y=Math.min(y,b.y);right=Math.max(right,b.x+b.width);bottom=Math.max(bottom,b.y+b.height);}
  items.push({id,runs,bounds:{x,y,width:right-x,height:bottom-y}});
 }
 if(offset!==bytes.length||coordinates!==tier.coordinates)throw invalid('trailing data or coordinate total');check();return items;
}
export function contourPathString(item){
 return item.runs.map(({points})=>{const parts=[];for(let i=0;i<points.length;i+=2)parts.push(points[i].toFixed(3)+','+points[i+1].toFixed(3));return 'M'+parts.join(' ');}).join('');
}
