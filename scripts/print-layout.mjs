// Physical fit is separate from geographic coordinates and from browser text measurement.
export function resolvePrintSize(profile, aspect, collarMm) {
  const margin = profile.marginMm + (profile.tickMarginMm || 0);
  if (!(Number.isFinite(aspect) && aspect > 0 && Number.isFinite(collarMm) && collarMm >= 0)) throw Error('Invalid print measurements');
  const paper = profile.paperMm;
  const mapWidthMm = profile.mapWidthMm ?? Math.min(paper[0] - 2 * margin, (paper[1] - 2 * margin - collarMm) * aspect);
  const mapHeightMm = mapWidthMm / aspect;
  const requiredWidth = mapWidthMm + 2 * margin, requiredHeight = mapHeightMm + 2 * margin + collarMm;
  const [pageWidthMm, pageHeightMm] = paper || [requiredWidth, requiredHeight];
  if (mapWidthMm <= 0 || [pageWidthMm, pageHeightMm].some(v => !Number.isFinite(v) || v > profile.maxPageMm) || requiredWidth > pageWidthMm + 1e-6 || requiredHeight > pageHeightMm + 1e-6)
    throw Error(`Map and collar do not fit: need at least ${requiredWidth.toFixed(1)} × ${requiredHeight.toFixed(1)} mm`);
  const g = profile.groundMeters;
  return {pageWidthMm, pageHeightMm, mapWidthMm, mapHeightMm,
    scaleDenominator: g.width * 1000 / mapWidthMm,
    northSouthScaleDenominator: g.height * 1000 / mapHeightMm,
    northScaleDenominator: g.northWidth * 1000 / mapWidthMm,
    southScaleDenominator: g.southWidth * 1000 / mapWidthMm};
}

export async function preparePrint(page) {
  const measured = await page.evaluate(async () => {
    const controller = window.mapLayout, p = controller?.manifest.map.print;
    if (!p) return null;
    await controller.ready; await controller.whenSettled(); await document.fonts.ready;
    const sheet = document.querySelector('.print-sheet'), frame = document.querySelector('.print-map-frame');
    const mm = 96 / 25.4, outer = 2 * (p.marginMm + (p.tickMarginMm || 0));
    const width = p.paperMm?.[0] ?? p.mapWidthMm + outer;
    sheet.style.width = width + 'mm'; sheet.style.height = 'auto';
    frame.style.width = (width - outer) + 'mm'; frame.style.height = '0px';
    controller.svg.style.width = '100%'; controller.svg.style.height = '0px';
    await document.fonts.ready;
    const collarMm = sheet.getBoundingClientRect().height / mm - outer;
    return {profile: p, aspect: controller.manifest.map.width / controller.manifest.map.height, collarMm};
  });
  if (!measured) return null;
  const layout = resolvePrintSize(measured.profile, measured.aspect, measured.collarMm);
  const viewport = {width: Math.ceil(layout.pageWidthMm * 96 / 25.4), height: Math.ceil(layout.pageHeightMm * 96 / 25.4)};
  await page.setViewportSize(viewport);
  await page.evaluate(layout => {
    const c = window.mapLayout, p = c.manifest.map.print, mm = 96 / 25.4;
    const sheet = document.querySelector('.print-sheet'), frame = document.querySelector('.print-map-frame');
    sheet.style.width = layout.pageWidthMm + 'mm'; sheet.style.height = layout.pageHeightMm + 'mm';
    frame.style.width = layout.mapWidthMm + 'mm'; frame.style.height = layout.mapHeightMm + 'mm';
    c.svg.style.width = layout.mapWidthMm * mm + 'px'; c.svg.style.height = layout.mapHeightMm * mm + 'px';
    c.svg.style.maxWidth = 'none';
    const mpp = p.groundMeters.width / (layout.mapWidthMm * mm);
    const intervals = p.contourIntervalsFeet;
    p.contourIntervalFeet = intervals.length === 1 ? intervals[0] : intervals[mpp <= 8 ? 2 : mpp <= 16 ? 1 : 0];
    for (const path of c.svg.querySelectorAll('.contours [data-elevation]'))
      path.style.display = Number(path.dataset.elevation) % p.contourIntervalFeet === 0 ? '' : 'none';
    document.getElementById('print-interval').textContent = p.contourIntervalFeet;
    document.getElementById('print-ratio').textContent = '1:' + Math.round(layout.scaleDenominator).toLocaleString('en-US');
    function bar(id,unit,label) {
      const target = layout.scaleDenominator * .06 / unit, power = 10 ** Math.floor(Math.log10(target));
      const value = [1,2,5,10].filter(n => n * power <= target).pop() * power;
      const span = document.getElementById(id); span.textContent = value + ' ' + label;
      span.style.width = value * unit * 1000 / layout.scaleDenominator + 'mm';
    }
    bar('print-metric',1000,'km'); bar('print-imperial',1609.344,'mi');
    const style = document.createElement('style'); style.id = 'print-page-size';
    style.textContent = '@page {size:' + layout.pageWidthMm + 'mm ' + layout.pageHeightMm + 'mm;margin:0}'; document.head.append(style);
    for (const raster of p.rasters || []) raster.effectiveDpi = [raster.pixels[0] / (layout.mapWidthMm / 25.4),raster.pixels[1] / (layout.mapHeightMm / 25.4)];
    p.layout = layout;
    document.getElementById('map-label-manifest').textContent = JSON.stringify(c.manifest).replaceAll('<','\\u003c');
    c.cache.invalidate(); c.lineCache.clear(); c.previous = null; c.invalidateLayout();
  }, layout);
  return {layout, viewport, referenceSize: {width:layout.mapWidthMm * 96 / 25.4,height:layout.mapHeightMm * 96 / 25.4}};
}

