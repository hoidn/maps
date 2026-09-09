import fs from 'node:fs/promises';
import path from 'node:path';
export async function fixtureHTML(mode='interactive') {
 const dir=path.resolve('pipeline/labels/fonts');let css=await fs.readFile(path.join(dir,'fonts.css'),'utf8');
 for(const name of Object.keys(JSON.parse(await fs.readFile(path.join(dir,'manifest.json'),'utf8'))))css=css.replaceAll('url('+name+')','url(data:font/ttf;base64,'+(await fs.readFile(path.join(dir,name))).toString('base64')+')');
 const features=[{id:'f-a',name:'Camp A',anchor:[100,100],directory:true},{id:'f-b',name:'Camp B',anchor:[112,105],directory:true},{id:'f-c',name:'River',anchor:[0,0],directory:false}];
 const annotations=features.slice(0,2).map((f,i)=>({id:'label-'+i,elementId:'label-'+i,featureId:f.id,kind:'point-label',layer:'places',anchor:f.anchor,text:f.name,style:'l-place',priority:800,requiredProfiles:['static-default']}));
 annotations.push({id:'curve',elementId:'curve',featureId:'f-c',kind:'line-label',layer:'names',anchor:[0,0],text:'River',style:'l-river',geometryId:'waterpath',priority:200,requiredProfiles:[]});
 const manifest={version:1,map:{width:500,height:400,mode},features,annotations};
 // Match both builders' round text halos; miter extents have separate audit tests.
 const labels=annotations.slice(0,2).map(a=>`<g id="${a.id}" data-layout-id="${a.id}" data-feature-id="${a.featureId}"><text class="l-place" style="transform:translate(${a.anchor[0]}px,${a.anchor[1]}px) scale(var(--k)) translate(7px,4px)">${a.text}</text></g>`).join('');
 return `<meta charset="utf-8"><style>${css}body{margin:0;background:white;font-family:'Source Sans 3'} .map-wrap{position:relative;width:500px;max-width:100%}.map{width:100%;height:auto;--k:1;--s:1}.map text{font-family:'Source Sans 3';font-size:12px;stroke:white;stroke-width:2.8px;stroke-linejoin:round;paint-order:stroke fill}.ctl{position:absolute;right:4px;top:4px;background:white;width:70px;height:35px}.no-places .labels{display:none}[data-layout-id]{visibility:hidden}</style><div class="map-wrap"><svg xmlns="http://www.w3.org/2000/svg" id="mapsvg" class="map" data-w="500" data-h="400" viewBox="0 0 500 400"><defs><path id="waterpath" d="M20,250 Q200,100 470,250"/></defs><g class="labels">${labels}</g><g class="hydro-labels"><g id="curve" data-layout-id="curve" data-feature-id="f-c"><text class="l-river"><textPath href="#waterpath" startOffset="50%" text-anchor="middle">River</textPath></text></g></g></svg><div class="ctl">Controls</div></div><script type="application/json" id="map-label-manifest">${JSON.stringify(manifest)}</script>`;
}
export async function mountFixture(page,mode='interactive') {
 await page.setContent(await fixtureHTML(mode));
 await page.addScriptTag({content:await fs.readFile('pipeline/labels/dist/browser.js','utf8')});
 await page.evaluate(()=>window.mapLayout.ready);
}
export async function visibleBoxes(page) {
 return page.evaluate(()=>[...document.querySelectorAll('[data-layout-id]')].filter(e=>getComputedStyle(e).visibility==='visible'&&e.getBoundingClientRect().width>0).map(e=>{const r=e.getBoundingClientRect();return {id:e.id,x:r.x,y:r.y,width:r.width,height:r.height};}));
}
