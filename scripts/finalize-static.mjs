import {preparePrint,finishPrint} from './print-layout.mjs';
import { createServer } from "node:http";
import { readFile, writeFile, mkdir, rename, unlink } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash, randomUUID } from "node:crypto";
import { chromium, firefox, webkit } from "@playwright/test";
import { runAudit } from "./audit-map.mjs";
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
// Probe the actual embedded typography, not a browser-name fudge factor. Each
// engine measures identical untransformed SVG text. The largest outward bound
// difference is reserved around every frozen annotation; independent serialized
// audits still decide whether the result is safe to deliver.
async function measureFontProbes(page, probes) {
  return page.evaluate(async probes=>{
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.style.cssText='position:absolute;left:-100000px;top:0;width:100000px;height:10000px;visibility:hidden;pointer-events:none';
    document.body.append(svg);
    try{
      const texts=probes.map(probe=>{const text=document.createElementNS(svg.namespaceURI,'text');text.textContent=probe.text;for(const [key,value] of Object.entries(probe.style))text.style.setProperty(key,value);text.style.setProperty('transform','none');text.setAttribute('x','0');text.setAttribute('y','0');svg.append(text);return text;});
      await Promise.all(texts.map(text=>document.fonts.load(getComputedStyle(text).font,text.textContent)));
      await document.fonts.ready;
      return texts.map(text=>{const b=text.getBBox();return {x:b.x,y:b.y,width:b.width,height:b.height};});
    }finally{svg.remove();}
  },probes);
}
async function measureControlProbes(page, probes) {
  return page.evaluate(async probes=>{
    const holder=document.createElement('div');holder.style.cssText='position:absolute;left:-100000px;top:0;visibility:hidden;pointer-events:none';
    holder.innerHTML=probes.join('');document.body.append(holder);
    try{
      // Inserting the actual control text also activates faces unused by labels.
      holder.getBoundingClientRect();await document.fonts.ready;
      return [...holder.children].map(svg=>{const origin=svg.getBoundingClientRect(),r=svg.querySelector('[data-control-probe]').getBoundingClientRect();return {x:r.x-origin.x,y:r.y-origin.y,width:r.width,height:r.height};});
    }finally{holder.remove();}
  },probes);
}
async function staticMeasurementEnvelope(page, viewport, referenceSize) {
  const {probes,css,directionalOwners,controlProbes}=await page.evaluate(async(referenceSize)=>{
    const controller=window.mapLayout,svg=document.getElementById('mapsvg');
    if(!controller||!svg)throw new Error('Static layout runtime missing');
    try{await controller.ready;await controller.whenSettled();}catch(error){throw new Error('Static layout/font initialization failed: '+error.message);}
    const {width,height}=controller.manifest.map;
    const reference=referenceSize||{width,height};
    svg.style.width=reference.width+'px';svg.style.height=reference.height+'px';svg.style.maxWidth='none';svg.style.minWidth=reference.width+'px';
    controller.requestView({x:0,y:0,w:width,h:height});await controller.whenSettled();
    const probes=new Map(),annotations=new Map(controller.manifest.annotations.map(a=>[a.id,a])),directional=new Map();
    for(const text of svg.querySelectorAll('[data-layout-id] text,[data-layout-id] tspan')){
      const computed=getComputedStyle(text),style={};
      for(const key of ['font-family','font-size','font-weight','font-style','font-stretch','font-variant','letter-spacing','word-spacing','text-anchor','dominant-baseline'])style[key]=computed.getPropertyValue(key);
      const owner=text.closest('[data-layout-id]')?.dataset.layoutId,a=annotations.get(owner);
      // Probe boxes are untransformed CSS units. Preserve directional differences
      // only when every text component has that same orientation and scale.
      // Rotated/scaled/curved labels retain the previous uniform envelope.
      const m=text.getScreenCTM(),aligned=a?.kind==='point-label'&&m&&Math.abs(m.a-1)<1e-7&&Math.abs(m.d-1)<1e-7&&Math.abs(m.b)<1e-7&&Math.abs(m.c)<1e-7;
      if(owner)directional.set(owner,(directional.get(owner)??true)&&!!aligned);
      const values=new Set([text.textContent,...(text.tagName.toLowerCase()==='text'?(a?.variants||[]).flatMap(v=>v.lines):[])]);
      const scale=controller.manifest.map.print&&m?Math.hypot(m.a,m.b):1;
      for(const value of values){const key=JSON.stringify({text:value,style,scale});let probe=probes.get(key);if(!probe){probe={text:value,style,scale,owners:[]};probes.set(key,probe);}if(owner&&!probe.owners.includes(owner))probe.owners.push(owner);}
    }
    const controlProbes=[...svg.querySelectorAll('.cartouche,.scale')].map(control=>{
      // Preserve ancestry and resolved paint/text styles, including inherited
      // variables, so isolated engines measure the same authored SVG control.
      const styled=(source,deep)=>{const clone=source.cloneNode(deep),originals=[source,...(deep?source.querySelectorAll('*'):[])],copies=[clone,...(deep?clone.querySelectorAll('*'):[])];
        originals.forEach((e,i)=>{const computed=getComputedStyle(e);for(const key of computed)copies[i].style.setProperty(key,computed.getPropertyValue(key));});return clone;};
      let content=styled(control,true);content.setAttribute('data-control-probe','');
      for(let parent=control.parentElement;parent&&parent!==svg;parent=parent.parentElement){const wrapper=styled(parent,false);wrapper.append(content);content=wrapper;}
      const root=styled(svg,false);root.style.cssText+=';position:relative;width:'+width+'px;height:'+height+'px;min-width:0;max-width:none;margin:0;border:0;padding:0;';
      for(const defs of svg.querySelectorAll(':scope > defs'))root.append(defs.cloneNode(true));
      root.append(content);return root.outerHTML;
    });
    return {probes:[...probes.values()],css:[...document.querySelectorAll('style')].map(s=>s.textContent).join('\n'),directionalOwners:[...directional].filter(([,aligned])=>aligned).map(([id])=>id),controlProbes};
  },referenceSize);
  if(!probes.length)throw new Error('Static typography probes missing');
  const reference=await measureFontProbes(page,probes),profiles=[{browser:'chromium',probeCount:probes.length,maxOutwardPx:0}];
  const controlReference=await measureControlProbes(page,controlProbes),fixedControlReserves=controlReference.map(()=>({left:0,top:0,right:0,bottom:0}));
  let reservePx=0;const byAnnotation={};
  for(const [name,engine] of [['firefox',firefox],['webkit',webkit]]){
    const browser=await engine.launch();
    try{
      const probePage=await browser.newPage({viewport});await probePage.route('**/*',route=>route.abort('blockedbyclient'));
      await probePage.setContent('<!doctype html><style>'+css+'</style><body></body>');
      const measured=await measureFontProbes(probePage,probes);let maxOutwardPx=0;
      const controls=await measureControlProbes(probePage,controlProbes);
      for(let i=0;i<controlReference.length;i++){
        const a=controlReference[i],b=controls[i];if(!Object.values(b).every(Number.isFinite))throw new Error('Non-finite static control measurement');
        const edges={left:Math.max(0,a.x-b.x),top:Math.max(0,a.y-b.y),right:Math.max(0,b.x+b.width-a.x-a.width),bottom:Math.max(0,b.y+b.height-a.y-a.height)};
        for(const key of Object.keys(edges))fixedControlReserves[i][key]=Math.max(fixedControlReserves[i][key],edges[key]);
      }
      for(let i=0;i<reference.length;i++){
        const a=reference[i],b=measured[i];
        if(!Object.values(b).every(Number.isFinite))throw new Error('Non-finite static font measurement');
        const edges={left:Math.max(0,a.x-b.x),top:Math.max(0,a.y-b.y),right:Math.max(0,b.x+b.width-a.x-a.width),bottom:Math.max(0,b.y+b.height-a.y-a.height)};
        for(const edge of Object.keys(edges))edges[edge]*=probes[i].scale;
        const outward=Math.max(...Object.values(edges));
        maxOutwardPx=Math.max(maxOutwardPx,outward);
        for(const id of probes[i].owners){const reserve=byAnnotation[id]??={left:0,top:0,right:0,bottom:0};for(const key of Object.keys(edges))reserve[key]=Math.max(reserve[key],edges[key]);}
      }
      profiles.push({browser:name,probeCount:probes.length,maxOutwardPx});reservePx=Math.max(reservePx,maxOutwardPx);
    }finally{await browser.close();}
  }
  // Round outward at subpixel resolution, never inward.
  reservePx=Math.ceil(reservePx*64)/64;
  const directional=new Set(directionalOwners);
  for(const edges of fixedControlReserves)for(const key of Object.keys(edges))edges[key]=Math.ceil(edges[key]*64)/64;
  for(const [id,edges] of Object.entries(byAnnotation)){
    for(const key of Object.keys(edges))edges[key]=Math.ceil(edges[key]*64)/64;
    if(!directional.has(id))byAnnotation[id]=Math.max(...Object.values(edges));
  }
  return {method:'per-edge outward SVG text-bound differences for unrotated unit-scale point labels; uniform maxima for other annotations, across embedded-font and declared-wrap probes; per-edge bounds for fixed SVG controls',reservePx,byAnnotation,fixedControlReserves,profiles};
}
/** Finalize only after reopening the exact serialized bytes in every audit engine. */
export async function finalizeStatic({
  input,
  output,
  viewport,
  policy,
  reportDir,
}) {
  if (!input || !output)
    throw new Error("Static input and output are required");
  const source = await readFile(resolve(input)),
    destination = resolve(output),
    sourceSha256 = sha(source);
  const match = source
    .toString()
    .match(
      /<script\b[^>]*id=["']map-label-manifest["'][^>]*>([\s\S]*?)<\/script>/i,
    );
  if (!match) throw new Error("Static manifest missing");
  const manifest = JSON.parse(match[1]);
  if (manifest.map.mode !== "static")
    throw new Error("Static finalizer requires static manifest mode");
  viewport ??= {
    width: Math.max(1440, Math.ceil(manifest.map.width + 140)),
    height: Math.max(1000, Math.ceil(manifest.map.height + 400)),
  };
  policy ??= JSON.parse(await readFile("pipeline/labels/policy.json", "utf8"));
  reportDir ??= resolve(
    "artifacts/layout/static-finalize-" + sourceSha256.slice(0, 12),
  );
  await mkdir(dirname(destination), { recursive: true });
  await mkdir(reportDir, { recursive: true });
  const candidate = join(
    dirname(destination),
    "." + destination.split("/").pop() + "." + randomUUID() + ".candidate.html",
  );
  const server = createServer((req, res) => {
    if (req.url !== "/") {
      res.writeHead(404);
      res.end();
      return;
    }
    res.setHeader("Content-Type", "text/html");
    res.end(source);
  });
  await new Promise((ok, fail) => {
    server.once("error", fail);
    server.listen(0, "127.0.0.1", ok);
  });
  let browser, page;
  try {
    browser = await chromium.launch();
    page = await browser.newPage({ viewport, colorScheme: "light" });
    const url = `http://127.0.0.1:${server.address().port}/`;
    await page.route("**/*", (r) =>
      r.request().isNavigationRequest() && r.request().url() === url
        ? r.continue()
        : r.abort("blockedbyclient"),
    );
    await page.goto(url, { waitUntil: "load" });
    const print = await preparePrint(page);
    if(print)viewport=print.viewport;
    const referenceSize=print?.referenceSize;
    const measurementEnvelope = await staticMeasurementEnvelope(page, viewport,referenceSize);
    await writeFile(join(reportDir,"measurement-envelope.json"),JSON.stringify(measurementEnvelope,null,2));
    let frozen = await page.evaluate(
      async ({ sourceSha256, measurementEnvelope, auditPolicy, referenceSize }) => {
        const svg = document.getElementById("mapsvg"),
          controller = window.mapLayout;
        if (!svg || !controller)
          throw new Error("Static layout runtime missing");
        try {
          await controller.ready;
          await controller.whenSettled();
        } catch (error) {
          throw new Error(
            "Static layout/font initialization failed: " + error.message,
          );
        }
        const manifest = JSON.parse(
            document.getElementById("map-label-manifest").textContent,
          ),
          { width, height } = manifest.map;
        // Keep the release clearance unchanged. The solver receives an additional
        // per-annotation measured envelope around candidate footprints. Other
        // labels do not inherit the font variance of a long region heading.
        controller.policy={...controller.policy,clearance:Math.max(controller.policy.clearance??2,auditPolicy.clearance??2),edgePadding:Math.max(controller.policy.edgePadding??4,auditPolicy.edgePadding??4),measurementReserves:measurementEnvelope.byAnnotation,fixedControlReserves:measurementEnvelope.fixedControlReserves};
        controller.invalidateLayout();controller.previous=null;controller.cache.invalidate();controller.lineCache.clear();
        const reference=referenceSize||{width,height};
        // Placement uses natural map size or the declared physical print reference.
        svg.style.width = reference.width + "px";
        svg.style.height = reference.height + "px";
        svg.style.maxWidth = "none";
        svg.style.minWidth = reference.width + "px";
        await controller.requestView({ x: 0, y: 0, w: width, h: height });
        await controller.whenSettled();
        const r = svg.getBoundingClientRect();
        if (
          Math.abs(r.width - reference.width) > 0.5 ||
          Math.abs(r.height - reference.height) > 0.5
        )
          throw new Error(
            "Static reference width/height could not be established",
          );
        const report = controller.getReport();
        if (report.status !== "ready" || report.error)
          throw new Error("Static layout error: " + report.error);
        if (report.missingRequired?.length)
          throw new Error(
            "Missing required static labels: " +
              report.missingRequired.join(", "),
          );
        if (
          document.fonts.status !== "loaded" ||
          [...document.fonts].some(
            (f) => f.status === "error" || f.status === "loading",
          )
        )
          throw new Error("Static font measurements incomplete");
        // Capture geometry/typography, but retain CSS-controlled colors for both themes.
        const baked = [];
        for (const wrapper of svg.querySelectorAll("[data-layout-id]"))
          for (const e of [wrapper, ...wrapper.querySelectorAll("*")]) {
            const computed = getComputedStyle(e),
              styles = {};
            for (const key of [
              "transform",
              "transform-origin",
              "transform-box",
              "visibility",
              "display",
              "font-family",
              "font-size",
              "font-weight",
              "font-style",
              "font-stretch",
              "letter-spacing",
              "word-spacing",
              "text-anchor",
              "dominant-baseline",
              "stroke-width",
              "stroke-linejoin",
              "stroke-linecap",
              "paint-order",
            ])
              styles[key] = computed.getPropertyValue(key);
            baked.push({ e, styles });
          }
        for (const { e, styles } of baked)
          for (const [key, value] of Object.entries(styles))
            if (value) e.style.setProperty(key, value);
        svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
        svg.style.setProperty("--k", "1");
        svg.style.setProperty("--s", "1");
        document.documentElement.dataset.layoutFrozen = "true";
        svg.dataset.layoutFrozen = "true";
        controller.observer?.disconnect();
        clearTimeout(controller.settleTimer);
        if (controller.frame) cancelAnimationFrame(controller.frame);
        if (controller.directory && !controller.directory.id)
          controller.directory.remove();
        controller.details?.remove();
        document
          .querySelectorAll("#map-layout-runtime,[data-layout-runtime]")
          .forEach((e) => e.remove());
        const metadata = document.createElement("script");
        metadata.id = "map-layout-frozen-report";
        metadata.type = "application/json";
        metadata.textContent = JSON.stringify({
          schemaVersion: 1,
          sourceSha256,
          referenceSize: reference,
          print:manifest.map.print??null,
          measurementEnvelope,
          outcomes: report.outcomes,
          missingRequired: report.missingRequired,
        }).replaceAll("<", "\\u003c");
        document.body.append(metadata);
        return "<!doctype html>\n" + document.documentElement.outerHTML;
      },
      { sourceSha256, measurementEnvelope, auditPolicy:policy, referenceSize },
    );
    const printEvidence=await finishPrint(page);
    if(printEvidence)frozen=await page.evaluate(()=>'<!doctype html>\n'+document.documentElement.outerHTML);
    await browser.close();
    browser = null;
    await writeFile(candidate, frozen);
    const artifactSha256 = sha(Buffer.from(frozen)),
      audits = [];
    for (const browserName of ["chromium", "firefox", "webkit"])
      for (const theme of ["light", "dark"]) {
        const report = await runAudit({
          input: candidate,
          reportDir: join(reportDir, browserName + "-" + theme),
          mode: "managed",
          policy,
          viewport,
          browserName,
          theme,
          javaScriptEnabled: false,
        });
        audits.push(report);
        if (report.status !== "pass")
          throw new Error(
            `Serialized static audit failed (${browserName}/${theme}): ${JSON.stringify(report.counts)}`,
          );
        if (report.artifactSha256 !== artifactSha256)
          throw new Error("Serialized candidate changed during static audit");
      }
    if (sha(await readFile(candidate)) !== artifactSha256)
      throw new Error("Static candidate changed before replacement");
    const result = {
      output: destination,
      sourceSha256,
      artifactSha256,
      viewport,
      measurementEnvelope,
      print:printEvidence,
      audits,
    };
    await writeFile(
      join(reportDir, "finalization.json"),
      JSON.stringify(
        {
          output: destination,
          sourceSha256,
          artifactSha256,
          viewport,
          measurementEnvelope,
          print:printEvidence,
          audits: audits.map((a) => ({
            browser: a.browser,
            theme: a.theme,
            status: a.status,
            artifactSha256: a.artifactSha256,
            policySha256: a.policySha256,
            fontSha256: a.fontSha256,
          })),
        },
        null,
        2,
      ) + "\n",
    );
    await rename(candidate, destination);
    return result;
  } catch(error) {
    if(page&&!page.isClosed()){
      const evidence=await page.evaluate(()=>({report:window.mapLayout?.getReport(),prepared:window.mapLayout?.prepared.map(a=>({id:a.id,text:a.text,candidateCount:a.candidates.length,eligibleReason:a.eligibleReason,required:a.required}))})).catch(()=>null);
      await writeFile(join(reportDir,"failure.json"),JSON.stringify({message:error.message,evidence},null,2));
      await page.screenshot({path:join(reportDir,"failure.png"),fullPage:true}).catch(()=>{});
    }
    throw error;
  } finally {
    await browser?.close();
    await new Promise((ok) => server.close(ok));
    await unlink(candidate).catch((e) => {
      if (e.code !== "ENOENT") throw e;
    });
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const args = process.argv.slice(2),
    value = (k) => args[args.indexOf(k) + 1];
  try {
    if (!args.includes("--input") || !args.includes("--output"))
      throw new Error(
        "Usage: --input STAGING.html --output FROZEN.html [--report DIR]",
      );
    const result = await finalizeStatic({
      input: value("--input"),
      output: value("--output"),
      reportDir: args.includes("--report") ? value("--report") : undefined,
    });
    console.log(
      JSON.stringify({
        output: result.output,
        artifactSha256: result.artifactSha256,
        audits: result.audits.length,
      }),
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
