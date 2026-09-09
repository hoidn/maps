// Independent audit bundle: imports reference geometry, never production layout code.
import {collectManagedInventory,checkManagedInventory} from '../tests/support/managed-map-adapter.js';
export function summarizeCoverage(data) {
  const visible=new Set(data.visible),eligible=new Set(data.outcomes.filter(o=>o.eligible).map(o=>o.id)),classes={};
  for(const a of data.manifest.annotations){const kinds=[a.kind];if(a.kind==='point-label'&&(a.priority??0)>=800)kinds.push('primary-point-label');
    for(const kind of kinds){const c=classes[kind]??={visible:0,total:0,eligible:0,visibleEligible:0};c.total++;if(visible.has(a.id))c.visible++;if(eligible.has(a.id)){c.eligible++;if(visible.has(a.id))c.visibleEligible++;}}
  }return classes;
}
export function checkSceneCoverage(data,scene) {
  const classes=summarizeCoverage(data);
  const failures=Object.entries(scene.minima??{}).filter(([kind,n])=>(classes[kind]?.visible??0)<n).map(([kind,minimum])=>({kind,minimum,visible:classes[kind]?.visible??0}));
  for(const rule of scene.fractions??[]){if((scene.viewportWidth??0)<(rule.minViewportWidth??0))continue;const c=classes[rule.kind],numerator=c?.visibleEligible??0,denominator=c?.eligible??0,fraction=denominator?numerator/denominator:0;if(fraction<rule.minimumFraction)failures.push({kind:rule.kind,minimumFraction:rule.minimumFraction,numerator,denominator,fraction});}
  return failures;
}
/** Check in-page and retain only compact findings. At most 64 examples per category;
 * exact counts remain separate. Full DOM geometry never accumulates across frames. */
export function collectCompactAudit({policy,scene={},exampleLimit=64}) {
  const data=collectManagedInventory(),checks=checkManagedInventory(data,policy),coverage=checkSceneCoverage(data,scene),counts={};
  for(const key of ['overlaps','clipped','unknown','missingRequired']){counts[key]=checks[key].length;checks[key]=checks[key].slice(0,exampleLimit);}
  delete checks.unresolved;
  return {viewBox:document.querySelector('#mapsvg').getAttribute('viewBox'),visible:data.visible.length,coverageByClass:summarizeCoverage(data),...checks,coverage,counts,fontStatus:data.fontStatus,fontFailures:data.fonts.filter(f=>f.status!=='loaded')};
}
