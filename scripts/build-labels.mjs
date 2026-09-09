import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
await build({absWorkingDir:root,entryPoints:['pipeline/labels/browser.js'],bundle:true,format:'iife',target:['chrome100','firefox100','safari15'],outfile:'pipeline/labels/dist/browser.js',minify:true});
