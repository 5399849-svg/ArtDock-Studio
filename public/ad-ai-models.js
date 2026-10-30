export const AD_AI_MODELS=Object.freeze([
  {id:'gpt-image-2',label:'GPT-Image2'},
  {id:'banana_pro',label:'Nano Banana Pro'}
]);
export const AD_AI_DEFAULT_MODEL='banana_pro';
export function adAiModel(value=AD_AI_DEFAULT_MODEL){
  if(!AD_AI_MODELS.some(model=>model.id===value))throw Object.assign(Error('请选择有效的改图模型'),{status:422});
  return value;
}
