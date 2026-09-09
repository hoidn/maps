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
  const mapRect = map.getBoundingClientRect(), viewport = rect(mapRect);
  const renderer = window.mapLayout?.renderer?.active ? window.mapLayout.renderer : null;
  const cameraView = renderer ? window.mapLayout.view : null;
  const sourceMatrix = map.getScreenCTM();
  const fit = cameraView ? Math.min(mapRect.width / cameraView.w, mapRect.height / cameraView.h) : 1;
  const cameraMatrix = cameraView ? new DOMMatrix([fit,0,0,fit,
    mapRect.x+(mapRect.width-cameraView.w*fit)/2-cameraView.x*fit,
    mapRect.y+(mapRect.height-cameraView.h*fit)/2-cameraView.y*fit]) : sourceMatrix;
  const canvasPaint = new Map(renderer?.painted.map(p => [p.id,p]) || []);
  const paintContext = renderer ? document.createElement('canvas').getContext('2d') : null;
  const screen = { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
  const shown = (e) => {
    for (let p = e; p && p !== document; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (
        s.display === "none" ||
        s.visibility === "hidden" ||
        (Number(s.opacity) === 0 && !(renderer && p === map)) ||
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
  // Independent clipping stays inside this serialized collector. Intersect two
  // conservative round-stroke enclosures: local padded quad and screen padded
  // bounds. Rotating a local square alone invents excess diagonal halo.
  const paintedQuad = (box, matrix, pad, round) => {
    let polygon = quad(box, matrix, pad);
    if (!pad || !round) return polygon;
    const core = quad(box, matrix);
    const aa = matrix.a ** 2 + matrix.b ** 2;
    const bb = matrix.c ** 2 + matrix.d ** 2;
    const ab = matrix.a * matrix.c + matrix.b * matrix.d;
    const radius = pad * Math.sqrt((aa + bb + Math.hypot(aa - bb, 2 * ab)) / 2);
    for (const [axis, edge, sign] of [
      ['x', Math.min(...core.map(p => p.x)) - radius, 1],
      ['x', Math.max(...core.map(p => p.x)) + radius, -1],
      ['y', Math.min(...core.map(p => p.y)) - radius, 1],
      ['y', Math.max(...core.map(p => p.y)) + radius, -1],
    ]) {
      const input = polygon; polygon = [];
      for (let i = 0; i < input.length; i++) {
        const a = input[i], b = input[(i + 1) % input.length];
        const insideA = sign * (a[axis] - edge) >= 0;
        const insideB = sign * (b[axis] - edge) >= 0;
        if (insideA) polygon.push(a);
        if (insideA !== insideB) {
          const t = (edge - a[axis]) / (b[axis] - a[axis]);
          polygon.push({x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y)});
        }
      }
    }
    return polygon;
  };
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
        isText = child.tagName.toLowerCase() === "text",
        round = isText && style.strokeLinejoin === "round",
        pad =
          style.stroke === "none"
            ? 0
            : ((parseFloat(style.strokeWidth) || 0) / 2) *
              (isText && style.strokeLinejoin.startsWith("miter") ? Math.max(1, parseFloat(style.strokeMiterlimit) || 4) : 1);
      if (
        child.tagName.toLowerCase() === "text" &&
        (child.querySelector("textPath,tspan[data-layout-primary]") ||
          Math.abs(m.b) > 1e-8 ||
          Math.abs(m.c) > 1e-8)
      ) {
        for (let i = 0; i < child.getNumberOfChars(); i++)
          result.push(paintedQuad(child.getExtentOfChar(i), m, pad, round));
      } else {
        const b = child.getBBox();
        if (b.width || b.height) result.push(paintedQuad(b, m, pad, round));
      }
    }
    return result;
  };
  // Bound actual Canvas paint commands independently of solver footprints.
  // Glyph ink metrics come from the browser's Canvas font renderer.
  const canvasPolygons = id => (canvasPaint.get(id)?.commands || []).flatMap(c => {
    const s=c.style;if(!s.opacity || (s.fill==='none' && s.stroke==='none'))return [];
    let b=c.bounds;
    if(c.kind==='glyph'){
      // A whitespace command paints no pixels; some engines still report an
      // em-height TextMetrics box for it. Do not invent paint from that advance.
      if(!c.text.trim())return [];
      paintContext.font=s.font;paintContext.fontKerning='none';
      const t=paintContext.measureText(c.text);
      b={x:-t.actualBoundingBoxLeft,y:-t.actualBoundingBoxAscent,
        width:t.actualBoundingBoxLeft+t.actualBoundingBoxRight,
        height:t.actualBoundingBoxAscent+t.actualBoundingBoxDescent};
    }
    if(!b || !(b.width||b.height))return [];
    if(c.kind==='path'){
      // Rasterize the actual path to measure joins/caps, rather than multiplying
      // a bounding box by the miter limit (which invents false symbol collisions).
      // The half-coverage boundary estimates geometric ink, as the SVG audit
      // does; faint antialiasing fringes are not treated as extra geometry.
      const pad=s.width/2*Math.max(1,s.miter)+1,density=16,ctx=paintContext;
      ctx.canvas.width=Math.ceil((b.width+2*pad)*density);ctx.canvas.height=Math.ceil((b.height+2*pad)*density);
      ctx.setTransform(density,0,0,density,(pad-b.x)*density,(pad-b.y)*density);
      ctx.lineWidth=s.width;ctx.lineJoin=s.join;ctx.lineCap=s.cap;ctx.miterLimit=s.miter;
      if(s.fill!=='none'){ctx.fillStyle='black';ctx.fill(c.path,s.fillRule);}
      if(s.stroke!=='none'&&s.width){ctx.strokeStyle='black';ctx.stroke(c.path);}
      const w=ctx.canvas.width,h=ctx.canvas.height,data=ctx.getImageData(0,0,w,h).data;
      let left=w,top=h,right=0,bottom=0;
      for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(data[(y*w+x)*4+3]>=128){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x+1);bottom=Math.max(bottom,y+1);}
      if(right<=left)return [];
      b={x:b.x-pad+(left+0.5)/density,y:b.y-pad+(top+0.5)/density,width:(right-left-1)/density,height:(bottom-top-1)/density};
    }
    const m=new DOMMatrix(c.matrix);
    m.e+=mapRect.x-renderer.paintViewport.x+(canvasPaint.get(id).offset?.[0]||0);m.f+=mapRect.y-renderer.paintViewport.y+(canvasPaint.get(id).offset?.[1]||0);
    const pad=c.kind==='path'||s.stroke==='none'?0:s.width/2*(s.join.startsWith('miter')?Math.max(1,s.miter):1);
    return [paintedQuad(b,m,pad,s.join==='round')];
  });
  const inventory = [],
    outcomes = [],
    unknown = [],
    features = new Map(manifest.features.map((f) => [f.id, f])),
    ids = new Set();
  const matrix = cameraMatrix;
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
    const shapes = !valid ? [] : renderer ? canvasPolygons(a.id) : shown(e) ? polygons(e) : [];
    const eligible =
      a.kind === "point-label" &&
      (!a.maxMetersPerPixel || !manifest.map.metersPerMapUnit || manifest.map.metersPerMapUnit / Math.hypot(matrix.a, matrix.b) <= a.maxMetersPerPixel) &&
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
        anchorTrailRadius: a.kind === "symbol" ? 6 : undefined,
        anchorTrailFootprint: a.kind === "symbol",
        polygons: shapes,
        clip: viewport,
      });
  }
  for (const e of all) {
    if (e.closest("defs,.fixed-ui,.cartouche,.scale,.coordinate-grid")) continue;
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
      '.ctl,.hint,.zlabel,.readout,.live-scale,.layers summary,.layers[open] .box,.tooltip,.ttip,[data-layout-details],[role="dialog"],[role="tooltip"],button,input,select,[role="button"],#mapsvg .cartouche,#mapsvg .scale',
    ),
  ];
  for (const e of controls) {
    if (renderer && e instanceof SVGElement && manifest.map.width/cameraView.w>1.02) continue;
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
    const m = renderer ? cameraMatrix.multiply(sourceMatrix.inverse()).multiply(e.getScreenCTM()) : e.getScreenCTM(),
      s = getComputedStyle(e);
    const strokeRatio = renderer ? cameraView.w/map.viewBox.baseVal.width : 1;
    if (s.stroke === "none") continue;
    const scale = Math.max(Math.hypot(m.a, m.b), Math.hypot(m.c, m.d)),
      width =
        (parseFloat(s.strokeWidth) || 0) * strokeRatio *
        (s.vectorEffect === "non-scaling-stroke" ? 1 : scale),
      length = e.getTotalLength(),
      steps = Math.max(1, Math.ceil((length * scale) / 3));
    // Preserve exact authored M/L vertices (including separate subpaths). Uniform
    // sampling across a corner would invent a chord through an anchor disk.
    const tokens =
      (e.getAttribute("d") || "").match(
        /[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g,
      ) || [];
    let pairs = [],
      command = null,
      previous = { x: 0, y: 0 },
      valid = tokens.length > 0;
    for (let index = 0; index < tokens.length && valid; ) {
      if (/^[a-zA-Z]$/.test(tokens[index])) command = tokens[index++];
      if (
        !["M", "m", "L", "l"].includes(command) ||
        index + 1 >= tokens.length
      ) {
        valid = false;
        break;
      }
      const x = Number(tokens[index++]),
        y = Number(tokens[index++]);
      if (!Number.isFinite(x + y)) {
        valid = false;
        break;
      }
      const next = {
        x: x + (command === command.toLowerCase() ? previous.x : 0),
        y: y + (command === command.toLowerCase() ? previous.y : 0),
      };
      if (command === "L" || command === "l")
        pairs.push([project(m, previous), project(m, next)]);
      previous = next;
      command = command === "M" ? "L" : command === "m" ? "l" : command;
    }
    if (!valid) {
      pairs = [];
      let previous = project(m, e.getPointAtLength(0));
      for (let i = 1; i <= steps; i++) {
        const next = project(m, e.getPointAtLength((length * i) / steps));
        pairs.push([previous, next]);
        previous = next;
      }
    }
    for (let i = 0; i < pairs.length; i++) {
      const [a, b] = pairs[i],
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
      x: cameraView?.x ?? map.viewBox.baseVal.x,
      y: cameraView?.y ?? map.viewBox.baseVal.y,
      width: cameraView?.w ?? map.viewBox.baseVal.width,
      height: cameraView?.h ?? map.viewBox.baseVal.height,
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
      const ab = boundCache.get(a);
      if (a.kind === "symbol" && a.anchorTrailFootprint && b.kind === "trail" &&
          a.anchor.x >= ab.left && a.anchor.x <= ab.right && a.anchor.y >= ab.top && a.anchor.y <= ab.bottom) continue;
      if (
        a.kind === "symbol" &&
        a.anchorTrailRadius === 6 &&
        b.kind === "trail" &&
        b.segment
      ) {
        const aa = boundCache.get(a),
          bb = boundCache.get(b),
          gap = clearance + (b.segment.width || 0) / 2;
        if (
          !rectanglesOverlap(
            {
              left: aa.left - gap,
              top: aa.top - gap,
              right: aa.right + gap,
              bottom: aa.bottom + gap,
            },
            bb,
          )
        )
          continue;
        const outside = referenceOutsideAnchor(b.segment, a.anchor, 6);
        const ac = a.clip || v,
          bc = b.clip || v,
          clip = {
            left: Math.max(ac.left, bc.left),
            top: Math.max(ac.top, bc.top),
            right: Math.min(ac.right, bc.right),
            bottom: Math.min(ac.bottom, bc.bottom),
          };
        const parts = a.polygons
          .map((p) => clipPolygon(p, clip))
          .filter((p) => p.length >= 3);
        if (
          outside.some((segment) =>
            parts.some((p) => referenceLineNearPolygon(segment, p, clearance)),
          )
        )
          overlaps.push({ ids: [a.id, b.id], obstacleKind: b.kind });
      } else if (collide(a, b))
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

// Independent reference construction: project the circle center onto the unit
// segment and subtract its chord interval. No production clipping code is used.
export function referenceOutsideAnchor(segment, center, radius) {
  const { a, b } = segment,
    dx = b.x - a.x,
    dy = b.y - a.y,
    length = Math.hypot(dx, dy);
  if (!length)
    return Math.hypot(a.x - center.x, a.y - center.y) < radius ? [] : [segment];
  const ux = dx / length,
    uy = dy / length,
    along = (center.x - a.x) * ux + (center.y - a.y) * uy;
  const normal = (center.x - a.x) * uy - (center.y - a.y) * ux,
    squared = radius * radius - normal * normal;
  if (squared <= 0) return [segment];
  const halfChord = Math.sqrt(squared),
    entry = Math.max(0, along - halfChord),
    exit = Math.min(length, along + halfChord);
  if (exit <= entry) return [segment];
  const point = (s) => ({ x: a.x + ux * s, y: a.y + uy * s }),
    result = [];
  if (entry > 0) result.push({ ...segment, b: point(entry) });
  if (exit < length) result.push({ ...segment, a: point(exit) });
  return result;
}
function referenceLineNearPolygon(segment, polygon, clearance) {
  const a = segment.a,
    b = segment.b,
    limit = (segment.width || 0) / 2 + clearance;
  const cross = (u, v, w) =>
    (v.x - u.x) * (w.y - u.y) - (v.y - u.y) * (w.x - u.x);
  const inside = (p) => {
    const sides = polygon.map((v, i) =>
      cross(v, polygon[(i + 1) % polygon.length], p),
    );
    return sides.every((v) => v >= 0) || sides.every((v) => v <= 0);
  };
  if (inside(a) || inside(b)) return true;
  for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i],
      q = polygon[(i + 1) % polygon.length];
    if (
      cross(a, b, p) * cross(a, b, q) < 0 &&
      cross(p, q, a) * cross(p, q, b) < 0
    )
      return true;
    if (
      Math.min(
        pointSegmentDistance(a, p, q),
        pointSegmentDistance(b, p, q),
        pointSegmentDistance(p, a, b),
        pointSegmentDistance(q, a, b),
      ) <= limit
    )
      return true;
  }
  return false;
}
