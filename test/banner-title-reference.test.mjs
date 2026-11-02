import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { resolveBannerTitleReference } from '../lib/banner-title-reference.mjs';

const image = async (left = '#674c32', right = '#e88f18') => sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="90"><rect width="200" height="90" fill="#fff8e5"/><rect x="10" y="15" width="80" height="60" fill="${left}"/><rect x="110" y="15" width="80" height="60" fill="${right}"/></svg>`)).png().toBuffer();
const inputs = async () => ({ references: [await image('#6699dd', '#ee88bb'), await image()], referenceRoles: ['reference-image', 'reference-copy'] });

test('explicit primary-title reference selects the actual second image and extracts cocoa/orange/cream sticker colours', async () => {
  const result = await resolveBannerTitleReference('主标参考图2的颜色和字效做修改，其它保留不变。副标文字要跟着底板的倾斜做调整。', await inputs());
  assert.equal(result.referenceIndex, 2);
  assert.deepEqual(result.palette.lines[0], { top: '#674c32', middle: '#674c32', bottom: '#674c32' });
  assert.deepEqual(result.palette.lines[1], { top: '#e88f18', middle: '#e88f18', bottom: '#e88f18' });
  assert.equal(result.palette.outerRim, '#fff8e5');
  assert.equal(result.palette.outerEdge, '#e88f18');
  assert.equal(result.palette.finish, 'sticker');
  assert.ok(result.confidence >= .8);
  assert.equal((await resolveBannerTitleReference('参考图2的配色修改主标', await inputs())).referenceIndex, 2);
});

test('generic requests, unavailable indices, ambiguous references and unsupported cool references produce no palette', async () => {
  const data = await inputs();
  for (const prompt of ['主标按参考图修改颜色', '参考图2的整体风格做一张banner', '主标参考图8的配色', '主标参考图1和图2的颜色', '主标参考图1的颜色', '主标不要参考图2的颜色', '不要参考图2的配色修改主标']) {
    assert.equal(await resolveBannerTitleReference(prompt, data), null, prompt);
  }
});

test('internal backgrounds and characters do not consume reference numbers or become implicit colour references', async () => {
  const palette = await image(), blue = await image('#6699dd', '#ee88bb');
  assert.equal(await resolveBannerTitleReference('主标参考图1的颜色', { references: [palette], referenceRoles: ['background'] }), null);
  const result = await resolveBannerTitleReference('主标参考图二的配色', { references: [palette, blue, palette], referenceRoles: ['background', 'reference-image', 'reference-tone'] });
  assert.equal(result.referenceIndex, 2);
  assert.equal(result.palette.lines[0].middle, '#674c32');
});

test('a subtitle-only reference cannot recolour the title, and paper-only or unreadable assets are unsupported', async () => {
  const data = await inputs();
  assert.equal(await resolveBannerTitleReference('主标保留不变，副标参考图2的颜色和字效', data), null);
  const paper = await sharp({ create: { width: 50, height: 50, channels: 4, background: '#f4dfb6' } }).png().toBuffer();
  assert.equal(await resolveBannerTitleReference('主标参考图1的配色', { references: [paper] }), null);
  assert.equal(await resolveBannerTitleReference('主标参考图1的颜色', { references: [Buffer.from('not an image')] }), null);
});
