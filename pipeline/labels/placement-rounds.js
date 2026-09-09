export const PLACEMENT_ROUNDS=[{name:'primary',minimum:800},{name:'context',minimum:700},{name:'detail',minimum:-Infinity}];
const TEXT_KINDS=new Set(['point-label','line-label','region-label','edge-pointer']);
/** Temporary preparation order only; the final round includes every eligible
 * annotation. Previously accepted pan placements never disappear between rounds. */
export function roundEligibility(annotation,round,retained=false){
 if(round&&!retained&&TEXT_KINDS.has(annotation.kind)&&(annotation.textImportance??annotation.priority??0)<round.minimum)return 'round-deferred';
}
