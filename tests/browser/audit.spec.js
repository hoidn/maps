import { test, expect } from "@playwright/test";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
test("audit reports actual overlapping IDs and clipping with transformed bounds", async ({
  browserName,
}) => {
  const { runAudit } = await import("../../scripts/audit-map.mjs");
  const reportDir = await mkdtemp(join(tmpdir(), "map-audit-"));
  const report = await runAudit({
    input: "tests/fixtures/layout-overlap.html",
    reportDir,
    browserName,
  });
  expect(report.status).toBe("findings");
  expect(report.views[0].overlaps).toContainEqual(
    expect.objectContaining({ ids: ["label-a", "label-b"] }),
  );
  expect(report.views[0].clipped.map((x) => x.id)).toContain("clipped");
  expect(
    report.views[0].overlaps.some((x) => x.ids.includes("contour-number")),
  ).toBe(false);
  const rotated = report.views[0].inventory.find((x) => x.id === "rotated");
  expect(rotated.polygons[0][0].y).not.toBe(rotated.polygons[0][1].y);
  expect(
    JSON.parse(await readFile(join(reportDir, "report.json"), "utf8"))
      .artifactSha256,
  ).toMatch(/^[a-f0-9]{64}$/);
});
test("CLI writes diagnostics and exits nonzero for legacy findings", async ({
  browserName,
}) => {
  const { execFile } = await import("node:child_process");
  const reportDir = await mkdtemp(join(tmpdir(), "map-audit-cli-"));
  const result = await new Promise((resolve) =>
    execFile(
      process.execPath,
      [
        "scripts/audit-map.mjs",
        "--input",
        "tests/fixtures/layout-overlap.html",
        "--mode",
        "legacy",
        "--browser",
        browserName,
        "--report",
        reportDir,
      ],
      { cwd: process.cwd() },
      (error, stdout, stderr) =>
        resolve({ code: error?.code || 0, stdout, stderr }),
    ),
  );
  expect(result.code).toBe(1);
  expect(
    JSON.parse(await readFile(join(reportDir, "report.json"), "utf8")).browser,
  ).toBe(browserName);
  expect(JSON.parse(result.stdout).counts.overlaps).toBeGreaterThan(0);
  expect(
    JSON.parse(await readFile(join(reportDir, "report.json"), "utf8")).views[0]
      .clipped[0].id,
  ).toBe("clipped");
});
test("missing font stylesheet marks measurements incomplete", async ({
  browserName,
}) => {
  const { runAudit } = await import("../../scripts/audit-map.mjs");
  const { writeFile } = await import("node:fs/promises");
  const dir = await mkdtemp(join(tmpdir(), "map-audit-font-"));
  const input = join(dir, "font.html");
  await writeFile(
    input,
    '<!doctype html><link rel="stylesheet" href="missing-font.css"><svg width="300" height="200"><text data-owner="a" x="20" y="40">Font test</text></svg>',
  );
  const report = await runAudit({
    input,
    reportDir: join(dir, "report"),
    browserName,
  });
  expect(report.status).toBe("incomplete");
  expect(
    report.networkErrors.some((e) => e.url.endsWith("missing-font.css")),
  ).toBe(true);
});
test("fixed panels are obstacles as a whole and grouped symbol paths stay one item", async ({
  browserName,
}) => {
  const { runAudit } = await import("../../scripts/audit-map.mjs");
  const { writeFile } = await import("node:fs/promises");
  const dir = await mkdtemp(join(tmpdir(), "map-audit-groups-"));
  const input = join(dir, "groups.html");
  await writeFile(
    input,
    '<!doctype html><svg width="400" height="300"><g id="panel" class="cartouche"><rect width="200" height="150"/><text x="20" y="30">Panel title</text></g><text id="intruder" x="20" y="100">Inside panel</text><g class="symbols"><g id="icon"><path d="M250 200h10v10h-10Z"/><path d="M255 195v20" stroke="black"/></g></g></svg>',
  );
  const report = await runAudit({
    input,
    reportDir: join(dir, "report"),
    browserName,
  });
  expect(
    report.views[0].overlaps.some(
      (x) => x.ids.includes("panel") && x.ids.includes("intruder"),
    ),
  ).toBe(true);
  expect(
    report.views[0].inventory
      .filter((x) => x.kind === "symbol")
      .map((x) => x.id),
  ).toEqual(["icon"]);
  expect(report.views[0].unresolved.map((x) => x.id)).toContain("icon");
});
test("legacy controls include whole panels and visible passive readouts", async ({
  page,
}) => {
  const { collectLegacyInventory } = await import(
    "../support/legacy-map-adapter.js"
  );
  await page.setContent(
    `<svg width="400" height="300"></svg><div class="ctl" id="controls"><button id="child">Zoom</button><div class="zlabel">2x</div></div><div class="hint" id="hint">Pan</div><div class="readout" id="readout">2000ft</div><details class="layers" open><summary id="summary">Layers</summary><div class="box" id="box"><input type="checkbox" id="check"></div></details>`,
  );
  const items = (await page.evaluate(collectLegacyInventory)).inventory;
  expect(items.map((x) => x.id)).toEqual(
    expect.arrayContaining(["controls", "hint", "readout", "summary", "box"]),
  );
  expect(items.map((x) => x.id)).not.toEqual(
    expect.arrayContaining(["child", "check"]),
  );
  await page.locator("details").evaluate((e) => (e.open = false));
  expect(
    (await page.evaluate(collectLegacyInventory)).inventory.map((x) => x.id),
  ).not.toContain("box");
});
test("legacy zoom bases every sample on the original extent", async ({
  page,
}) => {
  const { setLegacyZoom } = await import("../support/legacy-map-adapter.js");
  await page.setContent(
    '<svg width="400" height="300" viewBox="10 20 400 300"></svg>',
  );
  await setLegacyZoom(page, 2);
  await setLegacyZoom(page, 4);
  expect(await page.locator("svg").getAttribute("viewBox")).toBe(
    "160 132.5 100 75",
  );
  await setLegacyZoom(page, 1);
  expect(await page.locator("svg").getAttribute("viewBox")).toBe(
    "10 20 400 300",
  );
});
test("audit resets a later zoom-one sample and identifies its rules", async ({
  browserName,
}) => {
  const { runAudit } = await import("../../scripts/audit-map.mjs");
  const dir = await mkdtemp(join(tmpdir(), "map-zoom-reset-"));
  const report = await runAudit({
    input: "tests/fixtures/layout-overlap.html",
    reportDir: dir,
    zoomSamples: [1, 2, 1],
    browserName,
  });
  expect(report.views[2].inventory).toEqual(report.views[0].inventory);
  expect(report.policyId).toBe("legacy-rendered-audit-v1");
  expect(report.policySha256).toMatch(/^[a-f0-9]{64}$/);
});
test("overlap outside the common visible clip remains only a clipping finding", async () => {
  const { checkInventory } = await import("../support/reference-geometry.js");
  const box = (left, top, right, bottom) => [
    { x: left, y: top },
    { x: right, y: top },
    { x: right, y: bottom },
    { x: left, y: bottom },
  ];
  const clip = { left: 0, top: 0, right: 100, bottom: 100 };
  const report = checkInventory(
    [
      { id: "a", owner: "a", polygons: [box(90, 0, 130, 50)], clip },
      { id: "b", owner: "b", polygons: [box(110, 0, 150, 50)], clip },
    ],
    clip,
  );
  expect(report.overlaps).toEqual([]);
  expect(report.clipped.map((x) => x.id)).toContain("a");
});
test('clipped polygons retain collisions when a vertex lies exactly on the clip edge',async()=>{
 const {checkInventory}=await import('../support/reference-geometry.js');
 const clip={left:0,top:0,right:100,bottom:100};
 const report=checkInventory([
  {id:'diamond',owner:'diamond',clip,polygons:[[{x:0,y:10},{x:20,y:30},{x:0,y:50},{x:-20,y:30}]]},
  {id:'box',owner:'box',clip,polygons:[[{x:2,y:20},{x:12,y:20},{x:12,y:40},{x:2,y:40}]]}
 ],clip);
 expect(report.overlaps).toEqual([{ids:['diamond','box']}]);
});
