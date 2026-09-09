import {unpackTrailDataset} from './trail-dataset.js';
import {solveInitialPlacement} from './initial-placement.js';
let trailDataset=null;
self.onmessage=({data})=>{
 if(data.kind!=='solve-initial')return;
 try{const unpacked=unpackTrailDataset(data.payload,trailDataset);trailDataset=unpacked.state;self.postMessage({id:data.id,result:solveInitialPlacement(unpacked.payload)});}
 catch(error){self.postMessage({id:data.id,error:error.message});}
};
