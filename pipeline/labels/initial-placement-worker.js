import {solveInitialPlacement} from './initial-placement.js';
self.onmessage=({data})=>{
 if(data.kind!=='solve-initial')return;
 try{self.postMessage({id:data.id,result:solveInitialPlacement(data.payload)});}
 catch(error){self.postMessage({id:data.id,error:error.message});}
};
