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
