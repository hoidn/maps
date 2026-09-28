
(function(){
  var data = PROFILE_JSON;
  var svg = document.querySelector('.profile'); if(!svg) return;
  var g = data.geom, hov = svg.querySelector('.hover'), xh = svg.querySelector('.xh'), xd = svg.querySelector('.xd');
  var tip = document.createElement('div'); tip.className='tip'; tip.hidden = true; svg.parentNode.appendChild(tip);
  function cx(m){ return g.ML + m/g.total*(g.CW-g.ML-g.MR); }
  function cy(e){ return g.MT + (g.EMAX-e)/(g.EMAX-g.EMIN)*(g.CH-g.MT-g.MB); }
  svg.addEventListener('mousemove', function(ev){
    var r = svg.getBoundingClientRect(); var sx = (ev.clientX - r.left) * g.CW / r.width;
    var m = (sx - g.ML)/(g.CW-g.ML-g.MR)*g.total; if(m<0||m>g.total){ hov.hidden=true; tip.hidden=true; return; }
    var best=data.samples[0]; for(var i=0;i<data.samples.length;i++){ if(Math.abs(data.samples[i][0]-m)<Math.abs(best[0]-m)) best=data.samples[i]; }
    var near=null; for(var j=0;j<data.wps.length;j++){ if(Math.abs(data.wps[j][1]-m)<0.35 && (!near||Math.abs(data.wps[j][1]-m)<Math.abs(near[1]-m))) near=data.wps[j]; }
    hov.hidden=false; xh.setAttribute('x1',cx(best[0])); xh.setAttribute('x2',cx(best[0])); xd.setAttribute('cx',cx(best[0])); xd.setAttribute('cy',cy(best[1]));
    tip.hidden=false; tip.innerHTML = (near? '<div>'+near[0]+'</div>':'') + '<b>'+best[0].toFixed(1)+' mi</b> · <b>'+best[1].toLocaleString()+' ft</b>';
    tip.style.left = (cx(best[0])*r.width/g.CW)+'px'; tip.style.top = (cy(best[1])*r.height/g.CH - 8)+'px';
  });
  svg.addEventListener('mouseleave', function(){ hov.hidden=true; tip.hidden=true; });
})();

