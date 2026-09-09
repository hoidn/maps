/** A complete failed domain stays infeasible while accepted placements only grow.
 * The controller owns the unchanged camera/font/control token. Never persist this
 * cache beyond that token or infer failure from an unprepared annotation. */
export const REUSABLE_FAILURES=new Set(['collision','repeat-spacing','feature-distance','no-valid-candidate']);
export class RoundFailures {
 constructor(){this.entries=new Map();}
 has(id){return this.entries.has(id);}
 get(id){return this.entries.get(id);}
 capture(annotations,result){
  const outcomes=new Map(result.outcomes.map(o=>[o.id,o]));
  for(const annotation of annotations){
   if(annotation.required||annotation.eligibleReason||annotation.metricError||annotation.cachedFailure)continue;
   const outcome=outcomes.get(annotation.id);
   if(!outcome||!REUSABLE_FAILURES.has(outcome.reason))continue;
   this.entries.set(annotation.id,{...outcome,blockerIds:[...outcome.blockerIds]});
  }
 }
}
