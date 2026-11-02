import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { finishLicensedTitle } from '../lib/licensed-title-finish.mjs';

async function glyphMask() {
  return sharp(Buffer.from('<svg width="280" height="200" xmlns="http://www.w3.org/2000/svg"><path fill="white" fill-rule="evenodd" d="M35 25h200v55H35z M70 37v30h35V37z M35 118h200v55H35z M70 130v30h35v-30z"/></svg>')).png().toBuffer();
}
const raw = async buffer => sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const at = (image, x, y) => [...image.data.subarray((y * image.info.width + x) * 4, (y * image.info.width + x) * 4 + 4)];

test('licensed title retains a transparent canvas and counters, and adds actual layered warm/green face effects', async () => {
  const mask = await glyphMask(), result = await finishLicensedTitle({ mask });
  const image = await raw(result.buffer);
  assert.equal(image.info.width, 280); assert.equal(image.info.height, 200);
  assert.equal(at(image, 0, 0)[3], 0);
  assert.ok(at(image, 87, 52)[3] < 10, 'Upper counter centre must remain transparent');
  assert.ok(at(image, 87, 145)[3] < 10, 'Lower counter centre must remain transparent');
  const orange = at(image, 155, 49), green = at(image, 155, 142);
  assert.ok(orange[0] > orange[1] + 30 && orange[1] > orange[2] + 60);
  assert.ok(green[1] > green[0] && green[1] > green[2] + 70);
  assert.ok(at(image, 34, 48)[3] > 200, 'Structural border exists outside original ink');
  const top = at(image, 150, 26), middle = at(image, 150, 50), lower = at(image, 150, 78);
  assert.notDeepEqual(top, middle); assert.notDeepEqual(lower, middle);
  assert.equal(result.quality.lineCount, 2);
  assert.equal(result.quality.usedMaterial, false);
  assert.ok(result.quality.layers.includes('glyph-bevel'));
  assert.ok(result.quality.layers.includes('cream-rim'));
  assert.ok(result.quality.edgeContrast > 5);
  assert.deepEqual(result.quality.flags, []);
});

test('washed beige AI material is rejected and cannot wash out deterministic title palette', async () => {
  const mask = await glyphMask();
  const material = await sharp({ create: { width: 60, height: 60, channels: 4, background: '#e8dbbe' } }).png().toBuffer();
  const baseline = await finishLicensedTitle({ mask });
  const rejected = await finishLicensedTitle({ mask, material });
  assert.equal(rejected.quality.usedMaterial, false);
  assert.equal(rejected.quality.material.status, 'rejected-washed-beige');
  assert.deepEqual(rejected.buffer, baseline.buffer);
});

test('acceptable AI material provides small texture differences within the exact face mask only', async () => {
  const mask = await glyphMask(), pixels = Buffer.alloc(280 * 200 * 4);
  for (let y = 0; y < 200; y++) for (let x = 0; x < 280; x++) {
    const i = (y * 280 + x) * 4, bright = (x % 10) < 5;
    pixels[i] = bright ? 245 : 135; pixels[i + 1] = bright ? 185 : 63; pixels[i + 2] = 20; pixels[i + 3] = 255;
  }
  const material = await sharp(pixels, { raw: { width: 280, height: 200, channels: 4 } }).png().toBuffer();
  const baseline = await finishLicensedTitle({ mask }), textured = await finishLicensedTitle({ mask, material });
  assert.equal(textured.quality.usedMaterial, true);
  assert.equal(textured.quality.material.status, 'accepted-texture');
  const a = await raw(baseline.buffer), b = await raw(textured.buffer), source = await raw(mask);
  let changed = 0;
  for (let i = 0; i < source.data.length; i += 4) {
    assert.equal(a.data[i + 3], b.data[i + 3], 'Texture cannot change glyph/effect alpha');
    if (!source.data[i + 3]) assert.deepEqual([...a.data.subarray(i, i + 4)], [...b.data.subarray(i, i + 4)]);
    else if (a.data[i] !== b.data[i]) changed++;
  }
  assert.ok(changed > 100);
});

