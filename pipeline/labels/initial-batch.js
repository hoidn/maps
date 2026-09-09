const score=a=>a.textImportance??a.priority??0;
const stable=(a,b)=>a.id<b.id?-1:a.id>b.id?1:0;
const named=a=>a.kind?.endsWith('-label')&&a.text?.trim()&&!a.style?.startsWith('l-contour');
const primaryPoint=a=>a.kind==='point-label'&&(a.importanceClass==='primary'||score(a)>=800);
/** A bounded first-label seed, not a permanent visibility filter. All annotations
 * remain in ordered; only the named feature representatives and their markers
 * may extend the initial soft time budget, through ordinary cooperative slices. */
export function initialBatch(annotations,{eligible=()=>true,minimumNames=8}={}){
 const ordered=[...annotations].sort((a,b)=>score(b)-score(a)||stable(a,b));
 const names=ordered.filter(a=>named(a)&&eligible(a)).sort((a,b)=>Number(primaryPoint(b))-Number(primaryPoint(a))||score(b)-score(a)||stable(a,b));
 const representatives=new Map();for(const a of names){const feature=a.featureId??a.id;if(!representatives.has(feature))representatives.set(feature,a);}
 const chosen=[...representatives.values()].slice(0,minimumNames),features=new Set(chosen.map(a=>a.featureId??a.id)),namedIds=new Set(chosen.map(a=>a.id));
 const markers=ordered.filter(a=>a.kind==='symbol'&&features.has(a.featureId)&&eligible(a)),minimumIds=new Set([...namedIds,...markers.map(a=>a.id)]);
 return {ordered:[...chosen,...markers,...ordered.filter(a=>!minimumIds.has(a.id))],namedIds,minimumIds,eligibleNamedFeatures:representatives.size};
}
