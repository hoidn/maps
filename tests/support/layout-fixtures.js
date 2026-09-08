export function shape(x,y,width=20,height=10) {const r={x,y,width,height};return {bounds:r,parts:[r]};}
export function candidate(id,x,y,width=20,height=10,extra={}) {return {id,shape:shape(x,y,width,height),dx:0,dy:0,...extra};}
export function annotation(id,candidates,extra={}) {return {id,featureId:id,kind:'poi',priority:10,candidates,...extra};}
export function scene(annotations,obstacles=[]) {return {annotations,obstacles,viewport:{width:200,height:150},policy:{clearance:2,edgePadding:4}};}
export function impossibleRequiredScene() {return scene([annotation('required-stop',[candidate('only',20,20)],{required:true})],[{id:'control',kind:'control',shape:shape(10,10,60,60)}]);}
