import test from 'node:test';
import assert from 'node:assert/strict';
import { companyFonts, loadFontAsset, loadProjectFonts, projectFontFamily, projectFonts, selectedProjectFont, setCompanyFonts } from '../public/project-fonts.js';

const font = (id, extra = {}) => ({ id, name: '同名字体', family: 'OfficialFamily', style: 'Regular', version: '1.0', sha256: id.padEnd(64, 'a'), url: `/company-fonts/${id}.ttf`, ...extra });

function mockFontLoading(t, load) {
  const previousFontFace = globalThis.FontFace;
  const previousDocument = globalThis.document;
  const requests = [], added = [];
  globalThis.FontFace = class {
    constructor(family, source) { this.family = family; this.source = source; requests.push(this); }
    async load() { if (load) await load(this); return this; }
  };
  globalThis.document = { fonts: { add(face) { added.push(face); } } };
  t.after(() => {
    if (previousFontFace === undefined) delete globalThis.FontFace; else globalThis.FontFace = previousFontFace;
    if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument;
    setCompanyFonts([]);
  });
  return { requests, added };
}

test('company registration does not assign project recommendations or match legacy selections by a shared name', () => {
  const first = font('a1'), second = font('b2');
  setCompanyFonts([first, second, first]);
  const task = { projectId: 'project', parameters: { titleFontAsset: '同名字体' } };
  const projects = [{ id: 'project', assets: [] }];
  assert.equal(companyFonts().length, 2);
  assert.deepEqual(projectFonts(task, projects), []);
  assert.equal(selectedProjectFont(task, projects, 'title'), undefined);
  task.parameters.titleFontId = 'b2';
  assert.equal(selectedProjectFont(task, projects, 'title').id, 'b2');
  assert.notEqual(projectFontFamily(companyFonts()[0]), projectFontFamily(companyFonts()[1]));
  projects[0].recommendedFontIds = ['b2', 'missing', 'b2', 'a1'];
  assert.deepEqual(projectFonts(task, projects).map(asset => asset.id), ['b2', 'a1']);
  setCompanyFonts([]);
});

test('legacy font selection and URL-derived family survive asset reordering and company registration', () => {
  const first = { name: 'first.ttf', url: '/storage/first.ttf' };
  const selected = { name: 'selected.ttf', url: '/storage/selected.ttf' };
  const task = { projectId: 'legacy', parameters: { titleFontAsset: 'selected.ttf' } };
  const projects = [{ id: 'legacy', assets: [first, selected] }];
  const family = projectFontFamily(selected);
  assert.match(family, /^ProjectFont_[a-f0-9]+$/);
  assert.equal(selectedProjectFont(task, projects, 'title'), selected);
  setCompanyFonts([font('c3', { name: 'selected.ttf' })]);
  projects[0].assets.reverse();
  assert.equal(selectedProjectFont(task, projects, 'title'), selected);
  assert.equal(projectFontFamily(selected), family);
  setCompanyFonts([]);
});

test('project loading fetches at most three previews plus selected fonts from a 789-font library', async t => {
  const { requests, added } = mockFontLoading(t);
  const fonts = Array.from({ length: 789 }, (_, index) => font(index.toString(16).padStart(4, '0')));
  setCompanyFonts(fonts);
  const task = { projectId: 'large', parameters: { titleFontId: fonts[787].id, subtitleFontId: fonts[788].id } };
  const projects = [{ id: 'large', assets: [], recommendedFontIds: fonts.map(asset => asset.id) }];
  await loadProjectFonts(task, projects);
  assert.equal(requests.length, 5);
  assert.equal(added.length, 5);
  assert.deepEqual(new Set(requests.map(face => face.source)), new Set([0, 1, 2, 787, 788].map(index => `url(${JSON.stringify(fonts[index].url)})`)));
  await loadProjectFonts(task, projects);
  assert.equal(requests.length, 5);
});

test('selected fonts outside project recommendations load and concurrent requests reuse one FontFace', async t => {
  const { requests, added } = mockFontLoading(t);
  setCompanyFonts([font('d4')]);
  const selected = companyFonts()[0];
  const task = { projectId: 'no-recommendation', parameters: { titleFontId: selected.id, subtitleFontId: selected.id } };
  await Promise.all([loadProjectFonts(task, [{ id: task.projectId, assets: [] }]), loadFontAsset(selected), loadFontAsset(selected)]);
  assert.equal(requests.length, 1);
  assert.equal(added.length, 1);
});

test('both selected legacy fonts load even when they are outside the three preview slots', async t => {
  const { requests } = mockFontLoading(t);
  const assets = Array.from({ length: 7 }, (_, index) => ({ name: `old-${index}.ttf`, url: `/storage/legacy-both/old-${index}.ttf` }));
  const task = { projectId: 'legacy-both', parameters: { titleFontAsset: assets[5].name, subtitleFontAsset: assets[6].name } };
  await loadProjectFonts(task, [{ id: task.projectId, assets }]);
  assert.equal(requests.length, 5);
  assert.deepEqual(new Set(requests.map(face => face.source)), new Set([0, 1, 2, 5, 6].map(index => `url(${JSON.stringify(assets[index].url)})`)));
});

test('missing selected company IDs fail before any preview or legacy fallback font is loaded', async t => {
  const { requests } = mockFontLoading(t);
  setCompanyFonts([font('available')]);
  const projects = [{ id: 'missing', assets: [{ name: 'fallback.ttf', url: '/storage/fallback.ttf' }] }];
  const task = { projectId: 'missing', parameters: { titleFontId: 'not-in-library', titleFontAsset: 'fallback.ttf' } };
  await assert.rejects(loadProjectFonts(task, projects), /主标所选版权字体不在当前字体库中：not-in-library/);
  task.parameters = { subtitleFontId: 'not-in-library' };
  await assert.rejects(loadProjectFonts(task, projects), /副标所选版权字体不在当前字体库中：not-in-library/);
  assert.equal(requests.length, 0);
});

test('failed font requests can retry and changing a company file hash loads the new version', async t => {
  let shouldFail = true;
  const { requests } = mockFontLoading(t, () => { if (shouldFail) throw new Error('download failed'); });
  setCompanyFonts([font('e5')]);
  await assert.rejects(loadFontAsset(companyFonts()[0]), /download failed/);
  shouldFail = false;
  await loadFontAsset(companyFonts()[0]);
  const oldFamily = projectFontFamily(companyFonts()[0]);
  setCompanyFonts([font('e5', { sha256: 'f'.repeat(64) })]);
  assert.notEqual(projectFontFamily(companyFonts()[0]), oldFamily);
  await loadFontAsset(companyFonts()[0]);
  assert.equal(requests.length, 3);
});
