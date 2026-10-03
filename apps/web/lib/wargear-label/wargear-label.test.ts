import { test } from "node:test";
import assert from "node:assert/strict";
import type { Wargear } from "@wg/shared";

import { wargearLabels } from "./wargear-label";

const w = (id: string, name: string, source: string, page: number) => ({ id, name, source, page }) as Wargear;

test("a name two books print carries its cite, and a label reads back to its entry", () => {
  const core = w("bolt-pistol", "Bolt Pistol", "core", 217);
  const voa = w("voa-bolt-pistol", "Bolt Pistol", "vow-of-absolution", 67);
  const { labelOf, find } = wargearLabels([core, voa, w("auspex", "Auspex", "core", 236)]);
  assert.equal(labelOf(w("auspex", "Auspex", "core", 236)), "Auspex");
  assert.notEqual(labelOf(core), labelOf(voa));
  assert.equal(find(labelOf(voa))?.id, "voa-bolt-pistol");
  assert.equal(find(" auspex ")?.id, "auspex", "case and spaces don't matter");
  assert.equal(find("Surveyor's Slate"), undefined, "anything else is a custom item");
});