(function(){
  var svg = document.getElementById('mapsvg'); if(!svg) return;
  var W = +svg.dataset.w, H = +svg.dataset.h, fig = svg.parentNode;
  var scaleBox=document.createElement('div');scaleBox.className='live-scale';fig.appendChild(scaleBox);
  var frame=window.mapLayout.manifest.map.frame,scaleWidth=0;
  function liveScale(view){
    if(!frame||!scaleWidth)return;
    var b=frame.bbox,lat=b[3]-(view.y+view.h/2)/H*(b[3]-b[1]);
    var mpp=window.mapLayout.manifest.map.metersPerMapUnit*Math.cos(lat*Math.PI/180)/Math.cos((b[1]+b[3])/2*Math.PI/180)*view.w/scaleWidth;
    function bar(unit,label){var target=mpp*110/unit,p=Math.pow(10,Math.floor(Math.log10(target))),n=[1,2,5,10].filter(n=>n*p<=target).pop()*p;return '<span style="width:'+Math.round(n*unit/mpp)+'px">'+n+' '+label+'</span>';}
    scaleBox.innerHTML=bar(mpp*110>=1000?1000:1,mpp*110>=1000?'km':'m')+bar(mpp*110>=1609.344?1609.344:.3048,mpp*110>=1609.344?'mi':'ft');
  }
  var vb = {x:0,y:0,w:W,h:H}, MAXZ = 14;
  // The scale and map are siblings observed by the label controller. Updating
  // its dimensions inside resize delivery can cause a same-depth observer loop.
  // Reuse the observed width instead of forcing layout of the SVG on each camera change.
  var scaleFrame=null;
  new ResizeObserver(function(entries){scaleWidth=Math.round(entries[0].contentRect.width);if(scaleFrame===null)scaleFrame=requestAnimationFrame(function(){scaleFrame=null;liveScale(vb);});}).observe(svg);
  var readout = document.getElementById('readout'), ttip = document.getElementById('ttip');
  // ---- cursor DEM
  var GW = DEM_GW, GH = DEM_GH, bin = atob("DEM_B64"), dem = new Uint16Array(GW*GH);
  for (var i=0;i<dem.length;i++){ dem[i] = bin.charCodeAt(2*i) | (bin.charCodeAt(2*i+1)<<8); }
  var LON0=DEM_LON0, LON1=DEM_LON1, LAT0=DEM_LAT0, LAT1=DEM_LAT1;
  function elevAt(x,y){ var c=Math.min(GW-1,Math.max(0,Math.round(x/W*(GW-1)))), r=Math.min(GH-1,Math.max(0,Math.round(y/H*(GH-1)))); return dem[r*GW+c]; }
  // ---- view
  function apply(){ window.mapLayout.requestView(vb); }
  var hashT=null, zlabel=document.getElementById('zlabel');
  window.mapLayout.onCameraChange=function(view){
    vb={...view};liveScale(view);
    clearTimeout(hashT); hashT=setTimeout(function(){ try{ history.replaceState(null,'','#v='+vb.x.toFixed(0)+','+vb.y.toFixed(0)+','+(W/vb.w).toFixed(2)); }catch(e){} }, 250);
  };
  (function(){ var m=/v=(-?[\d.]+),(-?[\d.]+),([\d.]+)/.exec(location.hash||''); if(m){ var z=Math.min(MAXZ,Math.max(1,+m[3])); vb.w=W/z; vb.h=vb.w*H/W; vb.x=+m[1]; vb.y=+m[2]; clamp(); } })();
  function clamp(){
    vb.w = Math.min(W, Math.max(W/MAXZ, vb.w)); vb.h = vb.w*H/W;
    vb.x = Math.min(W-vb.w, Math.max(0, vb.x)); vb.y = Math.min(H-vb.h, Math.max(0, vb.y));
  }
  function toMap(cx,cy){ var r=svg.getBoundingClientRect(); return {x: vb.x+(cx-r.left)/r.width*vb.w, y: vb.y+(cy-r.top)/r.height*vb.h}; }
  function zoomAt(factor, cx, cy){
    var m = toMap(cx,cy); var nw = vb.w/factor;
    nw = Math.min(W, Math.max(W/MAXZ, nw)); factor = vb.w/nw;
    vb.x = m.x - (m.x-vb.x)/factor; vb.y = m.y - (m.y-vb.y)/factor; vb.w = nw; vb.h = nw*H/W; clamp(); apply();
  }
  function center(){ var r=svg.getBoundingClientRect(); return [r.left+r.width/2, r.top+r.height/2]; }
  document.getElementById('zin').onclick = function(){ var c=center(); zoomAt(1.6,c[0],c[1]); };
  document.getElementById('zout').onclick = function(){ var c=center(); zoomAt(1/1.6,c[0],c[1]); };
  document.getElementById('zreset').onclick = function(){ vb={x:0,y:0,w:W,h:H}; apply(); };
  document.getElementById('goto').onchange = function(e){
    var v=e.target.value; if(!v) return; var p=v.split(',').map(Number); var nw=W/4.5;
    vb.w=nw; vb.h=nw*H/W; vb.x=p[0]-nw/2; vb.y=p[1]-vb.h/2; clamp(); apply(); e.target.value='';
  };
  svg.addEventListener('wheel', function(e){ e.preventDefault(); var f = Math.exp(-e.deltaY*0.0016); zoomAt(f, e.clientX, e.clientY); }, {passive:false});
  svg.addEventListener('dblclick', function(e){ e.preventDefault(); zoomAt(2, e.clientX, e.clientY); });
  // pointer drag + pinch
  var ptrs = new Map(), last = null, pinch = null, moved = false;
  svg.addEventListener('pointerdown', function(e){ ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY}); svg.setPointerCapture(e.pointerId); moved=false;
    if(ptrs.size===1){ last={x:e.clientX,y:e.clientY}; svg.classList.add('dragging'); }
    if(ptrs.size===2){ var a=[...ptrs.values()]; pinch={d:Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y), cx:(a[0].x+a[1].x)/2, cy:(a[0].y+a[1].y)/2}; }
  });
  svg.addEventListener('pointermove', function(e){
    if(ptrs.has(e.pointerId)) ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(ptrs.size===2 && pinch){ var a=[...ptrs.values()]; var d=Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y); var cx=(a[0].x+a[1].x)/2, cy=(a[0].y+a[1].y)/2;
      zoomAt(d/pinch.d, cx, cy); var r=svg.getBoundingClientRect(); vb.x -= (cx-pinch.cx)/r.width*vb.w; vb.y -= (cy-pinch.cy)/r.height*vb.h; clamp(); apply(); pinch={d:d,cx:cx,cy:cy}; moved=true; return; }
    if(ptrs.size===1 && last){ var r2=svg.getBoundingClientRect(); var dx=(e.clientX-last.x)/r2.width*vb.w, dy=(e.clientY-last.y)/r2.height*vb.h;
      if(Math.abs(e.clientX-last.x)+Math.abs(e.clientY-last.y)>2) moved=true; vb.x-=dx; vb.y-=dy; last={x:e.clientX,y:e.clientY}; clamp(); apply(); }
    // readout
    var m = toMap(e.clientX,e.clientY);
    if(m.x>=0&&m.x<=W&&m.y>=0&&m.y<=H){ var lon=LON0+m.x/W*(LON1-LON0), lat=LAT1-m.y/H*(LAT1-LAT0);
      readout.innerHTML='<small>Cursor</small><br>'+Math.abs(lat).toFixed(4)+'° '+(lat<0?'S':'N')+' &nbsp;'+Math.abs(lon).toFixed(4)+'° '+(lon<0?'W':'E')+' &nbsp;·&nbsp; <b>'+elevAt(m.x,m.y).toLocaleString()+' ft</b>'; }
  });
  function up(e){ ptrs.delete(e.pointerId); if(ptrs.size<2) pinch=null; if(ptrs.size===0){ last=null; svg.classList.remove('dragging'); } }
  svg.addEventListener('pointerup', up); svg.addEventListener('pointercancel', up); svg.addEventListener('lostpointercapture', up);
  window.addEventListener('blur', function(){ ptrs.clear(); last=null; pinch=null; svg.classList.remove('dragging'); });
  svg.addEventListener('mouseleave', function(){ readout.innerHTML='<small>Cursor</small><br>move over the map for elevation'; });
  // layers
  document.querySelectorAll('.layers input').forEach(function(cb){ cb.addEventListener('change', function(){ window.mapLayout.setLayer(cb.dataset.layer.replace('no-',''),cb.checked); }); });
  // trail hover / click
  var CLS={corridor:'Corridor trail',threshold:'Threshold trail',primitive:'Primitive route',rim:'Rim & plateau walk'};
  // Physical identity keeps unrelated same-name/unnamed paths separate. An
  // explicit route relation may intentionally select several physical ways.
  var trailRows=[...svg.querySelectorAll('.trails .tr')].map(function(p,i){return {element:p,id:p.dataset.sourceId||p.dataset.featureId||p.id||('legacy-trail-'+i),routes:JSON.parse(p.dataset.routeIds||'[]'),miles:parseFloat(p.dataset.mi||0)};});
  var byGeometry=new Map(trailRows.map(row=>[row.element.getAttribute('d'),row.id])),selections=new Map();
  function selectionFor(p){
    var id=p.dataset.sourceId||p.dataset.featureId||byGeometry.get(p.getAttribute('d'))||p.id;
    var routes=JSON.parse(p.dataset.routeIds||'[]').slice().sort(),key=routes.length?'routes:'+JSON.stringify(routes):'source:'+id;
    if(!selections.has(key)){
      var members=trailRows.filter(row=>row.id===id||row.routes.some(route=>routes.includes(route)));
      selections.set(key,{key:key,sourceIds:new Set(members.map(row=>row.id)),miles:members.reduce((sum,row)=>sum+row.miles,0)});
    }
    return selections.get(key);
  }
  var pinned=null;
  function light(selection){
    if(window.mapLayout.renderer?.active){window.mapLayout.renderer.highlight(selection?.sourceIds||null);return;}
    trailRows.forEach(function(row){var selected=!!selection&&selection.sourceIds.has(row.id);row.element.classList.toggle('lit',selected);row.element.classList.toggle('dim',!!selection&&!selected);});
  }
  // Explicit directory and trail selections share the details panel. Camera
  // changes can deliver native pointerover without any new pointer movement.
  window.mapLayout.onSelect=function(){pinned=null;light(null);ttip.hidden=true;};
  function showTip(p, e, selection){var n=p.dataset.name,text=n+' · '+(p.dataset.info||(CLS[p.dataset.cls]||p.dataset.cls.replaceAll('_',' ')))+' · '+selection.miles.toFixed(1)+' mi on this sheet';ttip.textContent=text;ttip.hidden=true;if(!window.mapLayout.selected)window.mapLayout.details.textContent=text;}
  svg.addEventListener('pointerover', function(e){ var p=window.mapLayout.renderer?.active?window.mapLayout.pickTrail(e.clientX,e.clientY):(e.target.closest && e.target.closest('.hit')); if(!p||pinned) return; var selection=selectionFor(p);light(selection);showTip(p,e,selection); });
  svg.addEventListener('pointermove', function(e){ if(ptrs.size){ttip.hidden=true;return;} var p=window.mapLayout.renderer?.active?window.mapLayout.pickTrail(e.clientX,e.clientY):(e.target.closest && e.target.closest('.hit'));var selection=p?selectionFor(p):null;if(!pinned&&window.mapLayout.renderer?.active)light(selection);if(p&&!pinned)showTip(p,e,selection);else if(!pinned)ttip.hidden=true;if(pinned&&!p)ttip.hidden=true; });
  svg.addEventListener('mouseleave', function(){if(!pinned)light(null);});
  svg.addEventListener('pointerout', function(e){ if(!pinned && e.target.closest && e.target.closest('.hit')){ light(null); ttip.hidden=true; } });
  // Pointer capture can retarget a native click to the SVG root after release.
  svg.addEventListener('click', function(e){ if(moved) return; var p=window.mapLayout.renderer?.active?window.mapLayout.pickTrail(e.clientX,e.clientY):(e.target.closest && e.target.closest('.hit'));
    if(!p&&!window.mapLayout.renderer?.active){var target=document.elementFromPoint(e.clientX,e.clientY);if(svg.contains(target))p=target.closest('.hit');}
    if(p){window.mapLayout.selected=null;var selection=selectionFor(p);if(pinned?.key===selection.key){pinned=null;light(null);ttip.hidden=true;}else{pinned=selection;light(pinned);showTip(p,e,pinned);}}
    else if(pinned){ pinned=null; light(null); ttip.hidden=true; } });
  apply();
})();
