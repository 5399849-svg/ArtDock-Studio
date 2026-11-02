import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Readable} from 'node:stream';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
import {channelOutpaintGaps,extractChromaTypography,normalizeChannelDraft,optimizeChannelCandidate} from '../lib/channel-editor-ops.mjs';
import {createChannelResourcesHandler} from '../lib/channel-resources-server.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
function request(handler,method,pathname,body){const req=Readable.from(body?[Buffer.from(JSON.stringify(body))]:[]);req.method=method;let code=0,buffer='';const res={writeHead(status){code=status},end(chunk){buffer=Buffer.isBuffer(chunk)?chunk.toString():String(chunk||'')}};return handler(req,res,new URL(pathname,'http://localhost')).then(()=>({code,body:JSON.parse(buffer)}))}
async function waitJob(handler,itemId,jobId){for(let i=0;i<100;i++){const response=await request(handler,'GET',`/api/channel-resources/items/${itemId}/jobs/${jobId}`);if(response.body.status!=='running')return response.body;await new Promise(resolve=>setTimeout(resolve,20))}throw Error('job timeout')}

test('per-item draft, style candidate, and background outpaint retain separate versions',async()=>{
  const runtimeDir=await fs.mkdtemp(path.join(os.tmpdir(),'channel-editor-'));
  const storageDir=path.join(runtimeDir,'storage');
  const rulesDir=path.join(runtimeDir,'channel-analysis','huawei-current');
  await fs.mkdir(rulesDir,{recursive:true});await fs.mkdir(storageDir,{recursive:true});
  await fs.copyFile(path.join(root,'data','runtime','channel-analysis','huawei-current','华为资源位规则清单.csv'),path.join(rulesDir,'华为资源位规则清单.csv'));
  let copyCalls=0,outpaintCalls=0;
  const handle=await createChannelResourcesHandler({root,runtimeDir,storageDir,generateImage:async body=>{
    if(body.model==='banana_pro'){
      copyCalls++;
      const art=Buffer.from('<svg width="600" height="200"><rect width="600" height="200" fill="#00ff00"/><rect x="100" y="50" width="400" height="100" fill="#fff7d6"/></svg>');
      return sharp(art).png().toBuffer();
    }
    outpaintCalls++;
    const input=Buffer.from(body.images[0].data_base64,'base64'),metadata=await sharp(input).metadata();
    return sharp({create:{width:metadata.width+body.left+body.right,height:metadata.height+body.top+body.bottom,channels:3,background:'#8293a8'}}).png().toBuffer();
  }});
  const manual=await request(handle,'POST','/api/channel-resources/manual',{channel:'oppo',project:'测试',resource:'Banner',size:'400x200',quantity:2,format:'JPG'});
  const listed=await request(handle,'GET','/api/channel-resources');const batch=listed.body.batches.find(b=>b.id===manual.body.id);const [one,two]=batch.items;
  const input=await sharp({create:{width:400,height:200,channels:3,background:'#aa927e'}}).jpeg().toBuffer();
  await request(handle,'POST',`/api/channel-resources/items/${one.id}/versions`,{dataUrl:`data:image/jpeg;base64,${input.toString('base64')}`});
  const reference=await sharp({create:{width:600,height:200,channels:3,background:'#47392f'}}).png().toBuffer();
  const uploaded=await request(handle,'POST',`/api/channel-resources/items/${one.id}/editor-asset`,{kind:'reference',name:'字效.png',dataUrl:`data:image/png;base64,${reference.toString('base64')}`});
  assert.equal(uploaded.code,201);
  const clean=await request(handle,'POST',`/api/channel-resources/items/${one.id}/editor-asset`,{kind:'clean-background',name:'无字底图.jpg',dataUrl:`data:image/jpeg;base64,${input.toString('base64')}`});
  assert.equal(clean.code,201);
  const saved=await request(handle,'PUT',`/api/channel-resources/items/${one.id}/editor-draft`,{targetText:'武魂觉醒今日开战！',backgroundUrl:'',layers:[{id:'copy-one',type:'text',text:'准确文案',x:40,y:60,width:300,fontSize:32,color:'#ffffff'}]});
  assert.equal(saved.body.editor.layers[0].text,'准确文案');
  assert.equal(saved.body.editor.targetText,'武魂觉醒今日开战！');
  const copy=await request(handle,'POST',`/api/channel-resources/items/${one.id}/generate-copy`,{targetText:'武魂觉醒今日开战！'});
  assert.equal(copy.code,202);assert.equal((await waitJob(handle,one.id,copy.body.jobId)).status,'done');assert.equal(copyCalls,1);
  const afterCopy=await request(handle,'GET','/api/channel-resources');const copyItem=afterCopy.body.batches.find(b=>b.id===batch.id).items[0];
  assert.equal(copyItem.editor.copyCandidates.length,1);assert.ok(copyItem.editor.copyCandidates.every(c=>c.layerUrl));
  assert.equal(copyItem.editor.cleanBackgroundUrl,clean.body.asset.url);
  const background=await request(handle,'POST',`/api/channel-resources/items/${one.id}/outpaint`,{sourceUrl:copyItem.versions[0].url,occupancy:80,prompt:'延续暖色背景'});
  assert.equal(background.code,202);assert.equal((await waitJob(handle,one.id,background.body.jobId)).status,'done');assert.equal(outpaintCalls,1);
  const finished=await request(handle,'GET','/api/channel-resources');const updated=finished.body.batches.find(b=>b.id===batch.id).items;
  assert.equal(updated[0].editor.outpaintCandidates.length,1);assert.deepEqual(updated[1].editor.layers,[]);
  const outUrl=updated[0].editor.outpaintCandidates[0].url;
  const outFile=path.join(storageDir,`channel-resources-${batch.id}`,'editor',decodeURIComponent(outUrl.split('/').at(-1)));
  assert.deepEqual(await sharp(outFile).metadata().then(({width,height})=>[width,height]),[400,200]);
  await assert.rejects(()=>request(handle,'PUT',`/api/channel-resources/items/${two.id}/editor-draft`,{layers:[{id:'stolen',type:'image',url:outUrl}]}),/不属于当前交付稿/);
});

