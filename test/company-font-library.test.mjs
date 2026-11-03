import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, rm, realpath } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { extractFontMembers, inspectFontBytes, importCompanyFonts } from '../scripts/import-company-fonts.mjs';
import { readCompanyFontLibrary, resolveCompanyFontFile, readCompanyFontBytes } from '../lib/company-font-library.mjs';

function fixtureFont(family = '字魂测试体') {
  const strings = [family, 'Regular', 'Version 1.00'].map(value => {
    const bytes = Buffer.from(value, 'utf16le');
    return Buffer.from(bytes).swap16();
  });
  const names = Buffer.alloc(42 + strings.reduce((total, bytes) => total + bytes.length, 0));
  names.writeUInt16BE(3, 2); names.writeUInt16BE(42, 4);
  let nameOffset = 0;
  for (const [index, id] of [1, 2, 5].entries()) {
    const pos = 6 + index * 12;
    names.writeUInt16BE(3, pos); names.writeUInt16BE(1, pos + 2); names.writeUInt16BE(0x804, pos + 4); names.writeUInt16BE(id, pos + 6);
    names.writeUInt16BE(strings[index].length, pos + 8); names.writeUInt16BE(nameOffset, pos + 10);
    strings[index].copy(names, 42 + nameOffset); nameOffset += strings[index].length;
  }
  const tables = [['head', Buffer.alloc(54)], ['maxp', Buffer.alloc(6)], ['cmap', Buffer.alloc(4)], ['glyf', Buffer.alloc(4)], ['name', names]];
  let cursor = 12 + tables.length * 16;
  const font = Buffer.alloc(cursor + tables.reduce((total, [, bytes]) => total + bytes.length, 0));
  font.writeUInt32BE(0x10000); font.writeUInt16BE(tables.length, 4);
  for (const [index, [tag, bytes]] of tables.entries()) {
    const pos = 12 + index * 16;
    font.write(tag, pos, 'ascii'); font.writeUInt32BE(cursor, pos + 8); font.writeUInt32BE(bytes.length, pos + 12);
    bytes.copy(font, cursor); cursor += bytes.length;
  }
  return font;
}
function fixtureZip(member, bytes = Buffer.alloc(0), crc = 0) {
  const name = Buffer.from(member), local = Buffer.alloc(30), central = Buffer.alloc(46), end = Buffer.alloc(22);
  local.writeUInt32LE(0x04034b50); local.writeUInt16LE(name.length, 26);
  local.writeUInt32LE(crc, 14); local.writeUInt32LE(bytes.length, 18); local.writeUInt32LE(bytes.length, 22);
  central.writeUInt32LE(0x02014b50); central.writeUInt16LE(name.length, 28);
  central.writeUInt32LE(crc, 16); central.writeUInt32LE(bytes.length, 20); central.writeUInt32LE(bytes.length, 24);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10);
  end.writeUInt32LE(46 + name.length, 12); end.writeUInt32LE(30 + name.length + bytes.length, 16);
  return Buffer.concat([local, name, bytes, central, name, end]);
}
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
async function temporary(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'company-font-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

test('font metadata uses internal family/style/version and rejects corrupted tables', () => {
  const font = fixtureFont();
  const result = inspectFontBytes(font);
  assert.equal(result.faces[0].family, '字魂测试体');
  assert.equal(result.faces[0].style, 'Regular');
  assert.equal(result.faces[0].version, 'Version 1.00');
  const corrupt = Buffer.from(font); corrupt.writeUInt32BE(font.length + 10, 12 + 4 * 16 + 8);
  assert.throws(() => inspectFontBytes(corrupt), /越界/);
  assert.throws(() => inspectFontBytes(Buffer.from('not a font file')), /签名/);
});

test('archive extraction rejects traversal including non-font members before disk writes', () => {
  for (const name of ['../escape.ttf', 'a/../../escape.txt', 'C:\\font.ttf', '/font.ttf']) {
    assert.throws(() => extractFontMembers(fixtureZip(name)), /路径穿越/);
  }
});

test('archive font extraction checks CRC and ignores non-font executables', () => {
  // Standard CRC32 test vector for "abc" is 0x352441c2.
  const archive = fixtureZip('nested/font.ttf', Buffer.from('abc'), 0x352441c2);
  assert.deepEqual(extractFontMembers(archive), [{ name: 'nested/font.ttf', bytes: Buffer.from('abc') }]);
  const corrupted = Buffer.from(archive); corrupted[30 + Buffer.byteLength('nested/font.ttf')] ^= 1;
  assert.throws(() => extractFontMembers(corrupted), /CRC/);
  assert.deepEqual(extractFontMembers(fixtureZip('setup.exe', Buffer.from('abc'), 0x352441c2)), []);
});

test('official manifest import is resumable, hash-deduplicated, source-bound and preserves existing fonts', async t => {
  const root = await temporary(t), directory = path.join(root, 'official');
  await mkdir(directory);
  const font = fixtureFont(), original = path.join(directory, 'font.ttf');
  await writeFile(original, font);
  const record = { worksId: 1234, title: '字魂测试体', brandId: 1, officialHash: 'a'.repeat(32), source: 'official-public-font-list', sourceUrl: 'https://down.izihun.com/font/font.ttf?signature=private', listUrl: 'https://zihunziku.com/font-list', downloadApi: 'https://api.zihunziku.com/v1/download/1234', file: 'font.ttf', sha256: digest(font), bytes: font.length };
  const otherWork = { ...record, worksId: 1235, title: '字小魂测试别名', downloadApi: 'https://api.zihunziku.com/v1/download/1235' };
  const manifest = path.join(directory, 'manifest.json');
  await writeFile(path.join(directory, 'official-catalog.json'), JSON.stringify({ schemaVersion: 1, fonts: [record, otherWork] }));
  // The mismatched official title is deliberately encountered first.
  await writeFile(manifest, JSON.stringify({ schemaVersion: 1, fonts: [otherWork, record] }));
  const first = await importCompanyFonts({ root, manifestPath: manifest, evidencePath: null });
  assert.equal(first.imported, 1); assert.equal(first.reused, 1); assert.equal(first.errors.length, 0);
  const second = await importCompanyFonts({ root, manifestPath: manifest, evidencePath: null });
  assert.equal(second.imported, 0); assert.equal(second.total, 1);
  const library = await readCompanyFontLibrary({ root });
  assert.equal(library.fonts[0].family, '字魂测试体');
  assert.equal(library.fonts[0].name, '字魂测试体');
  assert.deepEqual(library.fonts[0].aliases, []);
  assert.equal(library.issues[0].name, '字小魂测试别名');
  assert.equal(library.issues[0].eligibleForLibrary, false);
  assert.equal(library.issues[0].reason, 'official-duplicate-package');
  assert.equal(library.licenseAssertion.evidenceStatus, 'provided-screenshot');
  assert.equal(library.licenseAssertion.fontEmbedding, 'not-shown');
  assert.equal(library.fonts[0].source, 'company-library');
  assert.equal(library.fonts[0].file, undefined);
  const catalog = JSON.parse(await readFile(path.join(root, first.catalog), 'utf8'));
  assert.equal(catalog.fonts[0].sources.length, 2);
  assert.equal(catalog.fonts[0].sources[0].eligibleForLibrary, false);
  assert.equal(catalog.fonts[0].sources[1].title, '字魂测试体');
  assert.ok(!catalog.fonts[0].sources[0].sourceUrl.includes('signature'));
  const read = await readCompanyFontBytes(library.fonts[0].id, { root });
  assert.deepEqual(read.bytes, font);
  await writeFile(manifest, JSON.stringify({ schemaVersion: 1, fonts: [{ ...record, sha256: '0'.repeat(64) }, { ...record, sourceUrl: 'https://evil.example/font.ttf' }, { ...record, worksId: 9999 }] }));
  const bad = await importCompanyFonts({ root, manifestPath: manifest, evidencePath: null });
  assert.equal(bad.errors.length, 3); assert.equal(bad.total, 1);
  assert.equal((await readCompanyFontLibrary({ root })).fonts.length, 1);
});

test('font file routes reject manipulated paths and detect equal-length binary replacement', async t => {
  const root = await temporary(t), font = fixtureFont(), hash = digest(font), id = `font-${hash}-0`;
  const directory = path.join(root, 'data/fonts/company-library');
  await mkdir(path.join(directory, 'files'), { recursive: true });
  const file = `files/${hash}.ttf`;
  await writeFile(path.join(directory, file), font);
  const catalog = { schemaVersion: 1, fonts: [{ id, file, sha256: hash, format: 'ttf', faceIndex: 0, bytes: font.length, status: 'ready' }] };
  await writeFile(path.join(directory, 'catalog.json'), JSON.stringify(catalog));
  assert.equal(await resolveCompanyFontFile(id, { root }), await realpath(path.join(directory, file)));
  await assert.rejects(resolveCompanyFontFile('../catalog.json', { root }), /编号无效/);
  catalog.fonts[0].file = 'files/../../outside.ttf';
  await writeFile(path.join(directory, 'catalog.json'), JSON.stringify(catalog));
  await assert.rejects(resolveCompanyFontFile(id, { root }), /路径无效/);
  catalog.fonts[0].file = file;
  await writeFile(path.join(directory, 'catalog.json'), JSON.stringify(catalog));
  await writeFile(path.join(directory, file), Buffer.alloc(font.length));
  await assert.rejects(readCompanyFontBytes(id, { root }), /校验失败/);
});

test('online-imported fonts show their file name without license notes, falling back to the internal name', async t => {
  const root = await temporary(t), library = path.join(root, 'data', 'fonts', 'company-library');
  await mkdir(library, { recursive: true });
  const font = (seed, family, style, originalName, extra = {}) => {
    const sha256 = digest(Buffer.from(seed));
    return { id: `font-${sha256}-0`, name: family, family, style, format: 'ttf', faceIndex: 0, sha256, bytes: 1, file: `files/${sha256}.ttf`, status: 'ready',
      sourceStatus: 'online-import', sources: [], importedBy: { accountId: '8', name: '谭耀斌' }, originalName, ...extra };
  };
  await writeFile(path.join(library, 'catalog.json'), JSON.stringify({ schemaVersion: 1, fonts: [
    font('a', '字魂全家福(商用需授权)', '常规体', '字魂全家福.ttf'),
    font('b', '字魂大黑', 'Medium', '字魂大黑-Medium.ttf'),
    font('c', '字魂国潮手书(商用需授权)', 'Regular', '字魂国潮手书（混沌版）.ttf'),
    font('d', '字魂雅致黑(商用需授权)', 'Regular', 'ZihunYazhihei.ttf'),
    font('e', '字魂剧场体(商用需授权)', 'Bold', 'e.ttf'),
    font('f', '字魂剧场体(商用需授权)', 'Light', 'f.ttf'),
    font('g', '思源黑体', 'Regular', '', { sourceStatus: 'seed' }),
  ] }));
  assert.deepEqual((await readCompanyFontLibrary({ root })).fonts.map(item => item.name),
    ['字魂全家福', '字魂大黑-Medium', '字魂国潮手书（混沌版）', '字魂雅致黑', '字魂剧场体-Bold', '字魂剧场体-Light', '思源黑体']);
});

test('an absent company library is a safe empty catalog', async t => {
  const root = await temporary(t);
  assert.deepEqual((await readCompanyFontLibrary({ root })).fonts, []);
});
