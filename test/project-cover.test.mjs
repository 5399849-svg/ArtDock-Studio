import test from 'node:test';
import assert from 'node:assert/strict';
import {projectCoverCandidates,mountProjectCover} from '../public/project-cover.js';

test('project identity uses its logo instead of the first character or source file',()=>{
 const assets=[{url:'/boy.png',name:'人物.png',mime:'image/png',role:'character'},{url:'/brand.png',name:'横版黑色.png',mime:'image/png',role:'logo'}];
 const candidates=projectCoverCandidates({id:'p'},assets);
 assert.equal(candidates[0].url,'/brand.png');assert.equal(candidates[0].kind,'logo');
 assert.equal(candidates[1].url,'/boy.png');
});
test('font and Photoshop assets cannot become image previews even with an incorrect image MIME',()=>{
 const candidates=projectCoverCandidates({id:'p'},[{url:'/font.ttf',name:'字魂字体.ttf',mime:'image/png'},{url:'/source.psb',name:'原稿.psb',mime:'image/vnd.adobe.photoshop'},{url:'/poster.png',mime:'image/png'}]);
 assert.deepEqual(candidates.map(row=>row.url),['/poster.png']);
});
test('project and linked brand logo choices exclude IP copyright marks and duplicate URLs',()=>{
 const logo={url:'/own.png',name:'LOGO白底-材质版.png',mime:'image/png'};
 const candidates=projectCoverCandidates({id:'p',brandId:'b',assets:[logo]},[logo,{url:'/other.png',name:'logo.png',mime:'image/png'}],[{id:'b',assets:[{url:'/copyright.png',name:'IP标识.png',mime:'image/png'},{url:'/brand.png',name:'游戏logo.png',mime:'image/png'}]}]);
 assert.deepEqual(candidates.filter(row=>row.kind==='logo').map(row=>row.url),['/own.png','/brand.png','/other.png']);
});
test('unfiled projects use artwork and skip unrelated logo identities',()=>{
 const candidates=projectCoverCandidates({id:'unfiled'},[{url:'/logo.png',name:'logo.png',role:'logo',mime:'image/png'},{url:'/poster.jpg',kind:'成品',mime:'image/jpeg'}]);
 assert.equal(candidates[0].url,'/poster.jpg');assert(candidates.every(row=>row.kind==='image'));
});
test('declared logo libraries accept descriptive filenames and preserve white logo contrast',()=>{
 const candidates=projectCoverCandidates({id:'p',libraryLogos:[{url:'/white.png',name:'横版白色.png',mime:'image/png'}]},[]);
 assert.equal(candidates[0].kind,'logo');assert.equal(candidates[0].theme,'dark');
});
test('a failed logo preload falls back to a valid artwork without exposing a broken image',async()=>{
 const appended=[],element={isConnected:true,dataset:{},replaceChildren:image=>appended.push(image.src)};
 class ImageStub{set src(value){this.value=value;queueMicrotask(()=>{if(value==='/broken.png')this.onerror();else{this.naturalWidth=100;this.naturalHeight=50;this.onload()}})}get src(){return this.value}}
 const result=await mountProjectCover(element,[{url:'/broken.png',kind:'logo',theme:'light'},{url:'/good.png',kind:'image',theme:'light'}],{ImageClass:ImageStub});
 assert.equal(result.url,'/good.png');assert.deepEqual(appended,['/good.png']);assert.equal(element.dataset.coverKind,'image');
});
