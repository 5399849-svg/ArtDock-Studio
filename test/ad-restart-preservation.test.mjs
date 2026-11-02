import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {createAdAiGroupJobs} from '../lib/ad-ai-edit-group-jobs.mjs';
import {assessAdAiReferenceUse} from '../lib/ad-ai-reference-guard.mjs';
test('restart revalidation without content changes preserves timestamps and does not rewrite task storage',async t=>{
 const storageDir=await fs.mkdtemp(path.join(os.tmpdir(),'ad-restart-preserve-'));t.after(()=>fs.rm(storageDir,{recursive:true,force:true}));
 const buffer=await sharp({create:{width:100,height:160,channels:3,background:'#7359ed'}}).png().toBuffer(),workDir=path.join(storageDir,'ad-resources-batch','ai-edit','job'),refDir=path.join(storageDir,'ad-resources-batch','ai-reference');await fs.mkdir(workDir,{recursive:true});await fs.mkdir(refDir,{recursive:true});
 await fs.writeFile(path.join(workDir,'input.png'),buffer);await fs.writeFile(path.join(workDir,'result.png'),buffer);await fs.writeFile(path.join(refDir,'reference-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.png'),buffer);
 const ref={id:'abc',storageName:'reference-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.png',url:'/storage/ad-resources-batch/ai-reference/reference-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.png',sha256:createHash('sha256').update(buffer).digest('hex')};
 const job={id:'job',groupId:'job',status:'awaiting_review',updatedAt:'2026-10-01T00:00:00.000Z',members:[{specId:'a',jobId:'job'},{specId:'b',jobId:'child'}],referenceImages:[ref],referenceAssessment:await assessAdAiReferenceUse(buffer,buffer,[buffer])},batch={id:'batch',items:{a:{aiEditJob:job},b:{aiEditJob:{id:'child',status:job.status,groupId:job.groupId,updatedAt:job.updatedAt}}}};
 const before=structuredClone(batch);let saves=0;const service=createAdAiGroupJobs({storageDir,batches:[batch],save:async()=>saves++});await service.restore();assert.deepEqual(batch,before);assert.equal(saves,0);
});
