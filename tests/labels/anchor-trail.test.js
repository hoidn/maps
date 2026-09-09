import test from "node:test";
import assert from "node:assert/strict";
import { solveLayout } from "../../pipeline/labels/place.js";
import { checkManagedInventory } from "../support/managed-map-adapter.js";
const rect = (x, y, width, height) => ({ x, y, width, height });
const poly = (r) => [
  { x: r.x, y: r.y },
  { x: r.x + r.width, y: r.y },
  { x: r.x + r.width, y: r.y + r.height },
  { x: r.x, y: r.y + r.height },
];
const obstacle = (a, b, width = 1, id = "trail") => ({
  id,
  kind: "trail",
  line: { a: { x: a[0], y: a[1] }, b: { x: b[0], y: b[1] }, width },
});
function check(r, obstacles, extra = {}) {
  const shape = { bounds: r, parts: [r] },
    annotation = {
      id: "marker",
      kind: "symbol",
      anchor: [50, 50],
      anchorTrailRadius: 6,
      candidates: [{ id: "only", shape }],
      ...extra,
    };
  const placed =
    solveLayout({
      annotations: [annotation],
      obstacles,
      viewport: { width: 100, height: 100 },
      policy: { clearance: 2 },
    }).placements.length === 1;
  const inventory = {
    id: "marker",
    kind: annotation.kind,
    owner: "feature",
    anchor: { x: 50, y: 50 },
    anchorTrailRadius: annotation.anchorTrailRadius,
    anchorTrailFootprint: annotation.anchorTrailFootprint,
    polygons: [poly(r)],
  };
  const data = {
    manifest: { map: { mode: "interactive" }, annotations: [] },
    visible: ["marker"],
    outcomes: [],
    unknown: [],
    viewport: { left: 0, top: 0, right: 100, bottom: 100 },
    inventory: [inventory],
    obstacles: obstacles.map((o) => {
      const { a, b, width } = o.line;
      return {
        id: o.id,
        kind: "trail",
        segment: o.line,
        polygons: [
          poly(
            rect(
              Math.min(a.x, b.x) - width / 2,
              Math.min(a.y, b.y) - width / 2,
              Math.abs(a.x - b.x) + width,
              Math.abs(a.y - b.y) + width,
            ),
          ),
        ],
      };
    }),
  };
  const audited =
    checkManagedInventory(data, { clearance: 2, edgePadding: 4 }).overlaps
      .length === 0;
  assert.equal(placed, audited, "solver and independent audit must agree");
  return placed;
}
test("long crossing segment permits only a small true-anchor symbol", () =>
  assert.equal(
    check(rect(48, 48, 4, 4), [obstacle([0, 50], [100, 50])]),
    true,
  ));
test("bent polyline crossing allows local portions on both legs", () =>
  assert.equal(
    check(rect(48, 48, 4, 4), [
      obstacle([0, 50], [50, 50], 1, "left"),
      obstacle([50, 50], [50, 100], 1, "down"),
    ]),
    true,
  ));
test("trail outside the disk still blocks large symbols and clearance", () =>
  assert.equal(
    check(rect(45, 45, 10, 10), [obstacle([0, 50], [100, 50])]),
    false,
  ));
test("tangent segment does not receive an interval exemption", () =>
  assert.equal(
    check(rect(49, 53.5, 2, 2), [obstacle([0, 56], [100, 56])]),
    false,
  ));
test("facility moved away from geographic anchor stays blocked", () =>
  assert.equal(
    check(rect(68, 48, 4, 4), [obstacle([0, 50], [100, 50])]),
    false,
  ));
test("point labels never receive a symbol anchor exception", () =>
  assert.equal(
    check(rect(48, 48, 4, 4), [obstacle([0, 50], [100, 50])], {
      kind: "point-label",
    }),
    false,
  ));
test("untyped and oversized exceptions are not authorized", () => {
  for (const radius of [undefined, 7, 100])
    assert.equal(
      check(rect(48, 48, 4, 4), [obstacle([0, 50], [100, 50])], {
        anchorTrailRadius: radius,
      }),
      false,
    );
});
test("protected trails cannot be waived by an unrestricted obstacle ID", () =>
  assert.equal(
    check(rect(48, 48, 4, 4), [obstacle([0, 50], [100, 50])], {
      kind: "point-label",
      allowedObstacleIds: ["trail"],
    }),
    false,
  ));
test("production quadratic and independent chord clipping retain the same exact intervals", async () => {
  const { lineOutsideCircle } = await import(
    "../../pipeline/labels/geometry.js"
  );
  const { referenceOutsideAnchor } = await import(
    "../support/managed-map-adapter.js"
  );
  for (const [a, b] of [
    [
      [0, 50],
      [100, 50],
    ],
    [
      [50, 0],
      [50, 100],
    ],
    [
      [0, 0],
      [100, 100],
    ],
    [
      [0, 56],
      [100, 56],
    ],
    [
      [49, 49],
      [51, 51],
    ],
    [
      [80, 80],
      [90, 90],
    ],
  ]) {
    const line = obstacle(a, b).line,
      prod = lineOutsideCircle(line, [50, 50], 6),
      reference = referenceOutsideAnchor(line, { x: 50, y: 50 }, 6);
    assert.equal(prod.length, reference.length);
    for (let i = 0; i < prod.length; i++)
      for (const endpoint of ["a", "b"])
        assert.ok(
          Math.hypot(
            prod[i][endpoint].x - reference[i][endpoint].x,
            prod[i][endpoint].y - reference[i][endpoint].y,
          ) < 1e-8,
        );
  }
});

test("anchored full-size campground marker can cover its access trail", () =>
  assert.equal(check(rect(42,43,16,13),[obstacle([0,50],[100,50])],{anchorTrailFootprint:true}),true));
test("footprint permission does not follow a displaced marker or apply to text", () => {
  assert.equal(check(rect(68,43,16,13),[obstacle([0,50],[100,50])],{anchorTrailFootprint:true}),false);
  assert.equal(check(rect(42,43,16,13),[obstacle([0,50],[100,50])],{anchorTrailFootprint:true,kind:'point-label'}),false);
});
