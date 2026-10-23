import assert from "node:assert/strict";
import { test } from "node:test";

import { keywordText } from "./keyword-texts.ts";

test("a Keyword gets its printed text and cite", () => {
  const imperium = keywordText("IMPERIUM");
  assert.equal(imperium?.cite, "Core p.376");
  assert.ok(imperium && imperium.text.length > 0 && imperium.kind === null);
});

test("a filled bracket gets the bracket's text, named for what it is", () => {
  const wolves = keywordText("SPACE WOLVES");
  assert.equal(wolves?.kind, "a Chapter");
  assert.equal(wolves?.cite, keywordText("[CHAPTER]")?.cite);
});

test("a Keyword the books name without describing has empty text, or our marked house text; one they don't name has nothing", () => {
  assert.equal(keywordText("LEGIO CYBERNETICA")?.text, "");
  assert.ok(keywordText("DEATHWATCH")?.text && keywordText("DEATHWATCH")?.cite === "", "house text, no page");
  assert.equal(keywordText("RED SCORPIONS"), null);
});
