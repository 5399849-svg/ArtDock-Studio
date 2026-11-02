import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import sharp from 'sharp';
import {readCompanyFontCatalog,readCompanyFontLibrary,readCompanyFontBytes} from '../lib/company-font-library.mjs';
import {renderCommunityFontText} from '../lib/community-material-font.mjs';
import {useLocalPython,withoutLocalPython} from './helpers/local-python.mjs';

// 字形由 Python 生成：本机有 local-ai/.venv 就直接用它跑，没有就跳过（平台上这一步在使用者的浏览器里算）。
useLocalPython();
test('both Source Han fonts have verified local files, retained OFL licenses, and distinct real glyph rendering',{skip:withoutLocalPython},async()=>{
 const library=await readCompanyFontLibrary(),catalog=await readCompanyFontCatalog(),rendered=[];
 for(const name of ['思源宋体','思源黑体']){
  const font=library.fonts.find(f=>f.name===name);assert.ok(font,name);assert.equal(font.license,'OFL-1.1');assert.equal(font.evidenceStatus,'open-source-license-recorded');
  const file=await readCompanyFontBytes(font.id);assert.ok(file.bytes.length>1_000_000);const record=catalog.fonts.find(f=>f.id===font.id);assert.match(await fs.readFile('data/fonts/company-library/'+record.licenseFile,'utf8'),/SIL OPEN FONT LICENSE Version 1.1/);
  const result=await renderCommunityFontText({copy:'霜降祝福 每日好礼 ©YUEWEN',parameters:{communityMaterialFontIds:{title:font.id}}},'title');const meta=await sharp(result.buffer).metadata();assert.equal(meta.format,'png');assert.equal(meta.hasAlpha,true);assert.equal(result.font.id,font.id);rendered.push(result.buffer);
 }
 assert.notDeepEqual(rendered[0],rendered[1]);
});
