import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, dirname, join, extname } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import * as playwright from "@playwright/test";
import {
  collectLegacyInventory,
  setLegacyZoom,
} from "../tests/support/legacy-map-adapter.js";
import { checkInventory } from "../tests/support/reference-geometry.js";
import {
  collectManagedInventory,
  checkManagedInventory,
} from "../tests/support/managed-map-adapter.js";
export const legacyPolicy = Object.freeze({
  id: "legacy-rendered-audit-v1",
  version: 1,
  footprints:
    "screen-transformed-text-rectangles-per-character-on-paths-with-half-stroke-padding",
  intersection: "positive-area-polygon-intersection-within-common-visible-clip",
  controls: "whole-visible-panels-and-passive-readouts",
  ownership: "unknown-is-unresolved-no-assumed-exemptions",
  clipping: "partly-visible-annotations-crossing-own-clip",
  zoom: "original-viewBox-centered-samples-and-legacy-visibility-classes",
});
export async function runAudit({
  input,
  reportDir,
  mode = "legacy",
  zoomSamples = [1],
  browserName = "chromium",
  viewport = { width: 1440, height: 1000 },
  policy,
  theme = "light",
  deviceScaleFactor = 1,
  javaScriptEnabled = true,
}) {
  if (!["legacy", "managed"].includes(mode))
    throw new Error(`Unsupported audit mode: ${mode}`);
  const source = resolve(input),
    bytes = await readFile(source),
    root = dirname(source);
  const policyBytes =
    mode === "legacy"
      ? Buffer.from(JSON.stringify(legacyPolicy))
      : policy
        ? Buffer.from(JSON.stringify(policy))
        : await readFile(resolve("pipeline/labels/policy.json"));
  const auditPolicy = JSON.parse(policyBytes.toString());
  const embeddedFonts = [
    ...bytes
      .toString()
      .matchAll(
        /url\(["']?(data:font\/[^;]+;base64,([A-Za-z0-9+/=]+))["']?\)/g,
      ),
  ]
    .map((m) =>
      createHash("sha256").update(Buffer.from(m[2], "base64")).digest("hex"),
    )
    .sort();
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      const file =
        url.pathname === "/"
          ? source
          : resolve(root, "." + decodeURIComponent(url.pathname));
      if (file !== source && !file.startsWith(root + "/")) {
        res.writeHead(403);
        res.end();
        return;
      }
      res.setHeader(
        "Content-Type",
        {
          ".html": "text/html",
          ".js": "text/javascript",
          ".woff2": "font/woff2",
          ".json": "application/json",
        }[extname(file)] || "application/octet-stream",
      );
      res.end(file === source ? bytes : await readFile(file));
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise((ok, fail) => {
    server.once("error", fail);
    server.listen(0, "127.0.0.1", ok);
  });
  let browser;
  try {
    await mkdir(reportDir, { recursive: true });
    browser = await playwright[browserName].launch();
    const page = await browser.newPage({
      viewport,
      deviceScaleFactor,
      javaScriptEnabled,
      colorScheme: theme,
    });
    if (mode === "managed")
      await page.route("**/*", (route) =>
        route.request().isNavigationRequest() &&
        route.request().url() === `http://127.0.0.1:${server.address().port}/`
          ? route.continue()
          : route.abort("blockedbyclient"),
      );
    const networkErrors = [];
    page.on("requestfailed", (r) =>
      networkErrors.push({
        url: r.url(),
        error: r.failure()?.errorText,
        resourceType: r.resourceType(),
      }),
    );
    page.on("response", (r) => {
      if (r.status() >= 400)
        networkErrors.push({
          url: r.url(),
          error: `HTTP ${r.status()}`,
          resourceType: r.request().resourceType(),
        });
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/`, {
      waitUntil: "load",
      timeout: 30000,
    });
    if (mode === "managed" && !javaScriptEnabled)
      await page.evaluate((theme) => {
        document.documentElement.dataset.theme = theme;
      }, theme);
    if (mode === "managed" && javaScriptEnabled)
      await page.evaluate(async (theme) => {
        document.documentElement.dataset.theme = theme;
        if (window.mapLayout) {
          await window.mapLayout.ready;
          await window.mapLayout.whenSettled?.();
        }
      }, theme);
    const fontReady = !javaScriptEnabled
      ? await page.evaluate(() => document.fonts.status === "loaded")
      : await page.evaluate(async () =>
          Promise.race([
            document.fonts.ready.then(() => true),
            new Promise((r) => setTimeout(() => r(false), 10000)),
          ]),
        );
    const views = [];
    for (const zoom of zoomSamples) {
      if (mode === "legacy") await setLegacyZoom(page, zoom);
      else if (!javaScriptEnabled) {
        if (zoom !== 1)
          throw new Error("Zoom requires JavaScript runtime controller");
      } else
        await page.evaluate(async (z) => {
          const m = JSON.parse(
            document.getElementById("map-label-manifest").textContent,
          );
          if (window.mapLayout?.requestView) {
            const w = m.map.width / z,
              h = m.map.height / z;
            await window.mapLayout.requestView({
              x: (m.map.width - w) / 2,
              y: (m.map.height - h) / 2,
              w,
              h,
            });
            await window.mapLayout.whenSettled?.();
          } else if (z !== 1)
            throw new Error("Zoom requires managed runtime controller");
        }, zoom);
      const data = await page.evaluate(
        mode === "legacy" ? collectLegacyInventory : collectManagedInventory,
      );
      const checks =
        mode === "legacy"
          ? checkInventory(data.inventory, data.viewport)
          : checkManagedInventory(data, auditPolicy);
      const view = { zoom, ...data, ...checks };
      views.push(view);
      const offenders = [
        ...new Set([
          ...checks.overlaps.flatMap((x) => x.ids),
          ...checks.clipped.map((x) => x.id),
        ]),
      ];
      await page.evaluate(
        ({ items, offenders }) => {
          document.querySelector("#audit-overlay")?.remove();
          const ns = "http://www.w3.org/2000/svg",
            svg = document.createElementNS(ns, "svg");
          svg.id = "audit-overlay";
          svg.style =
            "position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:2147483647";
          for (const item of items)
            if (offenders.includes(item.id))
              for (const poly of item.polygons) {
                const p = document.createElementNS(ns, "polygon");
                p.setAttribute(
                  "points",
                  poly.map((p) => `${p.x},${p.y}`).join(" "),
                );
                p.setAttribute("fill", "#ff000018");
                p.setAttribute("stroke", "red");
                p.setAttribute("stroke-width", "1");
                svg.append(p);
              }
          document.body.append(svg);
        },
        { items: data.inventory, offenders },
      );
      await page.screenshot({ path: join(reportDir, `zoom-${zoom}.png`) });
      await page.evaluate(() =>
        document.querySelector("#audit-overlay")?.remove(),
      );
    }
    const incomplete =
      !fontReady ||
      views.some(
        (v) =>
          v.fontStatus !== "loaded" ||
          v.fonts.some((f) => f.status === "error" || f.status === "loading"),
      ) ||
      networkErrors.some((e) =>
        ["stylesheet", "font"].includes(e.resourceType),
      );
    const counts = Object.fromEntries(
      [
        "overlaps",
        "clipped",
        "unresolved",
        ...(mode === "managed" ? ["missingRequired"] : []),
      ].map((k) => [k, views.reduce((n, v) => n + v[k].length, 0)]),
    );
    const report = {
      schemaVersion: 1,
      mode,
      policyId:
        mode === "legacy"
          ? legacyPolicy.id
          : "managed-layout-policy-v" + auditPolicy.version,
      policy: auditPolicy,
      policySha256: createHash("sha256").update(policyBytes).digest("hex"),
      artifactSha256: createHash("sha256").update(bytes).digest("hex"),
      input,
      ...(mode === "managed"
        ? {
            fontHashes: embeddedFonts,
            fontSha256: createHash("sha256")
              .update(JSON.stringify(embeddedFonts))
              .digest("hex"),
            theme,
            deviceScaleFactor,
            javaScriptEnabled,
          }
        : {}),
      browser: browserName,
      browserVersion: browser.version(),
      viewport,
      status: incomplete
        ? "incomplete"
        : Object.values(counts).some(Boolean)
          ? "findings"
          : "pass",
      counts,
      networkErrors,
      views,
    };
    await writeFile(
      join(reportDir, "report.json"),
      JSON.stringify(report, null, 2) + "\n",
    );
    await writeFile(
      join(reportDir, "report.html"),
      `<!doctype html><meta charset="utf-8"><title>Map audit</title><h1>${report.status}</h1><pre>${JSON.stringify({ artifactSha256: report.artifactSha256, counts }, null, 2)}</pre>${views.map((v) => `<h2>Zoom ${v.zoom}</h2><img style="max-width:100%" src="zoom-${v.zoom}.png">`).join("")}`,
    );
    return report;
  } finally {
    await browser?.close();
    await new Promise((ok) => server.close(ok));
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const args = process.argv.slice(2),
    value = (k) => args[args.indexOf(k) + 1];
  try {
    if (!args.includes("--input") || !args.includes("--report"))
      throw new Error(
        "Usage: --input FILE --mode legacy|managed [--zoom-samples 1,2,4.5,6,14] [--browser chromium|firefox|webkit] [--no-js] [--theme light|dark] --report DIR",
      );
    const zoomSamples = args.includes("--zoom-samples")
      ? value("--zoom-samples").split(",").map(Number)
      : [1];
    if (zoomSamples.some((z) => !Number.isFinite(z) || z <= 0))
      throw new Error("Zoom samples must be positive numbers");
    const r = await runAudit({
      input: value("--input"),
      reportDir: value("--report"),
      mode: args.includes("--mode") ? value("--mode") : "legacy",
      zoomSamples,
      javaScriptEnabled: !args.includes("--no-js"),
      theme: args.includes("--theme") ? value("--theme") : "light",
      browserName: args.includes("--browser") ? value("--browser") : "chromium",
    });
    console.log(
      JSON.stringify({
        status: r.status,
        counts: r.counts,
        artifactSha256: r.artifactSha256,
      }),
    );
    process.exitCode = r.status === "pass" ? 0 : 1;
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  }
}
