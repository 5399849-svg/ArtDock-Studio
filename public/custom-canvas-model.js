export const customCanvasSegment='custom-canvas';
export function canvasRatio(width,height){const gcd=(a,b)=>b?gcd(b,a%b):a,d=gcd(width,height);return `${width/d}:${height/d}`;}
export function customCanvasSpec(value){
 const width=Number(value?.width),height=Number(value?.height),format=String(value?.format||'PNG').toUpperCase();
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<64||height<64||width>8192||height>8192)throw Error('宽高请填写 64–8192 之间的整数像素');
 if(width*height>32_000_000)throw Error('画布总像素不能超过 3200 万，请适当减小宽高');
 if(!['PNG','JPG'].includes(format))throw Error('导出格式请选择 PNG 或 JPG');
 return {width,height,format};
}
export function customCanvasTemplate(value){
 const spec=customCanvasSpec(value),portrait=spec.width<spec.height;
 return {...spec,id:`custom-canvas-${spec.width}x${spec.height}-${spec.format.toLowerCase()}`,name:'自定义画布',maxBytes:64*1048576,
  customCanvas:true,communityPlacement:true,communityMaster:true,businessLineId:'platform-community',segmentId:customCanvasSegment,categoryId:customCanvasSegment,
  family:'自定义尺寸',renderMode:'layered-community',brandLogo:true,ipCopyright:true,safeArea:{left:.03,top:.03,right:.03,bottom:.03},
  communityLayout:portrait?{title:[.06,.08,.88,.23],subtitle:[.07,.31,.86,.1],character:[.15,.3,.76,.66],foreground:[0,.8,1,.2],logo:[.04,.03,.22,.12],copyright:[.65,.95,.3,.025]}:{title:[.045,.15,.53,.43],subtitle:[.055,.58,.49,.2],character:[.56,.02,.42,.94],foreground:[0,.79,1,.21],logo:[.03,.025,.16,.16],copyright:[.76,.91,.21,.06]}};
}
export const isCustomCanvasTask=task=>Boolean(task?.customCanvas);
export function registerCustomCanvas(task,templateMap){if(!isCustomCanvasTask(task))return null;const template=customCanvasTemplate(task.customCanvas);if(task.masterTemplateId!==template.id||task.targetTemplateIds?.length!==1||task.targetTemplateIds[0]!==template.id)throw Error('自定义画布与任务尺寸不一致');templateMap.set(template.id,template);return template;}
