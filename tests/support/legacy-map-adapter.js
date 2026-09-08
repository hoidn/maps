// Serializable browser-side inventory; IDs are stable DOM indices if legacy markup lacks IDs.
export function collectLegacyInventory() {
  const map = document.querySelector("#mapsvg, svg.map, svg");
  if (!map) throw new Error("No map SVG");
  const all = [...map.querySelectorAll("*")];
  const rect = (r) => ({
    left: r.left,
    top: r.top,
    right: r.right,
    bottom: r.bottom,
  });
  const clip = rect(map.getBoundingClientRect());
  const visible = (e) => {
    for (let p = e; p && p !== document; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (
        s.display === "none" ||
        s.visibility === "hidden" ||
        Number(s.opacity) === 0 ||
        p.hasAttribute("hidden")
      )
        return false;
    }
    return true;
  };
  const quad = (r, m, pad = 0) =>
    [
      { x: r.x - pad, y: r.y - pad },
      { x: r.x + r.width + pad, y: r.y - pad },
      { x: r.x + r.width + pad, y: r.y + r.height + pad },
      { x: r.x - pad, y: r.y + r.height + pad },
    ].map((p) => {
      const q = new DOMPoint(p.x, p.y).matrixTransform(m);
      return { x: q.x, y: q.y };
    });
  const result = [];
  const measure = (e, kind) => {
    if (!visible(e)) return;
    const s = getComputedStyle(e),
      m = e.getScreenCTM?.();
    let polygons = [];
    if (m) {
      const pad =
        s.stroke !== "none" ? (parseFloat(s.strokeWidth) || 0) / 2 : 0;
      if (e.tagName.toLowerCase() === "text" && e.querySelector("textPath")) {
        for (let i = 0; i < e.getNumberOfChars(); i++) {
          const r = e.getExtentOfChar(i);
          polygons.push(quad(r, m, pad));
        }
      } else {
        const b = e.getBBox();
        if (!b.width && !b.height) return;
        polygons = [quad(b, m, pad)];
      }
    } else {
      const r = e.getBoundingClientRect();
      if (!r.width || !r.height) return;
      polygons = [
        [
          { x: r.left, y: r.top },
          { x: r.right, y: r.top },
          { x: r.right, y: r.bottom },
          { x: r.left, y: r.bottom },
        ],
      ];
    }
    result.push({
      id:
        e.id ||
        `legacy-${kind}-${all.indexOf(e) >= 0 ? all.indexOf(e) : result.length}`,
      kind,
      text: e.textContent?.trim().slice(0, 180) || "",
      owner:
        e.dataset.owner ||
        e.closest("[data-feature-id]")?.dataset.featureId ||
        null,
      polygons,
      clip: e instanceof SVGElement ? clip : null,
    });
  };
  for (const e of map.querySelectorAll("text")) {
    if (!e.closest(".cartouche,.scale")) measure(e, "text");
  }
  for (const e of map.querySelectorAll(".cartouche,.scale"))
    measure(e, "control");
  // Original builders group each icon's paths in one transformed g. A symbol can
  // also be a single immediate child. Never classify every decorative path as a POI.
  for (const layer of map.querySelectorAll(".symbols,.peaks"))
    for (const e of layer.children) {
      if (e.tagName.toLowerCase() === "text") continue;
      if (e.querySelector("text")) {
        for (const child of e.children)
          if (child.tagName.toLowerCase() !== "text") measure(child, "symbol");
      } else measure(e, "symbol");
    }
  for (const e of document.querySelectorAll(
    'button,input,select,[role="button"]',
  ))
    if (!map.contains(e)) measure(e, "control");
  return {
    inventory: result,
    viewport: clip,
    fonts: [...document.fonts].map((f) => ({
      family: f.family,
      status: f.status,
    })),
    fontStatus: document.fonts.status,
  };
}
export async function setLegacyZoom(page, zoom) {
  await page.evaluate((z) => {
    const svg = document.querySelector("#mapsvg,svg.map,svg");
    const b = svg.viewBox.baseVal;
    const w = Number(svg.dataset.w) || b.width,
      h = Number(svg.dataset.h) || b.height;
    svg.setAttribute(
      "viewBox",
      `${(w - w / z) / 2} ${(h - h / z) / 2} ${w / z} ${h / z}`,
    );
    svg.style.setProperty("--k", Math.pow(z, -0.55).toFixed(3));
    svg.style.setProperty("--s", Math.pow(z, -0.5).toFixed(3));
    for (const [c, on] of [
      ["zoomed", z > 1.02],
      ["z2", z >= 2],
      ["z5", z >= 4.5],
    ])
      svg.classList.toggle(c, on);
  }, zoom);
}
