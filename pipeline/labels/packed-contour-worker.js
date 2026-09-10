import {decodeContourTier} from './packed-contours.js';
self.onmessage=async({data:{id,tier}})=>{
 try{const items=await decodeContourTier(tier),transfer=items.flatMap(item=>item.runs.map(run=>run.points.buffer));self.postMessage({id,items},transfer);}
 catch(error){self.postMessage({id,error:error.message});}
};
