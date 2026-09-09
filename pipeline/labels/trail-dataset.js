/** Worker transport for one immutable source-space trail dataset at a time.
 * Camera values remain in every message. Replacing source geometry requires a
 * new segments array; worker restart discards both sides of this cache. */
export function packTrailDataset(payload,previous=null) {
 if(!payload.trail)return {payload,state:previous};
 const {segments,...camera}=payload.trail;
 if(!Array.isArray(segments))throw new Error('Missing trail segments');
 const shared=previous?.segments===segments;
 const state=shared?previous:{segments,version:(previous?.version??0)+1};
 return {payload:{...payload,trail:{...camera,datasetVersion:state.version,...(!shared?{segments}:{})}},state};
}

/** The receiver rejects an unknown reference instead of silently omitting trails. */
export function unpackTrailDataset(payload,previous=null) {
 if(!payload.trail)return {payload,state:previous};
 const trail=payload.trail;
 if(!Number.isSafeInteger(trail.datasetVersion)||trail.datasetVersion<1)throw new Error('Invalid trail dataset version');
 let state=previous;
 if(Array.isArray(trail.segments))state={segments:trail.segments,version:trail.datasetVersion};
 if(!state||state.version!==trail.datasetVersion)throw new Error('Missing trail dataset');
 return {payload:{...payload,trail:{...trail,segments:state.segments}},state};
}
