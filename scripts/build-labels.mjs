import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
await build({absWorkingDir:root,entryPoints:['pipeline/labels/initial-placement-worker.js'],bundle:true,format:'iife',target:['chrome100','firefox100','safari15'],outfile:'pipeline/labels/dist/initial-worker.txt',minify:true});
await build({absWorkingDir:root,entryPoints:['pipeline/labels/packed-contour-worker.js'],bundle:true,format:'iife',target:['chrome100','firefox100','safari15'],outfile:'pipeline/labels/dist/packed-contour-worker.txt',minify:true});
await build({loader:{'.txt':'text'},absWorkingDir:root,entryPoints:['pipeline/labels/browser.js'],bundle:true,format:'iife',target:['chrome100','firefox100','safari15'],outfile:'pipeline/labels/dist/browser.js',minify:true});
