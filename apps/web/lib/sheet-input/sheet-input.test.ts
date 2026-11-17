import assert from "node:assert/strict";
import { test } from "node:test";

import { CharacterStats, type Character } from "@wg/shared";

import { fromBuild, fromCharacter } from "./sheet-input.ts";

const stats = CharacterStats.parse({ attributes: { S: 3, T: 3, A: 3, I: 3, Wil: 3, Int: 3, Fel: 3 } });

test("a seated Agent: Rank from XP, the rolled Objective, the Background rows by name", () => {
  const me = {
    name: "Tessaly-7",
    stats,
    overrides: {},
    xp: 45,
    xpSpent: 10,
    objectives: [
      { text: "Recover the relic", done: false },
      { text: "Show no mercy", done: false, rolled: true },
    ],
    build: { tier: 2, archetypeId: "x", background: { tableId: "t", origin: "Forge World", goal: "Duty" } },
  } as unknown as Character;
  const sheet = fromCharacter(me, 2);
  assert.equal(sheet.rank, 2); // Core pp.146–147: +1 Rank per 40 XP
  assert.equal(sheet.objective, "Show no mercy");
  assert.equal(sheet.background, "Forge World · Duty");
  assert.equal(sheet.tier, 2);
});

test("a build with no Background and no advancement prints blanks at Rank 1", () => {
  const sheet = fromBuild({ name: "New", build: {}, stats, overrides: {}, advancement: null, tier: 3 });
  assert.deepEqual([sheet.rank, sheet.tier, sheet.xp, sheet.background, sheet.objective], [1, 3, 0, "", ""]);
});
