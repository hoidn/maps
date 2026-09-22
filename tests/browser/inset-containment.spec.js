import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {fixtureHTML} from '../support/browser-fixture.js';

for(const width of [430,1440])for(const media of ['screen','print'])test(`detail figure isolates paint and preserves native output at ${width}px in ${media}`,async({page})=>{
 await page.setViewportSize({width,height:1200});await page.emulateMedia({media});
 const paths=Array.from({length:1000},(_,i)=>`<path d="M${i%40*4},${Math.floor(i/40)*4}h3v3h-3z" fill="#989482"/>`).join('');
 await page.setContent((await fixtureHTML())+'<style>'+await readFile('pipeline/cartography/styles.css','utf8')+'</style><section class="cartographic-context"><figure><svg class="detail-inset" viewBox="0 0 170 170" role="img" aria-label="Developed-area detail">'+paths+'</svg><svg width="100" viewBox="0 0 1300 685" aria-label="Detail locator"><rect x="30" y="450" width="170" height="170" fill="#705b39"/></svg><figcaption>Developed-area detail · selected by facility density · locator shows its position in the sheet.</figcaption></figure></section>');
 await page.evaluate(()=>document.fonts.ready);await page.locator('.detail-inset').scrollIntoViewIfNeeded();
 const figure=page.locator('.cartographic-context > figure');await expect(figure).toHaveCSS('contain','paint');
 const geometry=()=>{
  const inset=document.querySelector('.detail-inset'),figure=inset.parentElement,b=inset.getBBox(),m=inset.getScreenCTM();
  return {scroll:[scrollX,scrollY],document:[document.documentElement.scrollWidth,document.documentElement.scrollHeight],rects:[document.getElementById('mapsvg'),figure,inset,figure.querySelector('[aria-label="Detail locator"]'),figure.querySelector('figcaption')].map(e=>e.getBoundingClientRect().toJSON()),bounds:{x:b.x,y:b.y,width:b.width,height:b.height},matrix:['a','b','c','d','e','f'].map(k=>m[k])};
 };
 const contained=await page.evaluate(geometry),image=await page.screenshot({fullPage:true});
 await figure.evaluate(e=>{e.style.contain='none';});
 expect(await page.evaluate(geometry)).toEqual(contained);expect((await page.screenshot({fullPage:true})).equals(image)).toBe(true);
});
