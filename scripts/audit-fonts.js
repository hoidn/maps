/** Browser-side audit precondition; no production layout or acceptance logic.
 * Exercise every declared face even if a hidden style has not painted it yet.
 * WebKit stylesheet synchronization can reset those faces to unloaded.
 */
export async function loadAuditFonts(requiredFamilies=[]) {
 const normalize=name=>name.replaceAll('"','').replaceAll("'",'').trim();
 const declared=()=>[...document.fonts].filter(face=>requiredFamilies.includes(normalize(face.family)));
 for(let attempt=0;attempt<5;attempt++){
  await window.mapLayout?.whenSettled?.();
  document.documentElement.getBoundingClientRect();
  const faces=declared();
  for(const family of requiredFamilies)if(!faces.some(face=>normalize(face.family)===family))throw Error('Missing audit font family: '+family);
  await Promise.all(faces.map(face=>face.load()));
  await document.fonts.ready;
  await window.mapLayout?.whenSettled?.();
  // A pending layout can invalidate WebKit's hidden-face cache. Flush its final
  // style writes and re-enumerate rather than checking stale face references.
  document.documentElement.getBoundingClientRect();
  const current=declared();
  if(current.length===faces.length&&current.every((face,i)=>face===faces[i]&&face.status==='loaded'))return;
 }
 throw Error('Declared audit fonts did not stabilize after layout');
}
