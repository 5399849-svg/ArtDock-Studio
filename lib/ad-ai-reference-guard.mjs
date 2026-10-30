import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {readAdAiReferenceBuffers} from './ad-ai-references.mjs';

export const AD_AI_LAYOUT_REFERENCE_METHOD='layout-guide-v1';
export const AD_AI_REFERENCE_GUARD_METHOD='reference-copy-check-v1';
export const AD_AI_REFERENCE_REJECTION='AI 结果误用了参考图内容，已拦截本次候选；当前人物、文案和原稿均已保留。请重新提交修改要求。';

// Send a coarse monochrome layout guide rather than another character's finished
// artwork. Small copy, faces, costume detail and original reference colours never
// enter a new layout-edit request. Original uploads remain intact for the UI.
export async function buildAdAiLayoutReference(buffer,index){
  const coarse=await sharp(buffer).rotate().flatten({background:'#fff'}).greyscale().resize({width:28,height:42,fit:'inside',withoutEnlargement:false}).blur(1.2).png().toBuffer();
  const guide=await sharp(coarse).resize({width:392,height:588,fit:'inside'}).png().toBuffer({resolveWithObject:true});
  const width=guide.info.width,height=guide.info.height,label=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="44"><rect width="100%" height="100%" fill="#eee"/><text x="10" y="18" font-family="sans-serif" font-size="11" fill="#333">LAYOUT REFERENCE ${index+1} ONLY</text><text x="10" y="35" font-family="sans-serif" font-size="10" fill="#555">KEEP IMAGE 1 CONTENT AND COLOURS</text></svg>`);
  return sharp({create:{width,height:height+44,channels:3,background:'#eee'}}).composite([{input:label,top:0,left:0},{input:guide.data,top:44,left:0}]).png().toBuffer();
}

const sample=buffer=>sharp(buffer).rotate().flatten({background:'#fff'}).toColourspace('srgb').removeAlpha().resize(96,96,{fit:'fill'}).raw().toBuffer();
function similarity(a,b){
  let distance=0,meanA=0,meanB=0;for(let i=0;i<a.length;i++){distance+=Math.abs(a[i]-b[i]);meanA+=a[i];meanB+=b[i];}meanA/=a.length;meanB/=b.length;
  let varianceA=0,varianceB=0,covariance=0;for(let i=0;i<a.length;i++){varianceA+=(a[i]-meanA)**2;varianceB+=(b[i]-meanB)**2;covariance+=(a[i]-meanA)*(b[i]-meanB);}
  const denominator=Math.sqrt(varianceA*varianceB);
  return {distance:distance/a.length/255,correlation:denominator>1?covariance/denominator:distance/a.length<1?1:0};
}

// This is a conservative copy detector, not a semantic identity score. Compare
// against both the saved draft and its own original; legitimate same-content
// references must not be rejected simply for matching a requested layout.
export async function assessAdAiReferenceUse(source,result,references,{original}={}){
  const [sourcePixels,resultPixels,originalPixels,...referencePixels]=await Promise.all([sample(source),sample(result),original?sample(original):null,...references.map(sample)]);
  const sourceScores=[similarity(sourcePixels,resultPixels),...(originalPixels?[similarity(originalPixels,resultPixels)]:[])];
  const nearestSource=sourceScores.reduce((a,b)=>a.distance<=b.distance?a:b);
  const matches=referencePixels.map((pixels,index)=>{
    const candidate=similarity(pixels,resultPixels),source=similarity(pixels,sourcePixels),ownOriginal=originalPixels?similarity(pixels,originalPixels):null;
    const distinct=source.distance>.075&&source.correlation<.92&&(!ownOriginal||ownOriginal.distance>.075&&ownOriginal.correlation<.92);
    const copied=distinct&&candidate.distance<.12&&candidate.correlation>.88&&candidate.distance<nearestSource.distance*.65&&nearestSource.distance-candidate.distance>.045;
    return {reference:index+1,candidate,source,...(ownOriginal?{original:ownOriginal}:{}),copied};
  });
  return {method:AD_AI_REFERENCE_GUARD_METHOD,consistent:!matches.some(match=>match.copied),nearestSource,matches};
}

export async function validateAdAiReferenceResult({storageDir,batch,job,workDir,generated,update}){
  if(!job.referenceImages?.length)return;
  let assessment;
  try{
    const source=await fs.readFile(path.join(workDir,'input.png')),result=generated||await fs.readFile(path.join(workDir,'result.png'));
    let original;try{original=await fs.readFile(path.join(workDir,'original-reference.png'));}catch(error){if(error.code!=='ENOENT')throw error;}
    const references=await readAdAiReferenceBuffers({storageDir,batch,job});
    assessment=await assessAdAiReferenceUse(source,result,references,{original});
  }catch(error){throw Object.assign(Error('修改参考图核验未完成，候选未开放采用，原稿已保留：'+error.message),{editStatus:'needs_revision'});}
  await update({referenceAssessment:assessment});
  if(!assessment.consistent)throw Object.assign(Error(AD_AI_REFERENCE_REJECTION),{editStatus:'needs_revision'});
}
