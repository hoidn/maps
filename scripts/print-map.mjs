import {execFile} from 'node:child_process';
import {promisify,parseArgs} from 'node:util';
import {readFile,writeFile,mkdir,mkdtemp,rename,unlink} from 'node:fs/promises';
import {realpathSync} from 'node:fs';
import {resolve,dirname,basename,join,extname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {chromium} from '@playwright/test';
import {finalizeStatic} from './finalize-static.mjs';

const run=promisify(execFile),root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function canonicalPath(path){
 path=resolve(path);
 try{return realpathSync(path);}catch(error){
  if(error.code!=='ENOENT')throw error;
  return join(canonicalPath(dirname(path)),basename(path));
 }
}
function printDestination(output,inputs=[]){
 output=resolve(output);
 if(extname(output).toLowerCase()!=='.pdf')throw Error('--output must have a .pdf extension');
 const destinations=[output,output.replace(/\.pdf$/i,'.print.json')].map(canonicalPath);
 if(destinations.some(path=>['output','pipeline'].some(dir=>path.startsWith(canonicalPath(join(root,dir))+'/'))))throw Error('Print artifacts belong outside pipeline/ and output/');
 if(inputs.some(input=>destinations.includes(canonicalPath(input))))throw Error('PDF and report destinations must differ from every input');
 return output;
}
export function parsePrintArgs(args){
 const {values:v}=parseArgs({args,options:{map:{type:'string'},paper:{type:'string'},scale:{type:'string'},output:{type:'string'}},allowPositionals:false});
 if(!v.map||(!v.map.endsWith('.json')&&!/^[a-z][a-z0-9_-]*$/.test(v.map)))throw Error('--map requires a configured map ID or JSON specification');
 if(v.scale!==undefined&&!(Number.isFinite(Number(v.scale))&&Number(v.scale)>0))throw Error('--scale must be finite and positive');
 if(v.paper){const m=v.paper.match(/^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)(in|mm)$/);if(!m||![m[1],m[2]].every(n=>Number(n)*(m[3]==='in'?25.4:1)>=100&&Number(n)*(m[3]==='in'?25.4:1)<=2438.4))throw Error('--paper must be WIDTHxHEIGHTin or WIDTHxHEIGHTmm, 100 mm to 96 inches');}
 const output=v.output?printDestination(v.output,v.map.endsWith('.json')?[v.map]:[]):undefined;
 return {map:v.map.endsWith('.json')?resolve(v.map):v.map,paper:v.paper,scale:v.scale===undefined?undefined:Number(v.scale),output};
}

async function pdfTools(){
 for(const name of ['pdfinfo','pdffonts','pdftoppm','mutool'])await run(name,name==='mutool'?['-v']:['-v']).catch(error=>{throw Error(`Required PDF tool ${name} unavailable: ${error.message}`);});
}

