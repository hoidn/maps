import {LayoutController} from './runtime.js';
import policy from './policy.json';
const svg=document.getElementById('mapsvg'), data=document.getElementById('map-label-manifest');
if(svg&&data){
 svg.removeAttribute('data-layout-pending');
 window.mapLayout=new LayoutController(svg,JSON.parse(data.textContent),policy);
}
