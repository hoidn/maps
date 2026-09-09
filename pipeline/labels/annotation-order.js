// Only ranking and entity-dependency metadata is cached. Geometry, eligibility,
// candidates and results remain specific to each solve. Two entries cover
// recurring fast/settled orders, including pure camera translation.
const recent=[];
const stride=6;
export function annotationOrder(annotations){
 const rank=new Array(annotations.length*stride);
 for(let i=0;i<annotations.length;i++){
  const a=annotations[i],j=i*stride;
  rank[j]=a.id;rank[j+1]=a.priority??0;rank[j+2]=!!a.pinned;rank[j+3]=!!a.required;
  rank[j+4]=a.kind;rank[j+5]=a.featureId;
 }
 const found=recent.findIndex(c=>c.rank.length===rank.length&&c.rank.every((value,i)=>Object.is(value,rank[i])));
 if(found>=0){const [cached]=recent.splice(found,1);recent.unshift(cached);return cached.indices;}
 // Exact ranking snapshots include every ID, so a cache hit also preserves
 // uniqueness. Validate new inventories before publishing cached indices.
 const ids=new Set();for(let i=0;i<rank.length;i+=stride){if(ids.has(rank[i]))throw new Error('Duplicate annotation ID');ids.add(rank[i]);}
 const sorted=Array.from({length:annotations.length},(_,i)=>i).sort((i,j)=>{
  const a=i*stride,b=j*stride;
  return Number(rank[b+2])-Number(rank[a+2])||Number(rank[b+3])-Number(rank[a+3])||rank[b+1]-rank[a+1]||(rank[a]<rank[b]?-1:rank[a]>rank[b]?1:0);
 });
 const markers=new Map();
 for(const i of sorted){const j=i*stride,feature=rank[j+5];if(rank[j+4]==='symbol'&&feature!==undefined&&feature!==null){let group=markers.get(feature);if(!group)markers.set(feature,group=[]);group.push(i);}}
 const indices=[],emitted=new Set();
 const emit=i=>{if(!emitted.has(i)){emitted.add(i);indices.push(i);}};
 for(const i of sorted){
  const j=i*stride;
  // An optional point name must fit around its own marker. Pull only that
  // feature's marker(s) immediately ahead of its text; unrelated priorities
  // remain authoritative. Required static text and explicitly pinned text
  // retain their existing precedence. No collision exemption is introduced.
  if(rank[j+4]==='point-label'&&!rank[j+2]&&!rank[j+3])for(const marker of markers.get(rank[j+5])??[])emit(marker);
  emit(i);
 }
 Object.freeze(indices);
 recent.unshift({rank,indices});if(recent.length>2)recent.pop();
 return indices;
}
