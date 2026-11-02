import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../public/app.js", import.meta.url), "utf8");

test("画布元素允许等比放大到500%，背景仍限制为250%", () => {
  assert.match(source, /const MAX_ELEMENT_SCALE = 500/);
  assert.match(source, /const MAX_BACKGROUND_SCALE = 250/);
  assert.match(source, /max="\$\{MAX_ELEMENT_SCALE\}" step="5"/);
  assert.match(source, /const maximum = state\.inspectorElement === "background" \? MAX_BACKGROUND_SCALE : MAX_ELEMENT_SCALE/);
});
