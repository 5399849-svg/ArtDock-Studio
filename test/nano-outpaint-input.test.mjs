import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import {prepareNanoOutpaintInput,assertNanoBlankFilled} from "../lib/nano-outpaint-input.mjs";
import {protectedComposition} from "../public/outpaint-composite.js";
test("Nano输入显式预留偏心55%构图的空白，保持比例并覆盖目标画布",async()=>{
  const source=await sharp({create:{width:1920,height:1080,channels:3,background:"#f02731"}}).png().toBuffer();
  const placement={scale:55,focalX:72.29562345169283,focalY:2.594477726228547};
  const result=await prepareNanoOutpaintInput(source,1920,550,placement);
  await assert.rejects(assertNanoBlankFilled(result.buffer,result.sourceRect),/未填补/);
  assert.ok(result.sourceRect.width<.6);
  assert.ok(result.sourceRect.x>0);
  assert.equal(protectedComposition(1920,550,1920,1080,placement,result.sourceRect).covered,true);
  const meta=await sharp(result.buffer).metadata();
  assert.ok(meta.width<=2048&&meta.height<=2048);
  const center=await sharp(result.buffer).extract({left:Math.round((result.sourceRect.x+result.sourceRect.width/2)*meta.width),top:Math.round((result.sourceRect.y+result.sourceRect.height/2)*meta.height),width:1,height:1}).removeAlpha().raw().toBuffer();
  assert.deepEqual([...center],[240,39,49]);
});

test("21:9 原图缩至 80% 后，模型放大原图并轻微偏移仍覆盖横幅",async()=>{
  const source=await sharp({create:{width:6336,height:2688,channels:3,background:"#e57496"}}).jpeg({quality:75}).toBuffer();
  const placement={scale:80,focalX:52.47729149463256,focalY:25.656501959371198};
  const input=await prepareNanoOutpaintInput(source,1920,550,placement);
  const rect=input.sourceRect;
  const observedDrift={x:rect.x-.005,y:rect.y-.005,width:rect.width*1.012,height:rect.height*1.012};
  assert.equal(protectedComposition(1920,550,6336,2688,placement,observedDrift).covered,true);
});
