// Independent audit geometry. Do not import placement-engine acceptance routines.
export function bounds(points) {
  return {
    left: Math.min(...points.map((p) => p.x)),
    right: Math.max(...points.map((p) => p.x)),
    top: Math.min(...points.map((p) => p.y)),
    bottom: Math.max(...points.map((p) => p.y)),
  };
}
export function rectanglesOverlap(a, b) {
  return (
    a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
  );
}
export function polygonsOverlap(a, b) {
  if (!rectanglesOverlap(bounds(a), bounds(b))) return false;
  for (const poly of [a, b])
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i],
        q = poly[(i + 1) % poly.length],
        axis = { x: p.y - q.y, y: q.x - p.x };
      const ap = a.map((v) => v.x * axis.x + v.y * axis.y),
        bp = b.map((v) => v.x * axis.x + v.y * axis.y);
      if (
        Math.max(...ap) <= Math.min(...bp) ||
        Math.max(...bp) <= Math.min(...ap)
      )
        return false;
    }
  return true;
}
export function checkInventory(inventory, viewport) {
  const overlaps = [],
    clipped = [],
    unresolved = [];
  for (let i = 0; i < inventory.length; i++) {
    const a = inventory[i],
      b = bounds(a.polygons.flat());
    if (!a.owner) unresolved.push({ id: a.id, reason: "unknown-ownership" });
    const v = a.clip || viewport;
    if (
      b.right <= v.left ||
      b.left >= v.right ||
      b.bottom <= v.top ||
      b.top >= v.bottom
    )
      continue;
    if (
      b.left < v.left ||
      b.right > v.right ||
      b.top < v.top ||
      b.bottom > v.bottom
    )
      clipped.push({ id: a.id, bounds: b });
    for (let j = i + 1; j < inventory.length; j++) {
      const c = inventory[j];
      if (a.polygons.some((p) => c.polygons.some((q) => polygonsOverlap(p, q))))
        overlaps.push({ ids: [a.id, c.id] });
    }
  }
  return { overlaps, clipped, unresolved };
}
