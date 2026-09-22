import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePrintArgs} from '../../scripts/print-map.mjs';
test('print command rejects unsafe outputs and malformed requests before building',()=>{
 assert.equal(parsePrintArgs(['--map','san_gabriel']).map,'san_gabriel');
 for(const args of [[],['--map','../x'],['--map','x','--scale','NaN'],['--map','x','--scale','0'],['--map','x','--paper','97x24in'],['--map','x','--output','pipeline/x.html'],['--map','x','--unknown']])assert.throws(()=>parsePrintArgs(args));
 assert.equal(parsePrintArgs(['--map','sequoia','--scale','50000']).scale,50000);
});
