/** Experimental vector contour backend. Endpoints live in GPU buffers; camera
 * changes update uniforms only. A MAX-blended coverage mask avoids dark joints. */
const vertex=`#version 300 es
precision highp float;
layout(location=0) in vec4 endpoints;
layout(location=1) in vec2 caps;
uniform vec4 camera;
uniform vec2 viewport;
uniform float radius;
out vec2 local;
flat out float lengthPx;
flat out vec2 endCaps;
void main(){
 vec2 a=endpoints.xy*camera.xy+camera.zw,b=endpoints.zw*camera.xy+camera.zw;
 vec2 delta=b-a;float len=max(length(delta),0.00001);vec2 tangent=delta/len,normal=vec2(-tangent.y,tangent.x);
 vec2 corners[6]=vec2[6](vec2(0,-1),vec2(1,-1),vec2(0,1),vec2(0,1),vec2(1,-1),vec2(1,1));
 vec2 q=corners[gl_VertexID];float reach=radius+1.;local=vec2(mix(-reach,len+reach,q.x),q.y*reach);
 vec2 p=a+tangent*local.x+normal*local.y;
 gl_Position=vec4(p.x/viewport.x*2.-1.,1.-p.y/viewport.y*2.,0,1);lengthPx=len;endCaps=caps;
}`;
const fragment=`#version 300 es
precision highp float;
in vec2 local;
flat in float lengthPx;
flat in vec2 endCaps;
uniform float radius;
out vec4 color;
void main(){
 float along=max(max(-local.x,local.x-lengthPx),0.);
 float distanceToLine=length(vec2(along,local.y))-radius;
 if(endCaps.x>0.5)distanceToLine=max(distanceToLine,-local.x);
 if(endCaps.y>0.5)distanceToLine=max(distanceToLine,local.x-lengthPx);
 float coverage=clamp(0.5-distanceToLine,0.,1.);color=vec4(coverage);
}`;
const screenVertex=`#version 300 es
precision highp float;
out vec2 uv;
void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);uv=p;gl_Position=vec4(p*2.-1.,0,1);}`;
const screenFragment=`#version 300 es
precision highp float;
in vec2 uv;
uniform sampler2D mask;
uniform vec4 ink;
out vec4 color;
void main(){float a=texture(mask,uv).r*ink.a;color=vec4(ink.rgb*a,a);}`;
const intersects=(b,v,p)=>b.x+b.width+p>=v.x&&b.x-p<=v.x+v.w&&b.y+b.height+p>=v.y&&b.y-p<=v.y+v.h;
export class WebGLContours{
 constructor(canvas,contours,onLoss){
  this.canvas=canvas;this.contours=contours;this.groups=[];this.uploads=0;this.segments=0;this.bufferBytes=0;this.drawCalls=0;this.uploaded=new Set();this.readyZoom=-1;
  const gl=this.gl=canvas.getContext('webgl2',{alpha:true,antialias:false,depth:false,stencil:false,premultipliedAlpha:true});
  if(!gl)throw new Error('WebGL2 unavailable');
  this.lost=e=>{e.preventDefault();onLoss(new Error('WebGL context lost'));};canvas.addEventListener('webglcontextlost',this.lost);
  try{
   this.lines=this.program(vertex,fragment);this.composite=this.program(screenVertex,screenFragment);
   this.vao=gl.createVertexArray();gl.bindVertexArray(this.vao);this.mask=gl.createTexture();this.framebuffer=gl.createFramebuffer();
   gl.bindTexture(gl.TEXTURE_2D,this.mask);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
   this.colorContext=document.createElement('canvas').getContext('2d',{willReadFrequently:true});this.colorContext.canvas.width=this.colorContext.canvas.height=1;
  }catch(error){this.destroy();throw error;}
 }
 program(vs,fs){const gl=this.gl,shaders=[];let program;try{for(const [type,source] of [[gl.VERTEX_SHADER,vs],[gl.FRAGMENT_SHADER,fs]]){const shader=gl.createShader(type);shaders.push(shader);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(shader));}program=gl.createProgram();shaders.forEach(s=>gl.attachShader(program,s));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));return {program,uniforms:Object.fromEntries(['camera','viewport','radius','mask','ink'].map(n=>[n,gl.getUniformLocation(program,n)]))};}catch(error){if(program)gl.deleteProgram(program);throw error;}finally{shaders.forEach(s=>gl.deleteShader(s));}}
 refreshStyles(){for(const group of this.groups)group.style=group.items[0].style;}
 isReadyFor(z){return !this.destroyed&&(z>=4.5?4.5:z>=2?2:0)<=this.readyZoom;}
 prepare(maxZoom=Infinity){
  const run=()=>this.prepareItems(maxZoom);
  return this.preparation=(this.preparation||Promise.resolve()).then(run);
 }
 async prepareItems(maxZoom){
  const gl=this.gl,groups=new Map();if(this.destroyed)throw new Error('WebGL renderer disposed');let deadline=performance.now()+8;
  for(const item of this.contours.items){
   if(item.minZoom>maxZoom||this.uploaded.has(item))continue;
   const s=item.style;if(!item.runs||s.dash.length||s.join!=='round'||!['butt','round'].includes(s.cap))throw new Error('WebGL prototype requires solid round-joined contour polylines');
   const key=JSON.stringify([item.minZoom,s]);if(!groups.has(key))groups.set(key,{style:s,minZoom:item.minZoom,items:[],count:0});const group=groups.get(key);group.items.push(item);for(const run of item.runs)group.count+=Math.max(0,run.points.length/2-1);
  }
  for(const group of groups.values()){
   const data=new Float32Array(group.count*6);let index=0;group.chunks=[];
   for(const item of group.items)for(const run of item.runs){const p=run.points,offset=index/6;for(let i=0;i<p.length-2;i+=2){data.set([p[i],p[i+1],p[i+2],p[i+3],i===0&&group.style.cap==='butt'?1:0,i===p.length-4&&group.style.cap==='butt'?1:0],index);index+=6;}for(const chunk of run.chunks)group.chunks.push({bounds:chunk.bounds,start:offset+chunk.start/2,end:offset+chunk.end/2-1});if(performance.now()>=deadline){await new Promise(r=>setTimeout(r,0));deadline=performance.now()+8;if(this.destroyed)throw new Error('WebGL renderer disposed');}}
   group.style=group.items[0].style;group.buffer=gl.createBuffer();this.groups.push(group);gl.bindBuffer(gl.ARRAY_BUFFER,group.buffer);gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);this.uploads++;this.segments+=group.count;this.bufferBytes+=data.byteLength;for(const item of group.items)this.uploaded.add(item);
  }
  if(gl.getError()!==gl.NO_ERROR)throw new Error('WebGL contour upload failed');
  this.groups.sort((a,b)=>(a.items[0].order??this.contours.items.indexOf(a.items[0]))-(b.items[0].order??this.contours.items.indexOf(b.items[0])));
  this.readyZoom=Math.max(this.readyZoom,maxZoom>=4.5?4.5:maxZoom>=2?2:0);
 }
 color(style){const ctx=this.colorContext;ctx.clearRect(0,0,1,1);ctx.fillStyle=style.color;ctx.fillRect(0,0,1,1);const c=ctx.getImageData(0,0,1,1).data;return [c[0]/255,c[1]/255,c[2]/255,c[3]/255*style.opacity];}
 render(view,world,z,visible=true){
  const gl=this.gl,w=this.canvas.width,h=this.canvas.height;this.drawCalls=0;
  if(this.width!==w||this.height!==h){this.width=w;this.height=h;gl.bindTexture(gl.TEXTURE_2D,this.mask);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,null);gl.bindFramebuffer(gl.FRAMEBUFFER,this.framebuffer);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,this.mask,0);if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw new Error('WebGL contour framebuffer incomplete');}
  gl.viewport(0,0,w,h);gl.bindVertexArray(this.vao);gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);if(!visible)return;
  const visibleView={x:-world.e/world.a,y:-world.f/world.d,w:w/world.a,h:h/world.d};
  for(const group of this.groups){
   const s=group.style;if(z<group.minZoom||s.color==='none'||!s.width||!s.opacity)continue;
   const ranges=[],pad=(s.width/z/2)+2/world.a;
   for(const chunk of group.chunks){if(!intersects(chunk.bounds,visibleView,pad))continue;const last=ranges.at(-1);if(last&&chunk.start<=last.end)last.end=Math.max(last.end,chunk.end);else ranges.push({start:chunk.start,end:chunk.end});}
   if(!ranges.length)continue;
   gl.bindFramebuffer(gl.FRAMEBUFFER,this.framebuffer);gl.clear(gl.COLOR_BUFFER_BIT);gl.enable(gl.BLEND);gl.blendEquation(gl.MAX);gl.blendFunc(gl.ONE,gl.ONE);gl.useProgram(this.lines.program);
   const u=this.lines.uniforms;gl.uniform4f(u.camera,world.a,world.d,world.e,world.f);gl.uniform2f(u.viewport,w,h);gl.uniform1f(u.radius,s.width/z*world.a/2);
   gl.bindBuffer(gl.ARRAY_BUFFER,group.buffer);gl.enableVertexAttribArray(0);gl.enableVertexAttribArray(1);gl.vertexAttribDivisor(0,1);gl.vertexAttribDivisor(1,1);
   for(const range of ranges){gl.vertexAttribPointer(0,4,gl.FLOAT,false,24,range.start*24);gl.vertexAttribPointer(1,2,gl.FLOAT,false,24,range.start*24+16);gl.drawArraysInstanced(gl.TRIANGLES,0,6,range.end-range.start);this.drawCalls++;}
   gl.disableVertexAttribArray(0);gl.disableVertexAttribArray(1);gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.blendEquation(gl.FUNC_ADD);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);gl.useProgram(this.composite.program);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.mask);gl.uniform1i(this.composite.uniforms.mask,0);gl.uniform4fv(this.composite.uniforms.ink,this.color(s));gl.drawArrays(gl.TRIANGLES,0,3);this.drawCalls++;
  }
  this.rgbaBytes=w*h*8; // Drawing buffer plus reusable coverage mask (driver overhead excluded).
 }
 destroy(){this.destroyed=true;const gl=this.gl;if(!gl)return;this.canvas.removeEventListener('webglcontextlost',this.lost);for(const g of this.groups)gl.deleteBuffer(g.buffer);this.groups=[];for(const p of [this.lines,this.composite])if(p)gl.deleteProgram(p.program);gl.deleteTexture(this.mask);gl.deleteFramebuffer(this.framebuffer);gl.deleteVertexArray(this.vao);}
}
