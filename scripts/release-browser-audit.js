// Independent audit bundle: imports reference geometry, never production layout code.
import {collectManagedInventory,checkManagedInventory} from '../tests/support/managed-map-adapter.js';
import {collectTypography,checkTypography} from '../tests/support/typography-audit.js';
export function summarizeCoverage(data) {
  const visible=new Set(data.visible),eligible=new Set(data.outcomes.filter(o=>o.eligible).map(o=>o.id)),classes={};
  for(const a of data.manifest.annotations){const kinds=[a.kind];if(a.kind==='point-label'&&(a.priority??0)>=800)kinds.push('primary-point-label');
    for(const kind of kinds){const c=classes[kind]??={visible:0,total:0,eligible:0,visibleEligible:0};c.total++;if(visible.has(a.id))c.visible++;if(eligible.has(a.id)){c.eligible++;if(visible.has(a.id))c.visibleEligible++;}}
  }return classes;
}
export function summarizeDestinations(data,rule) {
  if(!rule)return null;
  const visible=new Set(data.visible),known=new Set(data.manifest.annotations.filter(a=>a.kind==='point-label').map(a=>a.id));
  const groups=rule.groups.map(g=>({id:g.id,required:!!g.required,visible:g.annotationIds.some(id=>known.has(id)&&visible.has(id))}));
  const summary=rows=>({numerator:rows.filter(g=>g.visible).length,denominator:rows.length,fraction:rows.length?rows.filter(g=>g.visible).length/rows.length:0,missing:rows.filter(g=>!g.visible).map(g=>g.id)});
  return {all:summary(groups),required:summary(groups.filter(g=>g.required)),groups};
}
export function checkSceneCoverage(data,scene) {
  const classes=summarizeCoverage(data);
  const failures=Object.entries(scene.minima??{}).filter(([kind,n])=>(classes[kind]?.visible??0)<n).map(([kind,minimum])=>({kind,minimum,visible:classes[kind]?.visible??0}));
  for(const rule of scene.fractions??[]){if((scene.viewportWidth??0)<(rule.minViewportWidth??0))continue;const c=classes[rule.kind],numerator=c?.visibleEligible??0,denominator=c?.eligible??0,fraction=denominator?numerator/denominator:0;if(fraction<rule.minimumFraction)failures.push({kind:rule.kind,minimumFraction:rule.minimumFraction,numerator,denominator,fraction});}
  if(scene.destinations&&(scene.viewportWidth??0)>=(scene.destinations.minViewportWidth??0)){
    const rule=scene.destinations,summary=summarizeDestinations(data,rule);
    for(const [kind,key,minimumFraction] of [['reviewed-destinations','all',rule.minimumFraction],['required-destinations','required',rule.requiredMinimumFraction]]){
      const value=summary[key];if((key==='all'||value.denominator)&&value.fraction<minimumFraction)failures.push({kind,minimumFraction,...value});
    }
  }
  return failures;
}
/** Check in-page and retain only compact findings. At most 64 examples per category;
 * exact counts remain separate. Full DOM geometry never accumulates across frames. */
export function collectCompactAudit({policy,scene={},exampleLimit=64}) {
  const data=collectManagedInventory(),checks=checkManagedInventory(data,policy),coverage=checkSceneCoverage(data,scene),counts={};checks.typography=checkTypography(collectTypography(),policy);
  for(const key of ['overlaps','clipped','unknown','missingRequired','typography']){counts[key]=checks[key].length;checks[key]=checks[key].slice(0,exampleLimit);}
  delete checks.unresolved;
  return {viewBox:document.querySelector('#mapsvg').getAttribute('viewBox'),visible:data.visible.length,coverageByClass:summarizeCoverage(data),destinationCoverage:summarizeDestinations(data,scene.destinations),...checks,coverage,counts,fontStatus:data.fontStatus,fontFailures:data.fonts.filter(f=>f.status!=='loaded')};
}
