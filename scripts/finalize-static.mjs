import { createServer } from "node:http";
import { readFile, writeFile, mkdir, rename, unlink } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash, randomUUID } from "node:crypto";
import { chromium } from "@playwright/test";
import { runAudit } from "./audit-map.mjs";
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
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
  let browser;
  try {
    browser = await chromium.launch();
    const page = await browser.newPage({ viewport, colorScheme: "light" });
    const url = `http://127.0.0.1:${server.address().port}/`;
    await page.route("**/*", (r) =>
      r.request().isNavigationRequest() && r.request().url() === url
        ? r.continue()
        : r.abort("blockedbyclient"),
    );
    await page.goto(url, { waitUntil: "load" });
    const frozen = await page.evaluate(
      async ({ sourceSha256 }) => {
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
        // All placement distances are resolved at the declared natural map size.
        svg.style.width = width + "px";
        svg.style.height = height + "px";
        svg.style.maxWidth = "none";
        svg.style.minWidth = width + "px";
        await controller.requestView({ x: 0, y: 0, w: width, h: height });
        await controller.whenSettled();
        const r = svg.getBoundingClientRect();
        if (
          Math.abs(r.width - width) > 0.5 ||
          Math.abs(r.height - height) > 0.5
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
          referenceSize: { width, height },
          outcomes: report.outcomes,
          missingRequired: report.missingRequired,
        }).replaceAll("<", "\\u003c");
        document.body.append(metadata);
        return "<!doctype html>\n" + document.documentElement.outerHTML;
      },
      { sourceSha256 },
    );
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