/** Export already audited bytes; commit the destination only after independent PDF checks. */
export async function exportPdf({input,output,finalization,python=join(root,'.venv/bin/python')}){
 input=resolve(input);output=printDestination(output,[input]);
 const bytes=await readFile(input),frozenSha256=sha(bytes);
 if(finalization?.artifactSha256!==frozenSha256||finalization.audits.length!==6||finalization.audits.some(a=>a.status!=='pass'||a.artifactSha256!==frozenSha256))throw Error('PDF requires the exact frozen HTML with all six passing audits');
 await pdfTools();await mkdir(dirname(output),{recursive:true});
 const folder=await mkdtemp(join(dirname(output),'.print-check-')),candidate=join(dirname(output),'.'+randomUUID()+'.pdf');
 let browser;
 try{
  browser=await chromium.launch();const browserVersion=browser.version();
  const page=await browser.newPage({javaScriptEnabled:false,viewport:finalization.viewport,colorScheme:'light'});
  await page.route('**/*',r=>r.abort('blockedbyclient'));await page.setContent(bytes.toString(),{waitUntil:'load'});await page.emulateMedia({media:'print'});
  const data=await page.evaluate(async()=>{
   await Promise.all([...document.fonts].map(f=>f.load()));await document.fonts.ready;
   const manifest=JSON.parse(document.getElementById('map-label-manifest').textContent),p=manifest.map.print;
   if(!p?.layout||!document.querySelector('[data-layout-frozen]')||document.querySelector('#map-layout-runtime'))throw Error('Expected a frozen physical print sheet');
   if([...document.fonts].some(f=>f.status!=='loaded'))throw Error('Print font loading failed');
   for(const img of document.images)if(!img.complete||!img.naturalWidth)throw Error('Print image loading failed');
   const sheet=document.querySelector('.print-sheet').getBoundingClientRect(),bar=document.getElementById('print-calibration')?.getBoundingClientRect();
   if(!bar||Math.abs(bar.width-100*96/25.4)>.5)throw Error('Missing or mis-sized calibration bar');
   const overflow=[...document.querySelectorAll('.print-title,.print-map-frame,.print-collar,.print-collar .lg-item,.print-ticks .tick')].some(e=>{const r=e.getBoundingClientRect();return r.width&&r.height&&(r.x<-.5||r.y<-.5||r.right>sheet.right+.5||r.bottom>sheet.bottom+.5);});
   if(overflow||Math.abs(sheet.width-p.layout.pageWidthMm*96/25.4)>.5||Math.abs(sheet.height-p.layout.pageHeightMm*96/25.4)>.5)throw Error('Print sheet overflow or dimensions changed');
   const map=document.getElementById('mapsvg').getBoundingClientRect();
   return {profile:p,bar:{x:bar.x,y:bar.bottom,width:bar.width},map:{x:map.x*.75,y:map.y*.75,width:map.width*.75,height:map.height*.75},sources:JSON.parse(document.getElementById('print-sources').textContent),title:document.title};
  });
  const {pageWidthMm,pageHeightMm}=data.profile.layout;
  await page.pdf({path:candidate,width:pageWidthMm+'mm',height:pageHeightMm+'mm',preferCSSPageSize:true,scale:1,printBackground:true,displayHeaderFooter:false,margin:{top:0,right:0,bottom:0,left:0}});
  await browser.close();browser=null;
  const {stdout:info}=await run('pdfinfo',[candidate]);
  const pages=Number(info.match(/^Pages:\s+(\d+)/m)?.[1]),size=info.match(/^Page size:\s+([\d.]+) x ([\d.]+) pts/m);
  if(pages!==1||!size||Math.abs(Number(size[1])-pageWidthMm*72/25.4)>.5||Math.abs(Number(size[2])-pageHeightMm*72/25.4)>.5)throw Error('PDF page count or physical size differs from print request');
  const {stdout:fonts}=await run('pdffonts',[candidate]);
  const rows=fonts.trim().split('\n').slice(2);
  if(!rows.length||rows.some(row=>row.trim().split(/\s+/).at(-5)!=='yes'))throw Error('PDF contains missing or unembedded fonts');
  const trace=join(folder,'trace.xml');await run('mutool',['draw','-F','trace','-o',trace,candidate]);
  const operators=await readFile(trace,'utf8'),vectorPaths=(operators.match(/<(?:fill|stroke)_path\b/g)||[]).length,textOperations=(operators.match(/<(?:fill|stroke)_text\b/g)||[]).length,images=(operators.match(/<fill_image\b/g)||[]).length;
  if(!vectorPaths||!textOperations||(data.profile.rasters.length&&!images))throw Error('PDF lost vector paths, text, or terrain images');
  await run('mutool',['extract','-r',candidate],{cwd:folder,maxBuffer:4*1024*1024});
  const x=Math.max(0,Math.floor(data.bar.x*.75)-3),y=Math.max(0,Math.floor(data.bar.y*.75)-3),width=Math.ceil(data.bar.width*.75)+6;
  await run('pdftoppm',['-r','72','-x',String(x),'-y',String(y),'-W',String(width),'-H','7','-singlefile','-png',candidate,join(folder,'calibration')]);
  await run('pdftoppm',['-scale-to','1800','-singlefile','-png',candidate,join(folder,'preview')]);
  const {stdout:raster}=await run(python,['-c',`import json,sys,xml.etree.ElementTree as ET
from pathlib import Path
from PIL import Image,ImageStat
im=Image.open(sys.argv[1]).convert('RGB'); longest=0
for y in range(im.height):
 run=0
 for x in range(im.width):
  run=run+1 if max(im.getpixel((x,y)))<170 else 0
  longest=max(longest,run)
preview=Image.open(sys.argv[2]).convert('RGB')
box=json.loads(sys.argv[4]); counts={'mapVectorPaths':0,'mapTextOperations':0}
def inside(x,y):return box['x']+1<x<box['x']+box['width']-1 and box['y']+1<y<box['y']+box['height']-1
for op in ET.parse(sys.argv[3]).iter():
 if op.tag not in ('fill_path','stroke_path','fill_text','stroke_text'):continue
 a,b,c,d,e,f=map(float,op.get('transform','1 0 0 1 0 0').split())
 points=[(float(p.get('x')),float(p.get('y'))) for p in op.iter() if p.get('x') is not None and p.get('y') is not None]
 if any(inside(a*x+c*y+e,b*x+d*y+f) for x,y in points):counts['mapTextOperations' if op.tag.endswith('text') else 'mapVectorPaths']+=1
image_stats=[]
for path in Path(sys.argv[3]).parent.glob('image-*'):
 try:
  image=Image.open(path).convert('RGB');stats=ImageStat.Stat(image);image_stats.append({'pixels':list(image.size),'stddev':stats.stddev,'mean':stats.mean})
 except OSError:pass
print(json.dumps({'calibrationMm':longest*25.4/72,'rasterStddev':ImageStat.Stat(preview).stddev,'extractedImages':image_stats,**counts}))`,join(folder,'calibration.png'),join(folder,'preview.png'),trace,JSON.stringify(data.map)]);
  const checked=JSON.parse(raster);
  if(Math.abs(checked.calibrationMm-100)>1||Math.max(...checked.rasterStddev)<5)throw Error('PDF rasterization is blank or calibration bar is incorrect');
  if(!checked.mapVectorPaths||!checked.mapTextOperations)throw Error('PDF map interior lost vector cartography or text');
  for(const raster of data.profile.rasters.filter(r=>r.layer==='relief'))if(!checked.extractedImages.some(i=>i.pixels.every((v,n)=>v===raster.pixels[n])&&['mean','stddev'].every(key=>i[key].every((v,n)=>Math.abs(v-raster.pixelStatistics[key][n])<3))))throw Error('PDF terrain differs from source pixels or lost its source dimensions');
  const pdfSha256=sha(await readFile(candidate));
  const report={status:'pass',output,input,title:data.title,sourceSha256:finalization.sourceSha256,frozenSha256,pdfSha256,browserVersion,print:data.profile,sources:data.sources.records,sourceInventory:data.sources.inventory,sourceIssues:data.sources.issues,audits:finalization.audits.map(a=>({browser:a.browser,theme:a.theme,status:a.status,artifactSha256:a.artifactSha256})),pdf:{pages,pagePoints:size.slice(1).map(Number),fontsEmbedded:true,vectorPaths,textOperations,images,...checked},inspectionDirectory:folder};
  await writeFile(join(folder,'pdfinfo.txt'),info);await writeFile(join(folder,'pdffonts.txt'),fonts);
  await writeFile(join(folder,'report.json'),JSON.stringify(report,null,2)+'\n');
  // Prepare the sibling report before committing the PDF; no validation follows replacement.
  const reportPath=output.replace(/\.pdf$/i,'.print.json'),pendingReport=join(folder,'sibling.json');
  await writeFile(pendingReport,JSON.stringify(report,null,2)+'\n');
  const previous=await readFile(reportPath).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
  await rename(pendingReport,reportPath);
  try{await rename(candidate,output);}catch(error){
   if(previous===null)await unlink(reportPath);else{await writeFile(pendingReport,previous);await rename(pendingReport,reportPath);}
   throw error;
  }
  return report;
 }finally{await browser?.close();await unlink(candidate).catch(e=>{if(e.code!=='ENOENT')throw e;});}
}

