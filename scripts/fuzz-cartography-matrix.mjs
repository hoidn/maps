// Pairwise visual fuzz matrix; each region exercises every rendering backend.
import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
const dir=resolve(process.argv[2]||'artifacts/cartography/fuzz-release');
const cases=[
 ['grand_canyon','chromium','webgl',73191],['sequoia','chromium','canvas',82102],
 ['grand_canyon','firefox','canvas',73193],['sequoia','firefox','svg',82104],
 ['grand_canyon','webkit','svg',73196],['sequoia','webkit','webgl',82107],
];
await mkdir(dir,{recursive:true});const runs=[];
for(const [region,engine,backend,seed] of cases){
 const reportDir=join(dir,`${region}-${engine}-${backend}`),file=`pipeline/${region}_trails_interactive.html`;
 console.log(JSON.stringify({region,engine,backend,seed,status:'start'}));
 const code=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,['scripts/fuzz-cartography.mjs',file,reportDir,String(seed),'18',engine,backend,...process.argv.slice(3)],{stdio:'inherit'});child.on('error',reject);child.on('exit',resolve)});
 let report;try{report=JSON.parse(await readFile(join(reportDir,'report.json')))}catch(e){report={status:'failed',failure:e.message}}
 runs.push({region,engine,backend,seed,exitCode:code,reportDir,...report});
 await writeFile(join(dir,'matrix.json'),JSON.stringify({status:runs.some(r=>r.status!=='passed')?'failed':runs.length===cases.length?'passed':'running',visualReview:{status:'pending',required:true,flaggedFrames:runs.flatMap(r=>(r.visualReview?.flaggedFrames||r.checks?.filter(c=>c.pointNameCoverage?.reviewRequired).map(c=>c.step)||[]).map(step=>({region:r.region,engine:r.engine,backend:r.backend,step})))},runs},null,2));
}
if(runs.some(r=>r.status!=='passed'))process.exitCode=1;
