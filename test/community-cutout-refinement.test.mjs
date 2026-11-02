import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
test('edge refinement cannot grow a subject into a similarly colored background or fill large interior gaps',async t=>{
 const root=fileURLToPath(new URL('..',import.meta.url)),python=path.join(root,'local-ai/.venv/Scripts/python.exe');try{await fs.access(python);}catch{t.skip('Local OpenCV runtime is not installed');return;}
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'cutout-edge-band-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const source=await sharp({create:{width:400,height:240,channels:3,background:'#d7ae65'}}).png().toBuffer();
 const mask=await sharp(Buffer.from('<svg width="400" height="240"><path d="M120 40H300V220H120Z M180 110a20 20 0 1 0 40 0a20 20 0 1 0 -40 0" fill="white" fill-rule="evenodd"/></svg>')).png().toBuffer();
 await fs.writeFile(path.join(dir,'source.png'),source);await fs.writeFile(path.join(dir,'mask.png'),mask);await fs.writeFile(path.join(dir,'prompts.json'),JSON.stringify({objects:[{box:[0,0,400,240],points:[[160,60],[160,190],[200,110]],labels:[1,1,0]}]}));
 await promisify(execFile)(python,[path.join(root,'scripts/refine-community-cutout.py'),'--input',path.join(dir,'source.png'),'--mask',path.join(dir,'mask.png'),'--prompts',path.join(dir,'prompts.json'),'--output',path.join(dir,'result.png')],{windowsHide:true,timeout:30000});
 const result=await sharp(path.join(dir,'result.png')).ensureAlpha().raw().toBuffer(),alpha=(x,y)=>result[(y*400+x)*4+3];assert.equal(alpha(20,100),0);assert.equal(alpha(350,100),0);assert.equal(alpha(200,110),0);assert.equal(alpha(210,110),0);assert.equal(alpha(160,100),255);
 for(let y=0;y<240;y++)for(let x=0;x<400;x++)if(alpha(x,y)>16){assert.ok(x>=115&&x<=304&&y>=35&&y<=224);const p=(y*400+x)*4;assert.deepEqual([...result.subarray(p,p+3)],[215,174,101]);}
});
