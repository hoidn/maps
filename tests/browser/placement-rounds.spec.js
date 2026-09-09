import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import {fixtureHTML} from '../support/browser-fixture.js';
async function mountRounds(page){
 await page.setContent((await fixtureHTML()).replace('id="mapsvg"','id="mapsvg" data-renderer="canvas"'));
 await page.evaluate(()=>{
  const script=document.getElementById('map-label-manifest'),manifest=JSON.parse(script.textContent),group=document.querySelector('.labels');group.replaceChildren();document.querySelector('.hydro-labels').remove();
  manifest.features=[];manifest.annotations=[];
  for(const [id,anchor,priority,color] of [['primary',[70,70],900,'rgb(180,30,30)'],['context',[230,160],750,'blue'],['detail',[70,310],600,'purple'],['marker',[350,290],0,'green']]){
   manifest.features.push({id:'f-'+id,name:id,anchor,directory:false});
   manifest.annotations.push({id,elementId:id,featureId:'f-'+id,kind:id==='marker'?'symbol':'point-label',layer:'places',anchor,text:id==='marker'?'':id,style:'l-place',priority,requiredProfiles:[]});
   group.insertAdjacentHTML('beforeend',`<g id="${id}" data-layout-id="${id}" data-feature-id="f-${id}">${id==='marker'?`<circle cx="${anchor[0]}" cy="${anchor[1]}" r="4" fill="green"/>`:`<text class="l-place" fill="${color}" style="transform:translate(${anchor[0]}px,${anchor[1]}px) scale(var(--k)) translate(7px,4px)">${id}</text>`}</g>`);
  }
  script.textContent=JSON.stringify(manifest);
 });
 await page.addScriptTag({content:await fs.readFile('pipeline/labels/dist/browser.js','utf8')});
 await page.evaluate(()=>mapLayout.whenSettled());
 await page.evaluate(()=>{
  const l=mapLayout;window.roundPayloads=[];window.heldRound=[];window.measuredRounds=[];window.holdContext=true;window.roundIdle=false;
  const send=Worker.prototype.postMessage,query=Element.prototype.querySelector;
  Worker.prototype.postMessage=function(message,...rest){
   if(message.kind==='solve-initial'){
    roundPayloads.push(message.payload);
    if(holdContext&&message.payload.annotations.find(a=>a.id==='context')?.candidates.length){heldRound.push(()=>send.call(this,message,...rest));return;}
   }
   return send.call(this,message,...rest);
  };
  Element.prototype.querySelector=function(selector){if(selector==='text'&&this.hasAttribute('data-layout-measurement'))measuredRounds.push(this.dataset.featureId);return query.call(this,selector);};
  l.invalidateLayout();l.cache.invalidate();l.lineCache.clear();l.previous=null;l.renderer.clearLabels();l.visibleIds.clear();window.roundResult=l.render(true);
  l.whenSettled().then(()=>{roundIdle=true;});
 });
 await page.waitForFunction(()=>heldRound.length>0);
}
async function firstState(page){return page.evaluate(()=>{
 const l=mapLayout,r=l.renderer,data=r.fg.getImageData(0,0,r.foreground.width,r.foreground.height).data;let red=0;
 for(let i=0;i<data.length;i+=4)if(data[i]>140&&data[i+1]<80&&data[i+2]<80&&data[i+3]>200)red++;
 return {visible:[...l.visibleIds],painted:r.painted.map(p=>p.id),red,idle:roundIdle,measured:measuredRounds,first:roundPayloads[0].annotations.map(a=>({id:a.id,reason:a.eligibleReason})),revision:l.revision};
});}
test('primary round paints before lower work, final idle waits, and pure pan retains detail',async({page})=>{
 await mountRounds(page);const first=await firstState(page);
 expect(first.visible).toEqual(expect.arrayContaining(['primary','marker']));expect(first.painted).toContain('primary');expect(first.red).toBeGreaterThan(15);expect(first.idle).toBe(false);
 expect(first.measured).not.toContain('f-detail');expect(first.first.find(a=>a.id==='detail').reason).toBe('round-deferred');
 await page.evaluate(async()=>{holdContext=false;heldRound.splice(0).forEach(send=>send());await mapLayout.whenSettled();});
 expect(await page.evaluate(()=>[...mapLayout.visibleIds].sort())).toEqual(['context','detail','marker','primary']);
 expect(await page.evaluate(()=>mapLayout.result.outcomes.some(o=>o.reason==='round-deferred'))).toBe(false);
 const pan=await page.evaluate(async()=>{
  const l=mapLayout,before=l.result.placements.map(p=>({id:p.id,dx:p.dx,dy:p.dy,textHTML:p.textHTML}));l.requestView({...l.view,x:10});await l.whenSettled();
  return {before,after:l.result.placements.map(p=>({id:p.id,dx:p.dx,dy:p.dy,textHTML:p.textHTML})),visible:[...l.visibleIds]};
 });
 expect(pan.after).toEqual(pan.before);expect(pan.visible).toContain('detail');
});
test('camera interruption cancels a held lower round and final placements match the new camera',async({page})=>{
 await mountRounds(page);expect((await firstState(page)).visible).toContain('primary');
 await page.evaluate(async()=>{holdContext=false;mapLayout.requestView({x:20,y:20,w:450,h:360});heldRound.splice(0).forEach(send=>send());await mapLayout.whenSettled();});
 const state=await page.evaluate(()=>({view:mapLayout.view,painted:mapLayout.renderer.paintedView,revision:mapLayout.revision,paintedRevision:mapLayout.renderer.paintedRevision,roundJob:!!mapLayout.roundJob,privateNodes:mapLayout.svg.querySelectorAll('[data-layout-measurement]').length,status:mapLayout.status}));
 expect(state.painted).toEqual(state.view);expect(state.paintedRevision).toBe(state.revision);expect(state.roundJob).toBe(false);expect(state.privateNodes).toBe(0);expect(state.status).toBe('ready');
});
test('a control or page-position change retries interrupted rounds before resolving idle',async({page})=>{
 await mountRounds(page);
 await page.evaluate(async()=>{
  holdContext=false;document.body.style.paddingTop='30px';
  heldRound.splice(0).forEach(send=>send());await mapLayout.whenSettled();
 });
 expect(await page.evaluate(()=>[...mapLayout.visibleIds].sort())).toEqual(['context','detail','marker','primary']);
 expect(await page.evaluate(()=>mapLayout.lastViewport.y)).toBe(30);
});