export async function printMap(request){
 const {paper,scale}=request,map=request.map.endsWith('.json')?resolve(request.map):request.map;
 const python=process.env.MAP_PYTHON||join(root,'.venv/bin/python');
 const {stdout}=await run(python,['-c','import sys;from map_spec import MapSpec;print(MapSpec.load(sys.argv[1]).id)',map],{cwd:join(root,'pipeline')});
 const id=stdout.trim(),output=printDestination(request.output||join(root,'artifacts/print',id+'.pdf'),map.endsWith('.json')?[map]:[]);
 const args=['--map',map,'--mode','static','--print'];
 if(map==='grand_canyon')args.splice(0,4);
 if(paper)args.push('--paper',paper);if(scale!==undefined)args.push('--scale',String(scale));
 await pdfTools();await mkdir(dirname(output),{recursive:true});
 const folder=await mkdtemp(join(dirname(output),id+'-')),input=join(folder,'staging.html'),frozen=join(folder,'frozen.html');
 await run(process.execPath,[join(root,'scripts/build-labels.mjs')],{cwd:root});
 await run(python,[map==='grand_canyon'?'build_static.py':'build_region.py',...args,'--output',input],{cwd:join(root,'pipeline'),maxBuffer:16*1024*1024});
 const finalization=await finalizeStatic({input,output:frozen,reportDir:join(folder,'layout')});
 return exportPdf({input:frozen,output,finalization,python});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{const report=await printMap(parsePrintArgs(process.argv.slice(2)));console.log(JSON.stringify({output:report.output,frozenHtml:report.input,report:report.output.replace(/\.pdf$/i,'.print.json'),pageMm:[report.print.layout.pageWidthMm,report.print.layout.pageHeightMm],scale:report.print.layout.scaleDenominator},null,2));}
 catch(error){console.error(error.message);process.exitCode=1;}
}