// Run after placement: omit keys for hidden optional symbols/geometry without moving the map.
export async function finishPrint(page) {
  return page.evaluate(() => {
    const c=window.mapLayout;if(!c?.manifest.map.print)return null;
    const visible=e=>{for(let n=e;n&&n!==c.svg.parentElement;n=n.parentElement){const s=getComputedStyle(n);if(s.display==='none'||s.visibility==='hidden')return false;}return true;};
    const legend=document.querySelector('.print-legend'),before=legend.getBoundingClientRect();
    legend.style.minHeight=before.height+'px';
    const landcover=c.svg.querySelector('.landcover.t-light');
    for(const swatch of legend.querySelectorAll('[data-cover-alpha]'))swatch.style.opacity=Number(swatch.dataset.coverAlpha)*(landcover?Number(getComputedStyle(landcover).opacity):1);
    const copyPaint=(path,ink)=>{
      const style=getComputedStyle(path),s=Math.hypot(path.getScreenCTM().a,path.getScreenCTM().b);
      for(const key of ['stroke','fill','opacity','strokeLinecap','strokeLinejoin'])ink.style[key]=style[key];
      ink.style.strokeWidth=parseFloat(style.strokeWidth)*s+'px';
      ink.style.strokeDasharray=style.strokeDasharray==='none'?'none':style.strokeDasharray.split(/[ ,]+/).map(n=>parseFloat(n)*s).join(' ');
    };
    const kinds=new Set(c.manifest.annotations.filter(a=>a.kind==='symbol'&&c.visibleIds.has(a.id)).map(a=>a.symbolKind));
    for(const icon of legend.querySelectorAll('[data-legend-symbols]'))if(!icon.dataset.legendSymbols.split(' ').some(k=>kinds.has(k)))icon.closest('.lg-item').style.display='none';
    for(const icon of legend.querySelectorAll('[data-transport-key]')){
      const paths=[...c.svg.querySelectorAll('.transport[data-transport-key]')].filter(e=>e.dataset.transportKey===icon.dataset.transportKey&&visible(e));
      if(!paths.length){icon.closest('.lg-item').style.display='none';continue;}
      const path=paths.sort((a,b)=>parseFloat(getComputedStyle(b).strokeWidth)-parseFloat(getComputedStyle(a).strokeWidth))[0];
      copyPaint(path,icon.querySelector('path:last-child'));
      if(icon.querySelectorAll('path').length>1){const casing=[...c.svg.querySelectorAll('.transport-case')].find(e=>e.dataset.sourceId===path.dataset.sourceId);if(casing)copyPaint(casing,icon.querySelector('path'));}
    }
    for(const icon of legend.querySelectorAll('[data-boundary-key]'))icon.dataset.printMatch='.area-boundary[data-boundary-kind="'+icon.dataset.boundaryKey+'"]';
    for(const icon of legend.querySelectorAll('[data-print-match]')){
      const path=[...c.svg.querySelectorAll(icon.dataset.printMatch)].find(visible);
      if(path)copyPaint(path,icon.querySelector('path'));else icon.closest('.lg-item').style.display='none';
    }
    for(const heading of legend.querySelectorAll('.lg-title')){let next=heading.nextElementSibling,any=false;while(next&&!next.classList.contains('lg-title')){any ||= getComputedStyle(next).display!=='none';next=next.nextElementSibling;}if(!any)heading.style.display='none';}
    const sheet=document.querySelector('.print-sheet').getBoundingClientRect(),map=c.svg.getBoundingClientRect();
    const overflow=[...document.querySelectorAll('.print-title,.print-collar,.print-collar > *, .print-collar .lg-item,.print-ticks .tick')].filter(e=>{
      const r=e.getBoundingClientRect();return r.width&&r.height&&(r.left<sheet.left+5*96/25.4-.5||r.top<sheet.top-.5||r.right>sheet.right-5*96/25.4+.5||r.bottom>sheet.bottom-5*96/25.4+.5);
    }).map(e=>e.className||e.id);
    if(overflow.length)throw Error('Print collar overflow: '+overflow.join(', '));
    if(map.width<=0||map.height<=0)throw Error('Empty print map');
    return {layout:c.manifest.map.print.layout,rasters:c.manifest.map.print.rasters,contourIntervalFeet:c.manifest.map.print.contourIntervalFeet,collarChecked:true};
  });
}
