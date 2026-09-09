const NS='http://www.w3.org/2000/svg';
const BACKGROUND='.terrain,.contours,.hydro,.roads,[data-layout-background]';
const VECTOR='[data-layout-id],.trails,.fixed-ui,text,[data-layout-obstacle="trail"]';
const backgroundOnly=e=>e.matches(BACKGROUND)&&!e.matches(VECTOR)&&!e.querySelector(VECTOR);
/** One bounded background bitmap for gestures. Protected trails, all annotations,
 * hit targets and fixed UI stay in the original SVG. Source nodes are retained
 * behind placeholders and restored synchronously before every settled pass. */
export class MotionPreview {
  constructor(svg,{width,height,maxBytes=24*1024*1024}){
    this.svg=svg;this.width=width;this.height=height;this.maxBytes=maxBytes;
    this.generation=0;this.active=false;this.detached=[];
    this.themeObserver=new MutationObserver(()=>this.invalidate());
    this.themeObserver.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme','class','style']});
    this.media=matchMedia('(prefers-color-scheme: dark)');this.themeChanged=()=>this.invalidate();this.media.addEventListener('change',this.themeChanged);
    this.pageHide=()=>this.destroy();window.addEventListener('pagehide',this.pageHide,{once:true});
    this.ready=this.build();
  }
  invalidate(){this.restore();this.generation++;this.release();this.ready=this.build();return this.ready;}
  release(){this.generation++;this.image?.remove();this.image=null;if(this.url)URL.revokeObjectURL(this.url);this.url=null;this.rgbaBytes=0;}
  async build(){
    const generation=++this.generation,started=performance.now();let sourceURL,bitmapURL;
    try{
      const source=this.svg,clone=source.cloneNode(true);
      for(const e of [...clone.children])if(e.tagName.toLowerCase()!=='defs'&&!backgroundOnly(e))e.remove();
      for(const e of clone.querySelectorAll('[data-layout-id],.trails,.fixed-ui,text'))e.remove();
      for(const e of clone.querySelectorAll('[href]'))if(!/^(?:data:|#)/.test(e.getAttribute('href')))throw new Error('Preview requires embedded assets');
      const style=document.createElementNS(NS,'style');style.textContent=[...document.querySelectorAll('style')].map(e=>e.textContent.replace(/@font-face\s*\{[^}]*\}/g,'')).join('\n');clone.prepend(style);
      const computed=getComputedStyle(source);for(const name of computed)if(name.startsWith('--'))clone.style.setProperty(name,computed.getPropertyValue(name));
      clone.setAttribute('data-theme',document.documentElement.getAttribute('data-theme')||'');
      clone.setAttribute('width',this.width);clone.setAttribute('height',this.height);clone.setAttribute('viewBox',`0 0 ${this.width} ${this.height}`);
      clone.style.display='block';clone.style.visibility='visible';clone.style.maxWidth='none';
      const scale=Math.min(2,Math.sqrt(this.maxBytes/(4*this.width*this.height)));
      const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.floor(this.width*scale));canvas.height=Math.max(1,Math.floor(this.height*scale));
      sourceURL=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)],{type:'image/svg+xml'}));
      const decoded=new Image();decoded.src=sourceURL;await decoded.decode();
      if(generation!==this.generation)return;
      const context=canvas.getContext('2d');if(!context)throw new Error('Canvas unavailable');context.drawImage(decoded,0,0,canvas.width,canvas.height);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw new Error('Preview encoding failed');
      if(generation!==this.generation)return;
      bitmapURL=URL.createObjectURL(blob);const bitmap=new Image();bitmap.src=bitmapURL;await bitmap.decode();
      if(generation!==this.generation)return;
      const image=document.createElementNS(NS,'image');image.dataset.layoutPreview='';image.setAttribute('href',bitmapURL);image.setAttribute('width',this.width);image.setAttribute('height',this.height);image.setAttribute('pointer-events','none');
      this.image=image;this.url=bitmapURL;bitmapURL=null;this.rgbaBytes=canvas.width*canvas.height*4;this.buildMs=performance.now()-started;this.error=null;
    }catch(error){if(generation===this.generation)this.error=error.message;}
    finally{if(sourceURL)URL.revokeObjectURL(sourceURL);if(bitmapURL)URL.revokeObjectURL(bitmapURL);}
  }
  show(){
    if(this.active||!this.image)return;
    for(const node of [...this.svg.children].filter(backgroundOnly)){
      const marker=document.createComment('motion background');node.replaceWith(marker);this.detached.push({node,marker});
    }
    this.svg.insertBefore(this.image,this.svg.firstChild);this.active=true;
  }
  restore(){if(!this.active)return;this.image?.remove();for(const {node,marker} of this.detached)marker.replaceWith(node);this.detached=[];this.active=false;}
  destroy(){this.restore();this.generation++;this.release();this.themeObserver.disconnect();this.media.removeEventListener('change',this.themeChanged);window.removeEventListener('pagehide',this.pageHide);}
}
