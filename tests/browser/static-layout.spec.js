import { test, expect } from "@playwright/test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { build } from "esbuild";
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
  expect(
    result.audits.every((a) => a.status === "pass" && !a.javaScriptEnabled),
  ).toBe(true);
  expect(new Set(result.audits.map((a) => a.artifactSha256))).toEqual(
    new Set([result.artifactSha256]),
  );
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
