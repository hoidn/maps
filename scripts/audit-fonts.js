/** Browser-side audit precondition; no production layout or acceptance logic.
 * Exercise every declared face even if a hidden style has not painted it yet.
 * WebKit screenshot stylesheet synchronization can reset those faces to unloaded.
 */
export async function loadAuditFonts(requiredFamilies=[]) {
 const normalize=name=>name.replaceAll('"','').replaceAll("'",'').trim();
 const faces=[...document.fonts].filter(face=>requiredFamilies.includes(normalize(face.family)));
 for(const family of requiredFamilies)if(!faces.some(face=>normalize(face.family)===family))throw Error('Missing audit font family: '+family);
 await Promise.all(faces.map(face=>face.load()));
 await document.fonts.ready;
 await window.mapLayout?.whenSettled?.();
 if(faces.some(face=>face.status!=='loaded'))throw Error('Declared audit font did not load');
}
