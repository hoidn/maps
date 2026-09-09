import {
  bounds,
  polygonsOverlap,
  clipPolygon,
  rectanglesOverlap,
} from "./reference-geometry.js";
// This function is serialized into the browser. It deliberately shares no solver code.
export function collectManagedInventory() {
  const map = document.querySelector("#mapsvg");
  const source = document.querySelector("#map-label-manifest");
  if (!map || !source) throw new Error("Managed map SVG/manifest missing");
  const manifest = JSON.parse(source.textContent),
    all = [...map.querySelectorAll("*")];
  const rect = (r) => ({
    left: r.left,
    top: r.top,
    right: r.right,
    bottom: r.bottom,
  });
  const viewport = rect(map.getBoundingClientRect());
  const screen = { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
  const shown = (e) => {
    for (let p = e; p && p !== document; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (
        s.display === "none" ||
        s.visibility === "hidden" ||
        Number(s.opacity) === 0 ||
        p.hasAttribute("hidden")
      )
        return false;
      const closed = p.closest("details:not([open])");
      if (closed && !p.closest("summary") && p !== closed) return false;
    }
    return true;
  };
  const project = (m, p) => {
    const v = new DOMPoint(p.x, p.y).matrixTransform(m);
    return { x: v.x, y: v.y };
  };
  const quad = (b, m, pad = 0) =>
    [
      { x: b.x - pad, y: b.y - pad },
      { x: b.x + b.width + pad, y: b.y - pad },
      { x: b.x + b.width + pad, y: b.y + b.height + pad },
      { x: b.x - pad, y: b.y + b.height + pad },
    ].map((p) => project(m, p));
  const polygons = (e) => {
    const result = [];
    for (const child of e.matches(
      "text,path,circle,rect,polygon,polyline,ellipse,line,use",
    )
      ? [e]
      : e.querySelectorAll(
          "text,path,circle,rect,polygon,polyline,ellipse,line,use",
        )) {
      if (!shown(child) || child.closest("defs")) continue;
      const m = child.getScreenCTM();
      if (!m) continue;
      const style = getComputedStyle(child),
        pad =
          style.stroke === "none"
            ? 0
            : (parseFloat(style.strokeWidth) || 0) / 2;
      if (
        child.tagName.toLowerCase() === "text" &&
        child.querySelector("textPath")
      ) {
        for (let i = 0; i < child.getNumberOfChars(); i++)
          result.push(quad(child.getExtentOfChar(i), m, pad));
      } else {
        const b = child.getBBox();
        if (b.width || b.height) result.push(quad(b, m, pad));
      }
    }
    return result;
  };
  const inventory = [],
    outcomes = [],
    unknown = [],
    features = new Map(manifest.features.map((f) => [f.id, f])),
    ids = new Set();
  const matrix = map.getScreenCTM();
  for (const a of manifest.annotations) {
    const owner = features.get(a.featureId),
      e = document.getElementById(a.elementId || a.id),
      anchor = project(matrix, { x: a.anchor[0], y: a.anchor[1] });
    const valid =
      e &&
      e.dataset.layoutId === a.id &&
      e.dataset.featureId === a.featureId &&
      owner;
    if (ids.has(a.id) || !owner || (e && !valid))
      unknown.push({ id: a.id, reason: "invalid-manifest-binding" });
    ids.add(a.id);
    const shapes = valid && shown(e) ? polygons(e) : [];
    const eligible =
      a.kind === "point-label" &&
      anchor.x >= viewport.left &&
      anchor.x <= viewport.right &&
      anchor.y >= viewport.top &&
      anchor.y <= viewport.bottom &&
      (!e || shown(e.parentElement));
    outcomes.push({
      id: a.id,
      reason: !e ? "missing-element" : shapes.length ? "visible" : "hidden",
      eligible,
    });
    if (shapes.length)
      inventory.push({
        id: a.id,
        kind: a.kind,
        owner: a.featureId,
        geometryId: a.geometryId,
        anchor,
        polygons: shapes,
        clip: viewport,
      });
  }
  for (const e of all) {
    if (e.closest("defs,.fixed-ui,.cartouche,.scale")) continue;
    const wrapper = e.closest("[data-layout-id]");
    if (e.matches("[data-layout-id]") && !ids.has(e.dataset.layoutId))
      unknown.push({
        id: e.id || e.dataset.layoutId,
        reason: "unregistered-wrapper",
      });
    if (
      !wrapper &&
      (e.tagName.toLowerCase() === "text" ||
        [...e.classList].some((c) => c.startsWith("s-")))
    )
      unknown.push({
        id: e.id || "unwrapped-" + all.indexOf(e),
        reason: "unwrapped-annotation",
      });
  }
  const obstacles = [];
  const controls = [
    ...document.querySelectorAll(
      '.ctl,.hint,.zlabel,.readout,.layers summary,.layers[open] .box,.tooltip,.ttip,[data-layout-details],[role="dialog"],[role="tooltip"],button,input,select,[role="button"],#mapsvg .cartouche,#mapsvg .scale',
    ),
  ];
  for (const e of controls) {
    if (!shown(e) || controls.some((p) => p !== e && p.contains(e))) continue;
    const r = e.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    obstacles.push({
      id: e.id || "control-" + [...document.querySelectorAll("*")].indexOf(e),
      kind: "control",
      owner: "control",
      clip: e instanceof SVGElement ? viewport : screen,
      polygons: [
        [
          { x: r.left, y: r.top },
          { x: r.right, y: r.top },
          { x: r.right, y: r.bottom },
          { x: r.left, y: r.bottom },
        ],
      ],
    });
  }
  for (const e of map.querySelectorAll('[data-layout-obstacle="trail"]')) {
    if (!shown(e)) continue;
    const m = e.getScreenCTM(),
      s = getComputedStyle(e);
    if (s.stroke === "none") continue;
    const scale = Math.max(Math.hypot(m.a, m.b), Math.hypot(m.c, m.d)),
      width =
        (parseFloat(s.strokeWidth) || 0) *
        (s.vectorEffect === "non-scaling-stroke" ? 1 : scale),
      length = e.getTotalLength(),
      steps = Math.max(1, Math.ceil((length * scale) / 3));
    let a = project(m, e.getPointAtLength(0));
    for (let i = 1; i <= steps; i++) {
      const b = project(m, e.getPointAtLength((length * i) / steps)),
        dx = b.x - a.x,
        dy = b.y - a.y,
        len = Math.hypot(dx, dy),
        r = width / 2;
      if (len) {
        const nx = (-dy / len) * r,
          ny = (dx / len) * r;
        const poly = [
          { x: a.x + nx, y: a.y + ny },
          { x: b.x + nx, y: b.y + ny },
          { x: b.x - nx, y: b.y - ny },
          { x: a.x - nx, y: a.y - ny },
        ];
        if (
          Math.max(a.x, b.x) + r >= viewport.left &&
          Math.min(a.x, b.x) - r <= viewport.right &&
          Math.max(a.y, b.y) + r >= viewport.top &&
          Math.min(a.y, b.y) - r <= viewport.bottom
        )
          obstacles.push({
            id: (e.id || "trail-" + all.indexOf(e)) + ":" + i,
            pathId: e.id,
            kind: "trail",
            owner: e.dataset.featureId || null,
            clip: viewport,
            segment: { a, b, width },
            polygons: [poly],
          });
      }
      a = b;
    }
  }
  return {
    manifest,
    inventory,
    annotationPolygons: inventory,
    obstacles,
    outcomes,
    visible: inventory.map((x) => x.id),
    unknown,
    unresolved: unknown,
    viewport,
    viewBox: {
      x: map.viewBox.baseVal.x,
      y: map.viewBox.baseVal.y,
      width: map.viewBox.baseVal.width,
      height: map.viewBox.baseVal.height,
    },
    fonts: [...document.fonts].map((f) => ({
      family: f.family,
      status: f.status,
    })),
    fontStatus: document.fonts.status,
    frozen:
      document.documentElement.dataset.layoutFrozen === "true" ||
      map.dataset.layoutFrozen === "true",
  };
}
function pointSegmentDistance(p, a, b) {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    len = dx * dx + dy * dy,
    t = len
      ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len))
      : 0;
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
function nearPolygons(a, b, clearance) {
  const aa = bounds(a),
    bb = bounds(b);
  if (
    !rectanglesOverlap(
      {
        left: aa.left - clearance,
        top: aa.top - clearance,
        right: aa.right + clearance,
        bottom: aa.bottom + clearance,
      },
      bb,
    )
  )
    return false;
  if (polygonsOverlap(a, b)) return true;
  if (!clearance) return false;
  for (const [p, q] of [
    [a, b],
    [b, a],
  ])
    for (const point of p)
      for (let i = 0; i < q.length; i++)
        if (
          pointSegmentDistance(point, q[i], q[(i + 1) % q.length]) < clearance
        )
          return true;
  return false;
}
export function checkManagedInventory(data, policy = {}) {
  const overlaps = [],
    clipped = [],
    missingRequired = [],
    unknown = [...data.unknown],
    v = data.viewport,
    clearance = policy.clearance ?? 2,
    padding = policy.edgePadding ?? 4;
  const visible = new Set(data.visible),
    annotations = data.manifest.annotations;
  for (const item of data.inventory) {
    const b = bounds(item.polygons.flat());
    if (
      b.left < v.left + padding ||
      b.top < v.top + padding ||
      b.right > v.right - padding ||
      b.bottom > v.bottom - padding
    )
      clipped.push({ id: item.id, bounds: b });
  }
  const boundCache = new Map(
    [...data.inventory, ...data.obstacles].map((item) => [
      item,
      bounds(item.polygons.flat()),
    ]),
  );
  const collide = (a, b) => {
    const aa = boundCache.get(a),
      bb = boundCache.get(b);
    if (
      !rectanglesOverlap(
        {
          left: aa.left - clearance,
          top: aa.top - clearance,
          right: aa.right + clearance,
          bottom: aa.bottom + clearance,
        },
        bb,
      )
    )
      return false;
    const ac = a.clip || v,
      bc = b.clip || v,
      clip = {
        left: Math.max(ac.left, bc.left),
        top: Math.max(ac.top, bc.top),
        right: Math.min(ac.right, bc.right),
        bottom: Math.min(ac.bottom, bc.bottom),
      };
    if (clip.left >= clip.right || clip.top >= clip.bottom) return false;
    const ap = a.polygons
        .map((p) => clipPolygon(p, clip))
        .filter((p) => p.length >= 3),
      bp = b.polygons
        .map((p) => clipPolygon(p, clip))
        .filter((p) => p.length >= 3);
    return ap.some((p) => bp.some((q) => nearPolygons(p, q, clearance)));
  };
  for (let i = 0; i < data.inventory.length; i++) {
    const a = data.inventory[i];
    for (let j = i + 1; j < data.inventory.length; j++)
      if (collide(a, data.inventory[j]))
        overlaps.push({ ids: [a.id, data.inventory[j].id] });
    for (const b of data.obstacles) {
      // Only segments wholly inside the symbol's declared six-pixel anchor area
      // are permitted; sharing a feature or trail ID is not a blanket exemption.
      if (
        a.kind === "symbol" &&
        b.kind === "trail" &&
        [b.segment.a, b.segment.b].every(
          (p) => Math.hypot(p.x - a.anchor.x, p.y - a.anchor.y) <= 6,
        )
      )
        continue;
      if (collide(a, b))
        overlaps.push({ ids: [a.id, b.id], obstacleKind: b.kind });
    }
  }
  if (data.manifest.map.mode === "static" || data.frozen) {
    for (const a of annotations)
      if (
        a.requiredProfiles?.includes(
          policy.staticProfile || "static-default",
        ) &&
        !visible.has(a.id)
      )
        missingRequired.push(a.id);
    for (const group of policy.requiredRoutes || [])
      if (
        !annotations.some((a) => a.requiredGroup === group && visible.has(a.id))
      )
        missingRequired.push("route:" + group);
  } else if (
    data.outcomes.some((o) => o.eligible) &&
    !data.outcomes.some((o) => o.eligible && visible.has(o.id))
  )
    missingRequired.push("interactive-visible-point-name");
  return { overlaps, clipped, missingRequired, unknown, unresolved: unknown };
}
