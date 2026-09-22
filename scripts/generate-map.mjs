import {parseArgs,promisify} from 'node:util';
import {spawn,execFile} from 'node:child_process';
import {resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {printMap,parsePrintArgs} from './print-map.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');

export function parseGenerateArgs(args){
 const {values:v}=parseArgs({args,allowPositionals:false,options:{title:{type:'string'},bbox:{type:'string'},id:{type:'string'},cached:{type:'boolean'},paper:{type:'string'},scale:{type:'string'},output:{type:'string'}}});
 const bbox=v.bbox?.split(',').map(Number);
 if(!v.title?.trim()||!bbox||bbox.length!==4||!v.bbox.split(',').every(n=>n.trim())||!bbox.every(Number.isFinite)||!(-180<=bbox[0]&&bbox[0]<bbox[2]&&bbox[2]<=180&&-90<bbox[1]&&bbox[1]<bbox[3]&&bbox[3]<90))throw Error('Use --title NAME --bbox=WEST,SOUTH,EAST,NORTH with valid longitude/latitude bounds');
 if(v.id&&!/^[a-z][a-z0-9_-]*$/.test(v.id))throw Error('--id must be a safe lowercase cache name');
 const printArgs=['--map',v.id||'generated'];for(const key of ['paper','scale','output'])if(v[key]!==undefined)printArgs.push('--'+key,v[key]);
 const print=parsePrintArgs(printArgs);
 return {title:v.title.trim(),bbox,id:v.id,cached:!!v.cached,paper:print.paper,scale:print.scale,output:v.output?print.output:undefined};
}

const stage=(command,args,options)=>new Promise((ok,fail)=>{
 const child=spawn(command,args,{...options,stdio:'inherit'});child.once('error',fail);child.once('exit',code=>code===0?ok():fail(Error(`${command} failed (${code})`)));
});

export async function generateMap(request){
 const python=process.env.MAP_PYTHON||resolve(root,'.venv/bin/python');
 const {stdout}=await promisify(execFile)(python,['-c',`import json,sys
from pathlib import Path
from map_spec import MapSpec
from sources.catalog import atomic_json
request=json.loads(sys.argv[1]);spec=MapSpec.for_extent(request['title'],request['bbox'],map_id=request.get('id'))
path=Path('cache')/spec.id/'map.json';atomic_json(path,spec.to_dict())
print(json.dumps({'id':spec.id,'path':str(path.resolve()),'frame':spec.frame}))`,JSON.stringify(request)],{cwd:resolve(root,'pipeline')});
 const spec=JSON.parse(stdout),env={...process.env,MAP_PYTHON:python};
 console.log('Generated geographic specification:',JSON.stringify(spec));
 if(!request.cached)await stage(python,['fetch_region.py','--map',spec.path,'--source','all'],{cwd:resolve(root,'pipeline'),env});
 await stage('bash',['pipeline/build_maps.sh','--map',spec.path],{cwd:root,env});
 const output=request.output||resolve(root,'artifacts/print',spec.id+'.pdf');
 return printMap({map:spec.path,paper:request.paper,scale:request.scale,output});
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{const report=await generateMap(parseGenerateArgs(process.argv.slice(2)));console.log(JSON.stringify({pdf:report.output,frozenPrintHtml:report.input,report:report.output.replace(/\.pdf$/i,'.print.json')},null,2));}
 catch(error){console.error(error.message);process.exitCode=1;}
}