test('channel editor helper validates background and extracts only true chroma images',async()=>{
  assert.deepEqual(channelOutpaintGaps(400,200,400,200,80),{left:50,top:25,right:50,bottom:25,width:500,height:250});
  assert.throws(()=>normalizeChannelDraft({backgroundUrl:'/storage/foreign.png'}, {width:400,height:200},[]),/不属于当前交付稿/);
  const opaque=await sharp({create:{width:40,height:20,channels:3,background:'#ffffff'}}).png().toBuffer();
  assert.equal((await extractChromaTypography(opaque)).buffer,null);
  const whiteTitle=await sharp(Buffer.from('<svg width="300" height="120"><rect width="300" height="120" fill="white"/><text x="40" y="82" fill="#b7864c" stroke="#663c2c" stroke-width="2" font-size="55">测试</text></svg>')).png().toBuffer();
  const whiteExtract=await extractChromaTypography(whiteTitle);
  assert.ok(whiteExtract.buffer);
  const alpha=await sharp(whiteExtract.buffer).ensureAlpha().raw().toBuffer();
  assert.ok(alpha.some((value,index)=>index%4===3&&value===0));
  const unoptimized=await sharp({create:{width:300,height:200,channels:3,background:'#b3a699'}}).png({compressionLevel:0}).toBuffer();
  const optimized=await optimizeChannelCandidate(unoptimized,{format:'PNG',maxBytes:unoptimized.length/2});
  assert.ok(optimized.length<unoptimized.length/2);
  assert.deepEqual(await sharp(optimized).raw().toBuffer(),await sharp(unoptimized).raw().toBuffer());
});
