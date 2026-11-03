import test from 'node:test';
import assert from 'node:assert/strict';
import { isRenderableImageAsset, preferredSourceAsset, loadEditorImages, editorImageEntries, loadEditorImageEntries, missingEditorImages } from '../public/editor-image-source.js';

const asset = (name, role = 'supplement', mime = 'image/png') => ({ name, role, mime, url: `/assets/${name}` });

test('Photoshop documents are retained as source files, never selected for browser decoding', async () => {
  const psb = asset('character.psb', 'master', 'image/vnd.adobe.photoshop');
  const png = asset('preview.png');
  const task = { assets: [psb, png], primaryAssetName: psb.name };
  const requested = [];
  const result = await loadEditorImages(task, async url => { requested.push(url); return { url }; });
  assert.equal(preferredSourceAsset(task), png);
  assert.deepEqual(requested, [png.url]);
  assert.equal(result.sourceAsset, png);
  assert.equal(isRenderableImageAsset(asset('source.psd', 'background', 'image/png')), false);
});

test('unreadable primary image falls back without blocking the editor', async () => {
  const broken = asset('broken.png', 'background');
  const fallback = asset('usable.webp', 'master', 'image/webp');
  const result = await loadEditorImages({ assets: [broken, fallback] }, async url => {
    if (url === broken.url) throw Error('decode failed');
    return { url };
  });
  assert.equal(result.sourceAsset, fallback);
  assert.equal(result.assetImages.has(broken.name), false);
});

test('Photoshop-only and empty tasks can enter an editor without a raster preview', async () => {
  for (const assets of [[], [asset('only.psb', 'master', 'image/vnd.adobe.photoshop')]]) {
    const result = await loadEditorImages({ assets }, () => { throw Error('must not load Photoshop'); });
    assert.equal(result.sourceImage, null);
    assert.equal(result.sourceAsset, null);
    assert.equal(result.assetImages.size, 0);
  }
});

test('explicit background and orientation precedence are preserved', () => {
  const landscape = asset('landscape.jpg', 'background-landscape', 'image/jpeg');
  const portrait = asset('portrait.jpg', 'background-portrait', 'image/jpeg');
  const task = { assets: [landscape, portrait], masterCanvasId: 'portrait-1080x1920' };
  assert.equal(preferredSourceAsset(task), portrait);
  assert.equal(preferredSourceAsset({ ...task, primaryAssetName: landscape.name }), landscape);
});

test('extracted character stays an independent layer and is never used as the background', async () => {
  const character = { ...asset('角色.png', 'character'), psdSourceHash: 'source-hash' };
  const result = await loadEditorImages({ assets: [character] }, async () => ({ naturalWidth: 100, naturalHeight: 200 }));
  assert.equal(result.sourceImage, null);
  assert.equal(result.sourceAsset, null);
  assert.ok(result.assetImages.has(character.name));
});

test('independent PNG exports load lazily unless explicitly used on a canvas', async () => {
  const background=asset('scene.png','background'),cutout={...asset('cutout.png','community-object-character'),objectRunId:'extract-1'};
  const requested=[];
  const first=await loadEditorImages({assets:[background,cutout]},async url=>{requested.push(url);return {url};});
  assert.deepEqual(requested,[background.url]);
  assert.equal(first.assetImages.has(cutout.name),false);
  const bound=await loadEditorImages({assets:[background,cutout],masterTemplateId:'master',parameters:{assetByTemplate:{master:{character:cutout.name}}}},async url=>({url}));
  assert.ok(bound.assetImages.has(cutout.name));
  assert.equal(bound.sourceAsset,background);
});

