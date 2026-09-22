// Default pairwise matrix; an explicitly selected region exercises all backends.
import {spawn} from 'node:child_process';
import {access,mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const defaults=[
 ['grand_canyon','chromium','webgl',73191],['sequoia','chromium','canvas',82102],
 ['grand_canyon','firefox','canvas',73193],['sequoia','firefox','svg',82104],
 ['grand_canyon','webkit','svg',73196],['sequoia','webkit','webgl',82107],
];
export function parseArguments(args){
 const result={directory:'artifacts/cartography/fuzz-release',map:null,browserArgs:[]};let directory=false;
 const usage=()=>{throw Error('Usage: fuzz-cartography-matrix.mjs [REPORT_DIR] [--map ID|SPEC.json] [--headed|--headless]')};
 for(let i=0;i<args.length;i++){
  const value=args[i];
  if(value==='--map'){if(result.map||!args[i+1]||args[i+1].startsWith('--'))usage();result.map=args[++i];}
  else if(value==='--headed'||value==='--headless')result.browserArgs.push(value);
  else if(!value.startsWith('-')&&!directory){result.directory=value;directory=true;}
  else usage();
 }
 return result;
}
export function selectCases(map,configuredIds){
 const explicitSpec=map!==null&&typeof map==='object';
 if(explicitSpec){map=map.id;if(typeof map!=='string'||!/^[a-z][a-z0-9_-]*$/.test(map))throw Error('Invalid map ID in specification');}
 if(map&&!explicitSpec&&!configuredIds.includes(map))throw Error('Unknown map: '+map);
 if(!map){for(const [region] of defaults)if(!configuredIds.includes(region))throw Error('Unknown map: '+region);return defaults.map(row=>[...row]);}
 return ['chromium','firefox','webkit'].flatMap(engine=>['svg','canvas','webgl'].map(backend=>{
  const seed=createHash('sha256').update(`${map}:${engine}:${backend}`).digest().readUInt32LE(0);
  return [map,engine,backend,seed];
 }));
}
export function summarizeBackend(requestedBackend,report){
 const activeBackends=[...new Set((report.checks||[]).map(check=>check.backend).filter(Boolean))];
 const status=report.status!=='passed'||!activeBackends.length||report.checks.some(check=>!check.backend)?'failed':activeBackends.some(backend=>backend!==requestedBackend)?'fallback':'passed';
 return {requestedBackend,activeBackends,status};
}
async function main(){
 const args=parseArguments(process.argv.slice(2)),dir=resolve(args.directory);
 const configuredIds=await Promise.all((await readdir('pipeline/maps')).filter(file=>file.endsWith('.json')).sort().map(async file=>JSON.parse(await readFile(join('pipeline/maps',file),'utf8')).id));
 let selected=args.map;
 if(args.map?.endsWith('.json')){selected=JSON.parse(await readFile(args.map,'utf8'));if(!selected||typeof selected!=='object')throw Error('Invalid map specification: '+args.map);}
 const cases=selectCases(selected,configuredIds),runs=[];await mkdir(dir,{recursive:true});
 for(const [region,engine,backend,seed] of cases){
  const reportDir=join(dir,`${region}-${engine}-${backend}`),file=`pipeline/${region}_trails_interactive.html`;
  console.log(JSON.stringify({region,engine,backend,seed,status:'start'}));
  let report,code;
  try{
   try{await access(file);}catch{throw Error('Missing candidate file: '+file);}
   code=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,['scripts/fuzz-cartography.mjs',file,reportDir,String(seed),'18',engine,backend,...args.browserArgs],{stdio:'inherit'});child.on('error',reject);child.on('exit',resolve)});
   report=JSON.parse(await readFile(join(reportDir,'report.json'),'utf8'));
   if(code!==0)report.status='failed';
  }catch(error){code??=1;report={status:'failed',failure:error.message};}
  const backendCoverage=summarizeBackend(backend,report);
  runs.push({...report,region,engine,backend,seed,exitCode:code,reportDir,mechanicalStatus:report.status,backendCoverage,status:backendCoverage.status});
  const status=runs.some(run=>run.status==='failed')?'failed':runs.some(run=>run.status==='fallback')?'incomplete':runs.length===cases.length?'passed':'running';
  await writeFile(join(dir,'matrix.json'),JSON.stringify({status,visualReview:{status:'pending',required:true,flaggedFrames:runs.flatMap(run=>(run.visualReview?.flaggedFrames||run.checks?.filter(check=>check.pointNameCoverage?.reviewRequired).map(check=>check.step)||[]).map(step=>({region:run.region,engine:run.engine,backend:run.backend,step})))},runs},null,2));
 }
 if(runs.some(run=>run.status!=='passed'))process.exitCode=1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await main().catch(error=>{console.error(error.message);process.exitCode=1;});
