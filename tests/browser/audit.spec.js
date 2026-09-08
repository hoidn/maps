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
test("CLI writes diagnostics and exits nonzero for legacy findings", async () => {
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
        "--report",
        reportDir,
      ],
      { cwd: process.cwd() },
      (error, stdout, stderr) =>
        resolve({ code: error?.code || 0, stdout, stderr }),
    ),
  );
  expect(result.code).toBe(1);
  expect(JSON.parse(result.stdout).counts.overlaps).toBeGreaterThan(0);
  expect(
    JSON.parse(await readFile(join(reportDir, "report.json"), "utf8")).views[0]
      .clipped[0].id,
  ).toBe("clipped");
});
test("missing font stylesheet marks measurements incomplete", async () => {
  const { runAudit } = await import("../../scripts/audit-map.mjs");
  const { writeFile } = await import("node:fs/promises");
  const dir = await mkdtemp(join(tmpdir(), "map-audit-font-"));
  const input = join(dir, "font.html");
  await writeFile(
    input,
    '<!doctype html><link rel="stylesheet" href="missing-font.css"><svg width="300" height="200"><text data-owner="a" x="20" y="40">Font test</text></svg>',
  );
  const report = await runAudit({ input, reportDir: join(dir, "report") });
  expect(report.status).toBe("incomplete");
  expect(
    report.networkErrors.some((e) => e.url.endsWith("missing-font.css")),
  ).toBe(true);
});
test("fixed panels are obstacles as a whole and grouped symbol paths stay one item", async () => {
  const { runAudit } = await import("../../scripts/audit-map.mjs");
  const { writeFile } = await import("node:fs/promises");
  const dir = await mkdtemp(join(tmpdir(), "map-audit-groups-"));
  const input = join(dir, "groups.html");
  await writeFile(
    input,
    '<!doctype html><svg width="400" height="300"><g id="panel" class="cartouche"><rect width="200" height="150"/><text x="20" y="30">Panel title</text></g><text id="intruder" x="20" y="100">Inside panel</text><g class="symbols"><g id="icon"><path d="M250 200h10v10h-10Z"/><path d="M255 195v20" stroke="black"/></g></g></svg>',
  );
  const report = await runAudit({ input, reportDir: join(dir, "report") });
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
