const TEXT_KINDS=new Set(['point-label','line-label','region-label','edge-pointer']);
/** Data-backed text selection; physical geometry and symbols use their own gates. */
export function textEligibility(annotation,metersPerPixel){
 if(!TEXT_KINDS.has(annotation.kind))return;
 const limit=annotation.textMaxMetersPerPixel;
 if(Number.isFinite(limit)&&limit>0&&Number.isFinite(metersPerPixel)&&metersPerPixel>limit)return 'below-text-importance';
}
