import {mountFixture} from '../support/browser-fixture.js';
import {collectManagedInventory} from '../support/managed-map-adapter.js';
import { test, expect } from "@playwright/test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const policy = { version: 1, clearance: 2, edgePadding: 4, requiredRoutes: [] };
function html({
  missing = false,
  overlap = false,
  unknown = false,
  frozen = false,
  hidden = false,
} = {}) {
  const annotations = [
    {
      id: "label-a",
      elementId: "label-a",
      featureId: "a",
      kind: "point-label",
      layer: "places",
      anchor: [50, 60],
      text: "Camp A",
      requiredProfiles: ["static-default"],
    },
    ...(overlap
      ? [
          {
            id: "label-b",
            elementId: "label-b",
            featureId: "b",
            kind: "point-label",
            layer: "places",
            anchor: [55, 60],
            text: "Camp B",
            requiredProfiles: [],
          },
        ]
      : []),
  ];
  const manifest = {
    version: 1,
    map: { width: 500, height: 300, mode: "static" },
    features: [
      { id: "a", name: "Camp A", anchor: [50, 60], directory: true },
      { id: "b", name: "Camp B", anchor: [55, 60], directory: true },
    ],
    annotations,
  };
  return `<!doctype html><html data-layout-frozen="${frozen}"><style>body{margin:0}text{font:16px Arial}</style><svg id="mapsvg" width="500" height="300" viewBox="0 0 500 300">${missing ? "" : `<g id="label-a" data-layout-id="label-a" data-feature-id="a" style="visibility:${hidden ? "hidden" : "visible"}"><text x="50" y="60">Camp A</text></g>`}${overlap ? '<g id="label-b" data-layout-id="label-b" data-feature-id="b"><text x="55" y="60">Camp B</text></g>' : ""}${unknown ? '<text id="rogue" x="250" y="120">Untracked</text>' : ""}</svg><script id="map-label-manifest" type="application/json">${JSON.stringify(manifest)}</script><script>window.mapLayout={ready:Promise.resolve(),whenSettled:()=>Promise.resolve(),getReport:()=>({status:'pass',overlaps:[]})};</script>`;
}
async function audit(browserName, options = {}, extra = {}) {
  const { runAudit } = await import("../../scripts/audit-map.mjs");
  const dir = await mkdtemp(join(tmpdir(), "managed-audit-"));
  const input = join(dir, "map.html");
  await writeFile(input, html(options));
  return runAudit({
    input,
    reportDir: join(dir, "report"),
    mode: "managed",
    policy,
    browserName,
    ...extra,
  });
}
test("managed audit catches real overlap despite successful solver diagnostics", async ({
  browserName,
}) => {
  const report = await audit(browserName, { overlap: true });
  expect(report.status).toBe("findings");
  expect(report.views[0].overlaps.map((x) => x.ids)).toContainEqual([
    "label-a",
    "label-b",
  ]);
});
test("managed audit independently detects missing required annotations", async ({
  browserName,
}) => {
  const report = await audit(browserName, { missing: true });
  expect(report.views[0].missingRequired).toContain("label-a");
  expect(report.status).toBe("findings");
});
test("managed audit rejects unknown unwrapped map text", async ({
  browserName,
}) => {
  const report = await audit(browserName, { unknown: true });
  expect(report.views[0].unknown.map((x) => x.id)).toContain("rogue");
  expect(report.status).toBe("findings");
});
test("frozen static map passes with JavaScript disabled and font identity recorded", async ({
  browserName,
}) => {
  const report = await audit(
    browserName,
    { frozen: true },
    { javaScriptEnabled: false },
  );
  expect(report.status).toBe("pass");
  expect(report.fontSha256).toMatch(/^[a-f0-9]{64}$/);
  expect(report.policySha256).toMatch(/^[a-f0-9]{64}$/);
  expect(report.views[0].visible).toEqual(["label-a"]);
});
test("managed audit enforces two-pixel clearance and four-pixel edge padding", async ({
  page,
}) => {
  const { collectManagedInventory, checkManagedInventory } = await import(
    "../support/managed-map-adapter.js"
  );
  await page.setContent(html({ overlap: true }));
  await page.evaluate(() => {
    const a = document.querySelector("#label-a text"),
      b = document.querySelector("#label-b text");
    const r = a.getBBox();
    b.setAttribute("x", r.x + r.width + 1);
  });
  let report = checkManagedInventory(
    await page.evaluate(collectManagedInventory),
    policy,
  );
  expect(report.overlaps.map((x) => x.ids)).toContainEqual([
    "label-a",
    "label-b",
  ]);
  await page.locator("#label-a text").evaluate((e) => e.setAttribute("x", "2"));
  report = checkManagedInventory(
    await page.evaluate(collectManagedInventory),
    policy,
  );
  expect(report.clipped.map((x) => x.id)).toContain("label-a");
});
test("managed protected trail permits only local geographic symbol crossings", async ({
  page,
}) => {
  const { collectManagedInventory, checkManagedInventory } = await import(
    "../support/managed-map-adapter.js"
  );
  await page.setContent(html());
  await page.evaluate(() => {
    const s = document.getElementById("map-label-manifest"),
      m = JSON.parse(s.textContent);
    m.annotations[0].kind = "symbol";
    m.annotations[0].anchor = [100, 100];
    m.annotations[0].requiredProfiles = [];
    s.textContent = JSON.stringify(m);
    document.getElementById("label-a").innerHTML =
      '<circle cx="100" cy="100" r="2"/>';
    document
      .getElementById("mapsvg")
      .insertAdjacentHTML(
        "beforeend",
        '<path id="trail" data-layout-obstacle="trail" d="M50 100 H200" stroke="black" stroke-width="1"/>',
      );
  });
  expect(
    checkManagedInventory(await page.evaluate(collectManagedInventory), policy)
      .overlaps,
  ).toEqual([]);
  await page
    .locator("#label-a circle")
    .evaluate((e) => e.setAttribute("cx", "140"));
  expect(
    checkManagedInventory(
      await page.evaluate(collectManagedInventory),
      policy,
    ).overlaps.some((x) => x.obstacleKind === "trail"),
  ).toBe(true);
});
test("managed audit counts hidden eligible point names and required route groups independently", async ({
  page,
}) => {
  const { collectManagedInventory, checkManagedInventory } = await import(
    "../support/managed-map-adapter.js"
  );
  await page.setContent(html({ hidden: true }));
  let data = await page.evaluate(collectManagedInventory);
  expect(
    checkManagedInventory(data, { ...policy, requiredRoutes: ["Route A"] })
      .missingRequired,
  ).toEqual(["label-a", "route:Route A"]);
  data.manifest.map.mode = "interactive";
  expect(checkManagedInventory(data, policy).missingRequired).toEqual([
    "interactive-visible-point-name",
  ]);
});
test("managed zooms use the controller transaction rather than mutating the view directly", async ({
  browserName,
}) => {
  const { runAudit } = await import("../../scripts/audit-map.mjs");
  const dir = await mkdtemp(join(tmpdir(), "managed-controller-")),
    input = join(dir, "map.html");
  await writeFile(
    input,
    html() +
      `<script>mapLayout.requestView=({x,y,w,h})=>{document.getElementById('mapsvg').setAttribute('viewBox',[x,y,w,h].join(' '));document.getElementById('label-a').dataset.transaction='yes';};</script>`,
  );
  const report = await runAudit({
    input,
    reportDir: join(dir, "report"),
    mode: "managed",
    policy,
    browserName,
    zoomSamples: [1, 2],
  });
  expect(report.views[1].viewBox.width).toBe(250);
  expect(report.views[0].viewBox.width).toBe(500);
});
test("managed audit reserves visible legacy popup extents", async ({
  page,
}) => {
  const { collectManagedInventory, checkManagedInventory } = await import(
    "../support/managed-map-adapter.js"
  );
  await page.setContent(
    html() +
      '<div class="ttip" id="popup" style="position:absolute;left:40px;top:40px;width:100px;height:30px">Popup</div>',
  );
  const report = checkManagedInventory(
    await page.evaluate(collectManagedInventory),
    policy,
  );
  expect(report.overlaps.map((x) => x.ids)).toContainEqual([
    "label-a",
    "popup",
  ]);
});
test("rotated straight labels are independently measured character by character", async ({
  page,
}) => {
  const { collectManagedInventory } = await import(
    "../support/managed-map-adapter.js"
  );
  await page.setContent(html());
  await page
    .locator("#label-a text")
    .evaluate((e) => e.setAttribute("transform", "rotate(30 50 60)"));
  const item = (await page.evaluate(collectManagedInventory)).inventory[0];
  expect(item.polygons.length).toBe("Camp A".length);
});
test("independent trail inventory preserves authored polyline bends before anchor clipping", async ({
  page,
}) => {
  const { collectManagedInventory } = await import(
    "../support/managed-map-adapter.js"
  );
  await page.setContent(html());
  await page
    .locator("#mapsvg")
    .evaluate((svg) =>
      svg.insertAdjacentHTML(
        "beforeend",
        '<path id="bend" data-layout-obstacle="trail" d="M70 100 L100 101 L130 100" stroke="black" stroke-width="1"/>',
      ),
    );
  const segments = (
    await page.evaluate(collectManagedInventory)
  ).obstacles.filter((o) => o.kind === "trail");
  expect(
    segments.some((o) =>
      [o.segment.a, o.segment.b].some((p) => p.x === 100 && p.y === 101),
    ),
  ).toBe(true);
});
test('frozen audit rejects absent required font declarations instead of fallback',async({browserName})=>{const report=await audit(browserName,{frozen:true},{javaScriptEnabled:false,policy:{...policy,fontFamilies:['Source Sans 3']}});expect(report.status).toBe('incomplete');expect(report.fontCompleteness.missingFamilies).toContain('Source Sans 3');expect(report.fontCompleteness.missingEmbeddedFamilies).toContain('Source Sans 3');});
test('blocked terrain image makes an otherwise valid frozen map incomplete',async({browserName})=>{const {runAudit}=await import('../../scripts/audit-map.mjs'),dir=await mkdtemp(join(tmpdir(),'managed-image-')),input=join(dir,'map.html');await writeFile(input,html({frozen:true})+'<img alt="terrain" src="https://example.invalid/terrain.png">');const report=await runAudit({input,reportDir:join(dir,'report'),mode:'managed',policy,browserName,javaScriptEnabled:false});expect(report.counts.overlaps).toBe(0);expect(report.status).toBe('incomplete');expect(report.networkErrors.some(e=>e.resourceType==='image')).toBe(true);});
test('frozen required font passes only with a loaded embedded face and byte hash',async({browserName})=>{const {runAudit}=await import('../../scripts/audit-map.mjs'),{readFile}=await import('node:fs/promises'),dir=await mkdtemp(join(tmpdir(),'managed-embedded-font-')),input=join(dir,'map.html'),font=(await readFile('pipeline/labels/fonts/6ab296ea2b6ea953.ttf')).toString('base64');await writeFile(input,html({frozen:true})+`<style>@font-face{font-family:TestEmbedded;src:url(data:font/ttf;base64,${font})}text{font-family:TestEmbedded}</style>`);const report=await runAudit({input,reportDir:join(dir,'report'),mode:'managed',policy:{...policy,fontFamilies:['TestEmbedded']},browserName,javaScriptEnabled:false});expect(report.status,JSON.stringify(report.fontCompleteness)).toBe('pass');expect(report.fontHashes).toHaveLength(1);expect(report.fontCompleteness.missingFamilies).toEqual([]);expect(report.fontCompleteness.missingEmbeddedFamilies).toEqual([]);});
test('frozen audit loads an unused required embedded font without running page scripts',async({browserName})=>{
 const {runAudit}=await import('../../scripts/audit-map.mjs'),{readFile}=await import('node:fs/promises'),dir=await mkdtemp(join(tmpdir(),'managed-unused-font-')),input=join(dir,'map.html'),font=(await readFile('pipeline/labels/fonts/6ab296ea2b6ea953.ttf')).toString('base64');
 await writeFile(input,html({frozen:true})+`<style>@font-face{font-family:UnusedEmbedded;src:url(data:font/ttf;base64,${font})}</style><script>document.querySelector('svg').remove()</script>`);
 const report=await runAudit({input,reportDir:join(dir,'report'),mode:'managed',policy:{...policy,fontFamilies:['UnusedEmbedded']},browserName,javaScriptEnabled:false});
 expect(report.status,JSON.stringify(report.fontCompleteness)).toBe('pass');expect(report.fontHashes).toHaveLength(1);expect(report.fontCompleteness.missingFamilies).toEqual([]);expect(report.fontCompleteness.missingEmbeddedFamilies).toEqual([]);expect(report.views[0].inventory.length).toBeGreaterThan(0);
});
test('frozen audit rejects an unused required embedded font that cannot decode',async({browserName})=>{
 const {runAudit}=await import('../../scripts/audit-map.mjs'),dir=await mkdtemp(join(tmpdir(),'managed-invalid-font-')),input=join(dir,'map.html');
 await writeFile(input,html({frozen:true})+'<style>@font-face{font-family:InvalidEmbedded;src:url(data:font/ttf;base64,AA==)}</style>');
 const report=await runAudit({input,reportDir:join(dir,'report'),mode:'managed',policy:{...policy,fontFamilies:['InvalidEmbedded']},browserName,javaScriptEnabled:false});
 expect(report.status).toBe('incomplete');expect(report.fontCompleteness.missingFamilies).toContain('InvalidEmbedded');expect(report.fontCompleteness.missingEmbeddedFamilies).toEqual([]);
});
test('coordinate furniture is registered while the live scale remains a protected control',async({page})=>{
 const {collectManagedInventory,checkManagedInventory}=await import('../support/managed-map-adapter.js');
 await page.setContent(html({unknown:true}).replace('</svg>','<g class="coordinate-grid"><text id="grid-coordinate" x="10" y="290">36.10° N</text></g></svg>')+'<div class="live-scale" id="live-scale" style="position:absolute;left:40px;top:40px;width:100px;height:30px">1 km</div>');
 const inventory=await page.evaluate(collectManagedInventory),report=checkManagedInventory(inventory,policy);
 expect(inventory.unknown.map(x=>x.id)).not.toContain('grid-coordinate');expect(inventory.unknown.map(x=>x.id)).toContain('rogue');expect(report.overlaps.map(x=>x.ids)).toContainEqual(['label-a','live-scale']);
});
test('coverage eligibility excludes names below their declared ground-scale detail',async({page})=>{
 await mountFixture(page);await page.evaluate(()=>{mapLayout.manifest.map.metersPerMapUnit=30;mapLayout.manifest.annotations.find(a=>a.id==='label-1').maxMetersPerPixel=5;document.getElementById('map-label-manifest').textContent=JSON.stringify(mapLayout.manifest)});
 const data=await page.evaluate(collectManagedInventory);expect(data.outcomes.find(o=>o.id==='label-0').eligible).toBe(true);expect(data.outcomes.find(o=>o.id==='label-1').eligible).toBe(false);
});
