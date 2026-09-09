import {measureElement} from './measure.js';
const ns='http://www.w3.org/2000/svg';
/** Only manifest-declared word-preserving line breaks are allowed. Secondary
 * information remains attached; no abbreviation or truncation is invented here. */
export function measurePointVariants(element,annotation,measurement={}) {
 const text=element.querySelector('text');if(!text)return [];
 const original=text.innerHTML,result=[];
 try {
  for(const [i,variant] of (annotation.variants||[]).entries()){
   if(!Array.isArray(variant.lines)||variant.lines.join(' ')!==annotation.text)throw new Error('Invalid declared text variant');
   text.innerHTML=original;
   const secondary=[...text.children].map(e=>e.cloneNode(true)),x=text.getAttribute('x')||'0';
   // Persist the measured local baseline advance. WebKit can retain resolved
   // em lengths on existing tspans after the parent font changes; identical
   // textHTML would then paint different spacing from the measured variant.
   const lineAdvance=1.12*parseFloat(getComputedStyle(text).fontSize);
   text.replaceChildren();
   for(const [j,line] of variant.lines.entries()){
    const span=document.createElementNS(ns,'tspan');span.dataset.layoutPrimary='';span.setAttribute('x',x);span.setAttribute('dy',j?String(lineAdvance):'0');span.textContent=line;text.append(span);
   }
   for(const sub of secondary)text.append(sub);
   result.push({id:'wrap-'+i,textHTML:text.innerHTML,shape:{...measureElement(element,.35,measurement),paintInset:.35}});
  }
 }finally{text.innerHTML=original;}
 return result;
}
