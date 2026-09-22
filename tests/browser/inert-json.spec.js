import {test,expect} from '@playwright/test';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';

test('inert JSON preserves exact Unicode and escaping across chunk boundaries without JavaScript',async({browser})=>{
 const fixture=JSON.parse(execFileSync(resolve('.venv/bin/python'),['-c',`import json,sys
sys.path.insert(0,'pipeline')
from label_manifest import json_script,safe_json
value={'text':'a'*(65535-len('{"text":"'))+'😀漢é</script><script>globalThis.injected=true</script>&copy;\\u2028\\u2029\\ud800'+'z'*65536}
print(json.dumps({'html':json_script('large-data',value)+json_script('small-data',{'text':'small < & é'}),'text':safe_json(value)}))`],{encoding:'utf8'}));
 const page=await browser.newPage({javaScriptEnabled:false});
 await page.setContent('<!doctype html><meta charset="utf-8">'+fixture.html);
 const result=await page.evaluate(()=>{
  const large=document.getElementById('large-data'),small=document.getElementById('small-data');
  return {text:large.textContent,tag:large.tagName,hidden:large.hidden,chunkBytes:[...large.children].map(e=>new TextEncoder().encode(e.textContent).length),smallTag:small.tagName,small:JSON.parse(small.textContent),injected:!!globalThis.injected};
 });
 await page.close();
 expect(result.text).toBe(fixture.text);expect(result.tag).toBe('DIV');expect(result.hidden).toBe(true);
 expect(result.chunkBytes.length).toBeGreaterThan(1);expect(Math.max(...result.chunkBytes)).toBeLessThanOrEqual(65536);
 expect(result.smallTag).toBe('SCRIPT');expect(result.small).toEqual({text:'small < & é'});expect(result.injected).toBe(false);
});