test('explicit line bands and palette remain authoritative, with no fake background pixels', async () => {
  const result = await finishLicensedTitle({ mask: await glyphMask(), lineBands: [{ top: 25, bottom: 79 }, { top: 118, bottom: 172 }],
    palette: { lines: [{ top: '#e9faff', middle: '#77d0ed', bottom: '#4380b5' }, { top: '#fff0fa', middle: '#e08db8', bottom: '#a84a87' }] } });
  const image = await raw(result.buffer);
  assert.ok(at(image, 150, 50)[2] > at(image, 150, 50)[0]);
  assert.ok(at(image, 150, 144)[0] > at(image, 150, 144)[1]);
  assert.equal(at(image, 275, 190)[3], 0);
  assert.equal(result.quality.lineCount, 2);
});

test('opted-in accepted blue/pink material drives its own line colours, and explicit line palettes win', async () => {
  const mask = await glyphMask(), pixels = Buffer.alloc(280 * 200 * 4);
  for (let y = 0; y < 200; y++) for (let x = 0; x < 280; x++) {
    const p = (y * 280 + x) * 4, rgb = y < 100 ? [30, 105, 235] : [238, 85, 180];
    pixels[p] = rgb[0]; pixels[p + 1] = rgb[1]; pixels[p + 2] = rgb[2]; pixels[p + 3] = 255;
  }
  const material = await sharp(pixels, { raw: { width: 280, height: 200, channels: 4 } }).png().toBuffer();
  const result = await finishLicensedTitle({ mask, material, palette: { useMaterialPalette: true } });
  assert.equal(result.quality.usedMaterial, true);
  assert.deepEqual(result.quality.materialPaletteLines, [0, 1]);
  const image = await raw(result.buffer), blue = at(image, 155, 49), pink = at(image, 155, 142);
  assert.ok(blue[2] > blue[0] + 100 && blue[2] > blue[1] + 60);
  assert.ok(pink[0] > pink[1] + 70 && pink[2] > pink[1] + 35);
  const explicit = await finishLicensedTitle({ mask, material, palette: { useMaterialPalette: true,
    lines: [{ top: '#fff080', middle: '#ffb920', bottom: '#e28815' }] } });
  assert.deepEqual(explicit.quality.materialPaletteLines, [1]);
  const overridden = at(await raw(explicit.buffer), 155, 49);
  assert.ok(overridden[0] > overridden[2] + 100);
});

test('empty or opaque background masks are rejected rather than rendered as a title rectangle', async () => {
  await assert.rejects(finishLicensedTitle({ mask: await sharp({ create: { width: 30, height: 20, channels: 4, background: '#0000' } }).png().toBuffer() }), /no visible ink/);
  await assert.rejects(finishLicensedTitle({ mask: await sharp({ create: { width: 30, height: 20, channels: 4, background: '#fff' } }).png().toBuffer() }), /transparent surroundings/);
});

test('reference sticker finish uses authoritative cocoa and orange faces with a cream rim, without changing glyph counters',async()=>{
  const result=await finishLicensedTitle({mask:await glyphMask(),palette:{finish:'sticker',
    edge:'#fff8e5',outerRim:'#fff8e5',outerEdge:'#e7a136',depth:'#e7a136',
    lines:[{top:'#66502c',middle:'#554120',bottom:'#4b371a'},{top:'#fba126',middle:'#f29109',bottom:'#e38304'}]}});
  const image=await raw(result.buffer),cocoa=at(image,155,49),orange=at(image,155,142);
  assert.ok(cocoa[0]<120 && cocoa[1]<100 && cocoa[2]<70,'The first face must stay cocoa rather than default orange');
  assert.ok(orange[0]>200 && orange[0]>orange[1]+60 && orange[1]>orange[2]+60,'The second face must be reference orange rather than default green');
  assert.ok(at(image,32,49)[0]>200 && at(image,32,49)[1]>200,'A visible cream rim supports the flat face');
  assert.equal(at(image,87,52)[3],0);assert.equal(at(image,87,145)[3],0);
  assert.equal(result.effectStyle,'licensed-glyph-sticker');
  assert.equal(result.quality.bevel,1);
  assert.ok(!result.quality.layers.includes('glyph-bevel'));
  assert.deepEqual(result.quality.flags,[]);
});