test('opening a task skips images the canvas never draws and keeps referenced ones', async () => {
  const background=asset('scene.png','background'),title=asset('title.png','title');
  const references=[asset('ref.png','reference-image'),asset('candidate.png','mother-candidate'),asset('preview.png','layered-preview'),asset('source.png','source-character'),asset('extra.png','supplement')];
  const chosen=asset('chosen.png','mother-candidate'),backing=asset('backing.png','supplement');
  const task={assets:[background,title,...references,chosen,backing],masterTemplateId:'master',targetTemplateIds:[],parameters:{
    assetByTemplate:{master:{background:chosen.name}},layoutByTemplate:{master:{'subtitle-backing':{backing:{assetName:backing.name}}}}}};
  const requested=[];
  const result=await loadEditorImages(task,async url=>{requested.push(url);return {url};},{templateId:'master'});
  await result.editorImagesLoading;
  assert.deepEqual(requested.sort(),[background.url,title.url,chosen.url,backing.url].sort());
});

test('other sizes load after the editor opens, and exports can wait for them', async () => {
  const background=asset('scene.png','background'),targetOnly=asset('target-bg.png','generated-background');
  const task={assets:[background,targetOnly],masterTemplateId:'master',targetTemplateIds:['wide'],parameters:{
    assetByTemplate:{master:{background:background.name},wide:{background:targetOnly.name}},backgroundByTemplate:{wide:{url:'/storage/outpaint-wide.png'}}}};
  let release;const gate=new Promise(resolve=>release=resolve);
  const result=await loadEditorImages(task,async url=>{if(url!==background.url)await gate;return {url};},{templateId:'master'});
  assert.ok(result.assetImages.has(background.name));
  assert.equal(result.assetImages.has(targetOnly.name),false);
  assert.deepEqual(missingEditorImages(result.assetImages,editorImageEntries(task,['wide'])).map(entry=>entry.key).sort(),['__outpaint_wide',targetOnly.name].sort());
  release();await result.editorImagesLoading;
  assert.ok(result.assetImages.has(targetOnly.name));
  assert.ok(result.assetImages.has('__outpaint_wide'));
});

test('community sizes that chose every element skip the other auto-pick candidates', async () => {
  const scene=asset('scene.png','mother-candidate'),chosen=asset('title-a.png','title'),spare=asset('title-b.png','title'),person=asset('person.png','character');
  const master={id:'master',communityPlacement:true,communityMaster:true,communityLayout:{character:[0,0,.5,1]}};
  const wide={id:'wide',communityPlacement:true,communityLayout:{character:[0,0,.5,1]}};
  const task={assets:[person,scene,chosen,spare],primaryAssetName:person.name,masterTemplateId:'master',targetTemplateIds:['wide'],masterTemplate:master,templates:[wide],
    parameters:{assetByTemplate:{master:{background:scene.name,title:chosen.name,character:null,character2:null},wide:{title:null,character:null,character2:null}}}};
  const requested=[];
  const result=await loadEditorImages(task,async url=>{requested.push(url);return {url};},{templateId:'master'});
  await result.editorImagesLoading;
  // person.png 是首选背景（扩图找不到背景时送它），照旧要下；没选用的主标 title-b 不下。
  assert.deepEqual(requested.sort(),[person.url,scene.url,chosen.url].sort());
  assert.equal(result.sourceAsset,person);
  delete task.parameters.assetByTemplate.wide.title;
  assert.ok(editorImageEntries(task,['wide']).some(entry=>entry.key===spare.name));
  assert.equal(editorImageEntries(task,['master']).some(entry=>entry.key===spare.name),false);
});

test('platform PSD sizes still load every auto-pick candidate', () => {
  const titles=[asset('a.png','title'),asset('b.png','title')];
  const task={assets:titles,masterTemplateId:'hero',templates:[{id:'hero'}],parameters:{assetByTemplate:{hero:{title:titles[0].name}}}};
  assert.deepEqual(editorImageEntries(task,['hero']).map(entry=>entry.key).sort(),['a.png','b.png']);
});

test('broken images are skipped once instead of being retried on every redraw', async () => {
  const broken=asset('broken.png','title'),images=new Map();let calls=0;
  const entries=editorImageEntries({assets:[broken]},[]);
  await loadEditorImageEntries(images,entries,async()=>{calls++;throw Error('decode failed');});
  await loadEditorImageEntries(images,entries,async()=>{calls++;throw Error('decode failed');});
  assert.equal(calls,1);
  assert.deepEqual(missingEditorImages(images,entries),[]);
});
