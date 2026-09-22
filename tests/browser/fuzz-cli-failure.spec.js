import {test,expect} from '@playwright/test';
import {execFile} from 'node:child_process';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

for(const blocked of ['failed-input.html','report.json','contact-sheet.html'])test(`fuzz CLI preserves its failure and closes resources when ${blocked} cannot be written`,async({browserName})=>{
 test.skip(browserName!=='chromium','This CLI regression owns its Chromium subprocess.');
 const dir=await mkdtemp(join(tmpdir(),'fuzz-cli-failure-')),input=join(dir,'invalid.html'),reportDir=join(dir,'report'),probe=join(dir,'cleanup-probe.mjs');
 try{
  await writeFile(input,'<!doctype html><title>Invalid map without a layout controller</title>');
  await mkdir(join(reportDir,blocked),{recursive:true});
  // Observe actual cleanup calls without replacing the browser or HTTP server.
  await writeFile(probe,`
import http from 'node:http';
import {syncBuiltinESMExports} from 'node:module';
import {chromium} from ${JSON.stringify(pathToFileURL(resolve('node_modules/@playwright/test/index.mjs')).href)};
const createServer=http.createServer;
http.createServer=(...args)=>{
 const server=createServer(...args),close=server.close;
 server.close=function(...args){process.stderr.write('fuzz-test:server-close\\n');return close.apply(this,args);};
 return server;
};
syncBuiltinESMExports();
const launch=chromium.launch.bind(chromium);
chromium.launch=async(...args)=>{
 const browser=await launch(...args),close=browser.close.bind(browser);
 browser.close=async(...args)=>{process.stderr.write('fuzz-test:browser-close\\n');return close(...args);};
 return browser;
};
`);
  const result=await new Promise(done=>execFile(process.execPath,['--import',probe,'scripts/fuzz-cartography.mjs',input,reportDir,'73191','0','chromium','svg','--headless'],{cwd:process.cwd(),env:{...process.env,PLAYWRIGHT_BROWSERS_PATH:resolve('.browser-cache')},timeout:30000},(error,stdout,stderr)=>done({error,stdout,stderr})));
  expect(result.error?.killed).not.toBe(true);
  expect(result.error?.code).toBe(1);
  const summary=JSON.parse(result.stdout.trim());
  expect(summary.status).toBe('failed');
  expect(summary.failure.message).toContain('mapLayout is not defined');
  expect(summary.failure.initializationPhase).toBe('readiness');
  expect(result.stderr).toContain('fuzz-test:browser-close');
  expect(result.stderr).toContain('fuzz-test:server-close');
  if(blocked==='failed-input.html'){
   const report=JSON.parse(await readFile(join(reportDir,'report.json'),'utf8'));
   expect(report.status).toBe('failed');
   expect(report.failure.message).toBe(summary.failure.message);
   expect(report.failure.evidenceErrors).toEqual([expect.objectContaining({file:'failed-input.html',code:'EISDIR'})]);
  }else{
   expect(result.stderr).toContain('EISDIR');
   if(blocked==='contact-sheet.html')expect(JSON.parse(await readFile(join(reportDir,'report.json'),'utf8')).failure.message).toBe(summary.failure.message);
  }
 }finally{await rm(dir,{recursive:true,force:true});}
});
