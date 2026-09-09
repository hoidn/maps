import {readFile,writeFile,mkdir,rename,rm} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
/** Both candidates must pass before either destination is changed. Preserve byte
 * snapshots and roll back the pair if a later replacement fails. This is a local
 * promotion, not publication. Verification receives immutable snapshot paths. */
export async function promotePair({sources,destinations,verify,beforeReplace=async()=>{}}){
 if(sources.length!==2||destinations.length!==2||new Set(destinations.map(p=>resolve(p))).size!==2)throw new Error('Expected two distinct destinations');
 const bytes=await Promise.all(sources.map(p=>readFile(p))),hashes=bytes.map(hash),token=randomUUID(),staged=[],originals=[];
 try {
  for(let i=0;i<2;i++){
   await mkdir(dirname(destinations[i]),{recursive:true});
   try{originals.push(await readFile(destinations[i]));}catch(e){if(e.code!=='ENOENT')throw e;originals.push(null);}
   const temporary=destinations[i]+'.'+token+'.candidate.html';staged.push(temporary);await writeFile(temporary,bytes[i],{flag:'wx'});
  }
  const report=await verify(staged,hashes);
  if(report.status!=='pass')throw new Error('Candidate verification failed: '+report.status);
  for(let i=0;i<2;i++)if(hash(await readFile(sources[i]))!==hashes[i]||hash(await readFile(staged[i]))!==hashes[i])throw new Error('Candidate changed during verification');
  let replaced=0;
  try{for(let i=0;i<2;i++){await beforeReplace(i);if(hash(await readFile(staged[i]))!==hashes[i]||hash(await readFile(sources[i]))!==hashes[i])throw new Error('Candidate changed before replacement');await rename(staged[i],destinations[i]);replaced++;}}
  catch(error){for(let i=0;i<replaced;i++){if(originals[i]===null)await rm(destinations[i],{force:true});else{const rollback=destinations[i]+'.'+token+'.rollback';await writeFile(rollback,originals[i]);await rename(rollback,destinations[i]);}}throw error;}
  return {status:'pass',hashes,report};
 }finally{await Promise.all(staged.map(p=>rm(p,{force:true})));}
}
export async function verifyMaps({sources,reportDir,onProgress}){
 const {runAudit}=await import('./audit-map.mjs');
 const {runReleaseScenes}=await import('./release-scenes.mjs');
 const {benchmarkLayout}=await import('./benchmark-layout.mjs');
 const initialHashes=await Promise.all(sources.map(async p=>hash(await readFile(p))));
 const checkHash=(report,index)=>{if(report.artifactSha256!==initialHashes[index])throw new Error('Audit artifact changed during verification');};
 await mkdir(reportDir,{recursive:true});const reports=[];
 for(const browserName of ['chromium','firefox','webkit'])for(const theme of ['light','dark']){
  onProgress?.({stage:'static',browser:browserName,theme,status:'start'});
  const report=await runAudit({input:sources[0],mode:'managed',reportDir:join(reportDir,'static-'+browserName+'-'+theme),browserName,theme,javaScriptEnabled:false,viewport:{width:1440,height:1400}});
  checkHash(report,0);reports.push(report);if(report.status!=='pass')throw new Error('Frozen static audit failed: '+browserName+' '+theme+' '+JSON.stringify(report.counts));
 }
 const scenes=await runReleaseScenes({input:sources[1],reportDir:join(reportDir,'scenes'),onProgress:event=>onProgress?.({stage:'interactive',...event})});checkHash(scenes,1);reports.push(scenes);
 if(scenes.status!=='pass'||!scenes.releaseComplete||!scenes.coverageFrozen)throw new Error('Interactive release scenes failed or coverage review incomplete');
 onProgress?.({stage:'performance',status:'start'});
 const performance=await benchmarkLayout({input:sources[1],reportDir:join(reportDir,'performance')});checkHash(performance,1);reports.push(performance);
 if(performance.status!=='pass')throw new Error('Performance criteria unmet; see '+join(reportDir,'performance'));
 const finalHashes=await Promise.all(sources.map(async p=>hash(await readFile(p))));
 if(finalHashes.some((h,i)=>h!==initialHashes[i]))throw new Error('Candidate changed during verification');
 const report={status:'pass',artifactHashes:initialHashes,reports};
 await writeFile(join(reportDir,'release.json'),JSON.stringify(report,null,2)+'\n');return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const args=process.argv.slice(2),value=(name,fallback)=>args.includes(name)?args[args.indexOf(name)+1]:fallback;
 const onProgress=event=>console.error(JSON.stringify(event));
 const sources=[value('--static','pipeline/grand_canyon_trails_final.html'),value('--interactive','pipeline/grand_canyon_trails_interactive.html')],reportDir=resolve(value('--report','artifacts/layout/release'));
 try{
  const report=args.includes('--promote')?await promotePair({sources,destinations:['output/grand_canyon_trail_sheet_static.html','output/grand_canyon_trail_explorer_interactive.html'],verify:paths=>verifyMaps({sources:paths,reportDir,onProgress})}):await verifyMaps({sources,reportDir,onProgress});
  console.log(JSON.stringify({status:report.status,hashes:report.hashes??report.artifactHashes,reportDir}));
 }catch(error){console.error(error.message);process.exitCode=1;}
}
