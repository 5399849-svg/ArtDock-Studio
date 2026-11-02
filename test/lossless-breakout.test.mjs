import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../public/app.js", import.meta.url), "utf8");

test("异形弹窗使用无人物背景承接完整人物层", () => {
  const templateSource = source.match(/function templateSourceImage[\s\S]*?\n}/)?.[0] || "";
  const breakout = source.match(/function drawBreakoutCharacter[\s\S]*?\n}/)?.[0] || "";
  assert.doesNotMatch(templateSource, /repaired-background|背景修补/);
  assert.match(source, /repairedBackgroundFor/);
  assert.match(source, /template\.renderMode === "masked-popup"/);
  assert.doesNotMatch(breakout, /tracePsdRegion\(layerCtx, body, false\); tracePsdRegion\(layerCtx, breakout, false\)/);
  assert.match(breakout, /applyProtectedCircleExit/);
  assert.match(breakout, /自动人物层同样完整覆盖主体区/);
  assert.match(breakout, /applyImageBottomFade/);
});

test("弹窗允许已审核自动透明层独立移动，同时手动人物素材要求透明PNG", () => {
  const allows = source.match(/function templateAllowsElement[\s\S]*?\n}/)?.[0] || "";
  assert.match(allows, /character.*core-character/);
  assert.match(allows, /image\/png/);
  assert.match(source, /请先在左侧核心人物区域上传PSD导出的透明角色PNG/);
  assert.match(source, /const draw = getElementLayout\(state\.task, template, "character"\)/);
});


test("全部弹窗圆框使用同画面亮色细描边且位于破框人物下方", () => {
  const fixedStart = source.indexOf("function drawFixedPsdElements");
  const breakoutStart = source.indexOf("function drawBreakoutCharacter");
  const renderStart = source.indexOf("function renderCanvas");
  const fixed = source.slice(fixedStart, breakoutStart);
  const render = source.slice(renderStart, source.indexOf("function drawUploadedElement", renderStart));
  assert.match(fixed, /adaptiveStrokeRgb/);
  assert.doesNotMatch(fixed, /strokeStyle\s*=\s*["']#000/);
  assert.match(fixed, /ring === "inner" \? \.006 : \.002/);
  assert.ok(render.indexOf("drawFixedPsdElements") < render.indexOf("drawBreakoutCharacter"));
});
