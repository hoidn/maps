const kinds = new Set(['point-label','line-label','region-label','symbol','edge-pointer','facility-group']);
export function validateManifest(m) {
  if(m?.version!==1 || !(m.map?.width>0) || !(m.map?.height>0) || !Number.isFinite(m.map.width+m.map.height)) throw new Error('Invalid map manifest');
  if(!Array.isArray(m.features)||!Array.isArray(m.annotations)||!m.annotations.length) throw new Error('Empty annotation inventory');
  const features=new Set(), ids=new Set();
  const anchor = a => Array.isArray(a) && a.length===2 && a.every(Number.isFinite);
  for(const f of m.features) {
    if(!f.id||features.has(f.id)||!anchor(f.anchor)) throw new Error('Invalid or duplicate feature');
    features.add(f.id);
  }
  for(const a of m.annotations) {
    if(!a.id||ids.has(a.id)||a.elementId!==a.id||!features.has(a.featureId)||!kinds.has(a.kind)||!anchor(a.anchor)) throw new Error('Invalid or duplicate annotation: '+a.id);
    ids.add(a.id);
  }
  return m;
}
