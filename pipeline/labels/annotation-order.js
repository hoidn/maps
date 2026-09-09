// Only ranking metadata is cached. Geometry, eligibility, candidates and results
// remain specific to each solve. Two entries cover recurring fast/settled orders.
const recent=[];
export function annotationOrder(annotations){
 const rank=new Array(annotations.length*4);
 for(let i=0;i<annotations.length;i++){
  const a=annotations[i],j=i*4;
  rank[j]=a.id;rank[j+1]=a.priority??0;rank[j+2]=!!a.pinned;rank[j+3]=!!a.required;
 }
 const found=recent.findIndex(c=>c.rank.length===rank.length&&c.rank.every((value,i)=>Object.is(value,rank[i])));
 if(found>=0){const [cached]=recent.splice(found,1);recent.unshift(cached);return cached.indices;}
 const indices=Object.freeze(Array.from({length:annotations.length},(_,i)=>i).sort((i,j)=>{
  const a=i*4,b=j*4;
  return Number(rank[b+2])-Number(rank[a+2])||Number(rank[b+3])-Number(rank[a+3])||rank[b+1]-rank[a+1]||(rank[a]<rank[b]?-1:rank[a]>rank[b]?1:0);
 }));
 recent.unshift({rank,indices});if(recent.length>2)recent.pop();
 return indices;
}
