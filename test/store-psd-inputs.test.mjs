import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {resolvePsdInputs} from '../lib/store-psd-inputs.mjs';
test('文件夹自动识别横竖PSD，支持留空竖版，拒绝重复及目录外路径',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'psd-inputs-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const l=path.join(root,'素材-横版.psd'),p=path.join(root,'素材-竖版.psd');await fs.writeFile(l,'test');await fs.writeFile(p,'test');
 assert.deepEqual(await resolvePsdInputs(root,{landscape:root}),{landscape:await fs.realpath(l),portrait:await fs.realpath(p)});
 assert.deepEqual(await resolvePsdInputs(root,{landscape:root,portrait:root}),await resolvePsdInputs(root,{folder:root}));
 await assert.rejects(resolvePsdInputs(root,{landscape:l,portrait:l}),/不能使用同一份/);
 await fs.writeFile(path.join(root,'另一份横版.psd'),'test');await assert.rejects(resolvePsdInputs(root,{folder:root}),/无法唯一识别/);
 await assert.rejects(resolvePsdInputs(root,{folder:path.dirname(root)}),/项目目录内/);
});
