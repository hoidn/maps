import {anchorDistance} from './geometry.js';

/** Prepared required flags apply only to mandatory static names. Generic solver
 * callers without a configured limit retain their previous unconstrained policy. */
export function pointDisplacementLimit(annotation,policy={},fallback=Infinity) {
  const maximum=policy.maxPointDisplacement??fallback;
  return annotation.required?maximum:Math.min(maximum,policy.maxOptionalPointDisplacement??maximum);
}

/** Measurement padding is collision reserve, not painted ink near the feature.
 * Both ordinary and wrapped footprints use the same CSS-pixel convention. */
export function pointPaintDistance(shape,anchor) {
  const b=shape.bounds,inset=shape.paintInset??0;
  return anchorDistance(inset?{x:b.x+inset,y:b.y+inset,width:b.width-2*inset,height:b.height-2*inset}:b,anchor);
}
