import { test, expect, chromium } from "@playwright/test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { build } from "esbuild";
import {execFileSync} from 'node:child_process';
import { fixtureHTML } from "../support/browser-fixture.js";
const policy = {
  version: 1,
  clearance: 2,
  edgePadding: 4,
  requiredRoutes: [],
  staticProfile: "static-default",
};
let runtime;
test.beforeAll(async () => {
  runtime = (
    await build({
      stdin: {
        contents: `import {LayoutController} from './pipeline/labels/runtime.js';import policy from './pipeline/labels/policy.json';policy.requiredRoutes=[];window.mapLayout=new LayoutController(document.getElementById('mapsvg'),JSON.parse(document.getElementById('map-label-manifest').textContent),policy);`,
        resolveDir: resolve("."),
      },
      bundle: true,
      format: "iife",
      write: false,
    })
  ).outputFiles[0].text;
});
async function inputFile(extra = "") {
  const dir = await mkdtemp(join(tmpdir(), "static-layout-"));
  const input = join(dir, "input.html"),
    output = join(dir, "output.html");
  await writeFile(
    input,
    (await fixtureHTML("static")) +
      extra +
      '<script id="map-layout-runtime">' +
      runtime +
      '</script><script id="profile-interaction">window.profileReady=true;</script>',
  );
  return { dir, input, output };
}
test('fixed SVG controls retain measured directional paint reserves',async({page})=>{
  const paths=await inputFile('<script>document.getElementById("mapsvg").insertAdjacentHTML("beforeend",\'<g class="cartouche"><rect x="20" y="20" width="50" height="30"/></g>\');</script>');
  await page.setContent(await readFile(paths.input,'utf8'));
  await page.evaluate(()=>window.mapLayout.ready);
  const result=await page.evaluate(()=>{
    const c=window.mapLayout,plain=c.controls().find(o=>o.id.startsWith('fixed-')).shape.bounds;
    c.policy.fixedControlReserves=[{left:.25,top:.5,right:.75,bottom:1}];
    return {plain,reserved:c.controls().find(o=>o.id.startsWith('fixed-')).shape.bounds};
  });
  expect(result.reserved).toEqual({x:result.plain.x-.25,y:result.plain.y-.5,width:result.plain.width+1,height:result.plain.height+1.5});
});
test("static finalizer bakes SVG and verifies serialized bytes in three engines and both themes", async ({
  browserName,
}) => {
  test.skip(
    browserName !== "chromium",
    "One workflow invokes all three independent audit engines.",
  );
  const { finalizeStatic } = await import("../../scripts/finalize-static.mjs");
  const paths = await inputFile('<script>document.getElementById("mapsvg").insertAdjacentHTML("beforeend",\'<g class="cartouche"><rect x="20" y="320" width="200" height="20" fill="white" stroke="black" stroke-width=".8"/></g>\');</script>');
  const result = await finalizeStatic({
    ...paths,
    reportDir: join(paths.dir, "reports"),
    policy,
  });
  const output = await readFile(paths.output, "utf8");
  expect(output).not.toContain('id="map-layout-runtime"');
  expect(output).toContain('id="profile-interaction"');
  expect(output).toContain('data-layout-frozen="true"');
  expect(output).toContain('id="map-layout-frozen-report"');
  expect(output).not.toContain("data-layout-details");
  expect(result.measurementEnvelope.reservePx).toBeGreaterThan(0);
  expect(result.measurementEnvelope.fixedControlReserves).toHaveLength(1);
  expect(result.measurementEnvelope.fixedControlReserves[0].bottom).toBeGreaterThan(0);
  expect(result.measurementEnvelope.profiles.map(p=>p.browser)).toEqual(["chromium","firefox","webkit"]);
  expect(result.audits).toHaveLength(6);
  expect(result.audits.every(a=>!Object.hasOwn(a,'views'))).toBe(true);
  expect(
    result.audits.every((a) => a.status === "pass" && !a.javaScriptEnabled),
  ).toBe(true);
  expect(new Set(result.audits.map((a) => a.artifactSha256))).toEqual(
    new Set([result.artifactSha256]),
  );
  for(const audit of result.audits){
    const {views,...metadata}=JSON.parse(await readFile(audit.reportPath,'utf8'));
    expect(views).toHaveLength(1);expect(views[0].inventory.length).toBeGreaterThan(0);
    expect(audit).toEqual({...metadata,reportPath:audit.reportPath});
  }
});
test("static finalizer preserves destination when required placement is impossible", async ({
  browserName,
}) => {
  test.skip(browserName !== "chromium", "Workflow test.");
  const { finalizeStatic } = await import("../../scripts/finalize-static.mjs");
  const paths = await inputFile(
    '<script>const s=document.getElementById("map-label-manifest"),m=JSON.parse(s.textContent);m.annotations[0].anchor=[-10000,-10000];s.textContent=JSON.stringify(m);</script>',
  );
  await writeFile(paths.output, "prior output");
  await expect(
    finalizeStatic({ ...paths, policy, reportDir: join(paths.dir, "reports") }),
  ).rejects.toThrow(/required/i);
  expect(await readFile(paths.output, "utf8")).toBe("prior output");
});
test('renderer crash fails finalization without hanging in diagnostic evaluation',async({browserName})=>{
  test.skip(browserName!=='chromium','Workflow regression deliberately crashes its staging Chromium renderer.');
  const {finalizeStatic}=await import('../../scripts/finalize-static.mjs');
  const paths=await inputFile();
  await writeFile(paths.input,(await readFile(paths.input,'utf8'))+'<script>Object.defineProperty(mapLayout,"ready",{get(){window.awaitingStaticLayout=true;return new Promise(()=>{});}});</script>');
  await writeFile(paths.output,'prior output');
  const launch=chromium.launch;let stagingBrowser,crashTask,timer,finalizing;
  chromium.launch=async(...args)=>{
    stagingBrowser=await launch.apply(chromium,args);
    const newPage=stagingBrowser.newPage.bind(stagingBrowser);
    stagingBrowser.newPage=async(...options)=>{
      const page=await newPage(...options);
      page.once('load',()=>{crashTask=(async()=>{
        await page.waitForFunction(()=>window.awaitingStaticLayout);
        const session=await page.context().newCDPSession(page);
        await session.send('Page.crash').catch(()=>{});
      })().catch(()=>{});});
      return page;
    };
    return stagingBrowser;
  };
  try{
    finalizing=finalizeStatic({...paths,policy,reportDir:join(paths.dir,'reports')}).then(()=>null,error=>error);
    const error=await Promise.race([finalizing,new Promise(resolve=>{timer=setTimeout(()=>resolve(new Error('Finalizer hung after renderer crash')),7000);})]);
    expect(error?.message).toMatch(/Static layout renderer crashed/);
    expect(stagingBrowser.isConnected()).toBe(false);
    expect(await readFile(paths.output,'utf8')).toBe('prior output');
    expect(JSON.parse(await readFile(join(paths.dir,'reports/failure.json'),'utf8')).message).toMatch(/renderer crashed/);
  }finally{
    clearTimeout(timer);chromium.launch=launch;await stagingBrowser?.close();await crashTask;await finalizing;
  }
});
test("frozen subtraction preserves placed paint and the full audit inventory", async ({browserName,browser}) => {
  test.skip(browserName !== "chromium", "Finalization audits all three engines and both themes.");
  const {finalizeStatic}=await import("../../scripts/finalize-static.mjs");
  const paths=await inputFile(),source=await readFile(paths.input,"utf8");
  const original=source.match(/<script[^>]*id="map-label-manifest"[^>]*>([\s\S]*?)<\/script>/)[1];
  const manifest=JSON.parse(original),extra=[];
  for(const [id,requirements] of [["hidden-optional",{}],["hidden-profile",{requiredProfiles:["another-profile"]}],["hidden-group",{requiredGroup:"Another route"}],["hidden-parent",{}]]){
    const anchor=[10000,10000],featureId="feature-"+id;
    manifest.features.push({id:featureId,name:id,anchor,directory:false});
    manifest.annotations.push({id,elementId:id,featureId,kind:"point-label",layer:"places",anchor,text:id,style:"l-place",priority:100,requiredProfiles:[],...requirements});
    extra.push(`<g id="${id}" data-layout-id="${id}" data-feature-id="${featureId}"><text class="l-place" x="10000" y="10000">${id}</text></g>`);
  }
  extra[3]=extra[3].replace('</g>',extra[1]+'</g>');extra[1]='';
  await writeFile(paths.input,source.replace(original,JSON.stringify(manifest)).replace('<g class="labels">','<g class="labels">'+extra.join("")));
  const result=await finalizeStatic({...paths,policy,reportDir:join(paths.dir,"reports")});
  const page=await browser.newPage({javaScriptEnabled:false});
  await page.setContent(await readFile(paths.output,"utf8"));
  const frozen=await page.evaluate(()=>({
    manifest:JSON.parse(document.getElementById("map-label-manifest").textContent),
    report:JSON.parse(document.getElementById("map-layout-frozen-report").textContent),
    wrappers:[...document.querySelectorAll("[data-layout-id]")].map(e=>e.dataset.layoutId),
  }));
  await page.close();
  expect(frozen.manifest).toEqual(manifest);
  expect(frozen.wrappers).not.toContain("hidden-optional");
  expect(frozen.wrappers).toEqual(expect.arrayContaining(["label-0","label-1","hidden-profile","hidden-group","hidden-parent"]));
  const placed=frozen.report.outcomes.filter(o=>o.reason==="placed").map(o=>o.id);
  expect(placed).toEqual(expect.arrayContaining(["label-0","label-1"]));
  expect(frozen.wrappers).toEqual(expect.arrayContaining(placed));
  const ids=manifest.annotations.map(a=>a.id).sort();
  expect(frozen.report.outcomes.map(o=>o.id).sort()).toEqual(ids);
  expect(frozen.report.outcomes.find(o=>o.id==="hidden-optional").reason).toBe("outside-view");
  expect(result.audits).toHaveLength(6);
  for(const audit of result.audits){
    expect(audit.status).toBe("pass");
    const report=JSON.parse(await readFile(audit.reportPath,'utf8'));
    expect(report.views[0].manifest).toEqual(manifest);
    expect(report.views[0].outcomes.map(o=>o.id).sort()).toEqual(ids);
    expect(report.views[0].outcomes.find(o=>o.id==="hidden-optional").reason).toBe("missing-element");
    expect(report.views[0].visible).toEqual(expect.arrayContaining(placed));
  }
});
test('finalization accepts chunked staging and re-chunks rewritten metadata without losing inventory',async({browserName,browser})=>{
  test.skip(browserName!=='chromium','Finalization audits all engines and both themes.');
  const {finalizeStatic}=await import('../../scripts/finalize-static.mjs');
  const paths=await inputFile(),source=await readFile(paths.input,'utf8');
  const original=source.match(/<script[^>]*id="map-label-manifest"[^>]*>[\s\S]*?<\/script>/)[0];
  const manifest=JSON.parse(original.slice(original.indexOf('>')+1,-9));
  manifest.map.note='';
  const prefix=JSON.stringify(manifest).split('"note":"')[0]+'"note":"';
  manifest.map.note='a'.repeat(65536-Buffer.byteLength(prefix))+'\ufeff😀漢é<&</script>\u2028\u2029'+'z'.repeat(65536);
  const wrappers=[];
  for(let i=0;i<1200;i++){
    const id='omitted-'+i,featureId='f-'+id,anchor=[10000,10000];
    manifest.features.push({id:featureId,name:'Outside',anchor,directory:false});
    manifest.annotations.push({id,elementId:id,featureId,kind:'point-label',layer:'places',anchor,text:'Outside',style:'l-place',priority:100,requiredProfiles:[]});
    wrappers.push(`<g id="${id}" data-layout-id="${id}" data-feature-id="${featureId}"><text class="l-place" x="10000" y="10000">Outside</text></g>`);
  }
  const embedded=execFileSync(resolve('.venv/bin/python'),['-c',"import json,sys;sys.path.insert(0,'pipeline');from label_manifest import json_script;print(json_script('map-label-manifest',json.load(sys.stdin)),end='')"],{input:JSON.stringify(manifest),encoding:'utf8'});
  expect(embedded).toContain('data-json-chunks');
  // Print sizing performs this same ID.textContent rewrite before freezing.
  const rewrite='<script data-layout-runtime>const data=document.getElementById("map-label-manifest");data.textContent=JSON.stringify(JSON.parse(data.textContent));</script>';
  await writeFile(paths.input,source.replace(original,embedded+rewrite).replace('<g class="labels">','<g class="labels">'+wrappers.join('')));
  const result=await finalizeStatic({...paths,policy,reportDir:join(paths.dir,'reports')});
  const page=await browser.newPage({javaScriptEnabled:false});await page.setContent(await readFile(paths.output,'utf8'));
  const frozen=await page.evaluate(()=>Object.fromEntries(['map-label-manifest','map-layout-frozen-report'].map(id=>{const e=document.getElementById(id);return [id,{tag:e.tagName,hidden:e.hidden,value:JSON.parse(e.textContent),bytes:[...e.children].map(child=>new TextEncoder().encode(child.textContent).length)}];})));
  await page.close();
  for(const data of Object.values(frozen)){expect(data.tag).toBe('DIV');expect(data.hidden).toBe(true);expect(data.bytes.length).toBeGreaterThan(1);expect(Math.max(...data.bytes)).toBeLessThanOrEqual(65536);}
  expect(frozen['map-label-manifest'].value).toEqual(manifest);
  expect(frozen['map-layout-frozen-report'].value.outcomes).toHaveLength(manifest.annotations.length);
  expect(result.audits).toHaveLength(6);
  for(const audit of result.audits){const report=JSON.parse(await readFile(audit.reportPath,'utf8'));expect(audit.status).toBe('pass');expect(report.views[0].manifest).toEqual(manifest);expect(report.views[0].outcomes).toHaveLength(manifest.annotations.length);}
});
test("serialization-only collision prevents output replacement", async ({
  browserName,
}) => {
  test.skip(browserName !== "chromium", "Workflow test.");
  const { finalizeStatic } = await import("../../scripts/finalize-static.mjs");
  const paths = await inputFile(
    "<style>html[data-layout-frozen] [data-layout-id]{transform:none!important}</style>",
  );
  await writeFile(paths.output, "prior output");
  await expect(
    finalizeStatic({ ...paths, policy, reportDir: join(paths.dir, "reports") }),
  ).rejects.toThrow(/audit|collision/i);
  expect(await readFile(paths.output, "utf8")).toBe("prior output");
  const failure=JSON.parse(await readFile(join(paths.dir,"reports/failure.json"),"utf8"));
  expect(failure.message).toMatch(/audit|collision/i);
  expect(await readFile(failure.candidate,"utf8")).toContain('data-layout-frozen="true"');
});
test("missing embedded font prevents static export", async ({
  browserName,
}) => {
  test.skip(browserName !== "chromium", "Workflow test.");
  const { finalizeStatic } = await import("../../scripts/finalize-static.mjs");
  const paths = await inputFile();
  await writeFile(
    paths.input,
    (await readFile(paths.input, "utf8")).replaceAll(
      /data:font\/ttf;base64,[A-Za-z0-9+/=]+/g,
      "missing-font.ttf",
    ),
  );
  await writeFile(paths.output, "prior output");
  await expect(
    finalizeStatic({ ...paths, policy, reportDir: join(paths.dir, "reports") }),
  ).rejects.toThrow(/font|load/i);
  expect(await readFile(paths.output, "utf8")).toBe("prior output");
});
