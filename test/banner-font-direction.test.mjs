import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseBannerFont,bannerTypographyTheme} from '../public/banner-font-direction.js';
const fonts=[{id:'regular',name:'字魂大黑-Regular',style:'常规体'},{id:'heavy',name:'字魂大黑-Heavy',style:'黑体'},{id:'bean',name:'字魂甜豆体',style:'Regular'},{id:'sword',name:'字魂仙剑奇侠体',style:'Regular'}];
test('a previous automatic regular font cannot silently dominate a playful character project',()=>{
  const task={project:'微距猜谜banner',parameters:{titleFontId:'regular'},communityGeneration:{mode:'design',titleFont:fonts[0]}};
  assert.equal(chooseBannerFont({fonts,task}).font.id,'bean');
});
test('manual and project recommendations remain authoritative; edits preserve the actual glyph',()=>{
  assert.equal(chooseBannerFont({fonts,task:{parameters:{titleFontId:'regular',titleFontSource:'manual'}},direction:'Q版可爱'}).font.id,'regular');
  assert.equal(chooseBannerFont({fonts,project:{recommendedFontIds:['sword']},direction:'Q版'}).font.id,'sword');
  assert.equal(chooseBannerFont({fonts,task:{parameters:{titleFontId:'regular'},communityGeneration:{mode:'design',titleFont:fonts[0]}},preserveSelected:true,direction:'Q版'}).font.id,'regular');
});
test('subtitle stays conventional, titles have themed glyph selection and generic titles use real display weight',()=>{
  assert.equal(chooseBannerFont({fonts,kind:'subtitle',direction:'可爱Q版'}).font.id,'regular');
  assert.equal(chooseBannerFont({fonts,direction:'仙侠书法'}).font.id,'sword');
  assert.equal(chooseBannerFont({fonts}).font.id,'heavy');
  assert.equal(bannerTypographyTheme({project:'微距猜谜banner'},{},'古风书法'),'calligraphic');
});
