import { test } from "node:test";
import assert from "node:assert/strict";

import { QUICK_NPC } from "@wg/shared";

import { blankDraft, quickDraft, ruinAbility } from "./constants";

// Issue #43: QUICK (Tier N) fills what Core p.326's Quick NPC Stats row holds, and nothing it doesn't (§11.110).
test("quickDraft takes the eight derived numbers from the row for that Tier", () => {
  const d = quickDraft(3);
  const row = QUICK_NPC[3];
  assert.equal(d.skills.default, row.skills);
  assert.equal(d.defence, row.defence);
  assert.equal(d.resilience.value, row.resilience);
  assert.equal(d.conviction, row.conviction);
  assert.equal(d.resolve, row.resolve);
  assert.equal(d.speed, row.speed);
  assert.match(d.note ?? "", /Quick NPC Stats, Tier 3 \(Core p\.326\)/);
});

test("the table prints no Attributes, so those stay the GM's to type (§11.110)", () => {
  assert.deepEqual(quickDraft(2).attributes, blankDraft().attributes);
  assert.equal(quickDraft(2).name, "", "and it still needs a name");
  assert.deepEqual(quickDraft(2).keywords, []);
});

test("a blank draft is a Troop at every Tier, so it takes the Troop's 1 Wound and 3 Shock (Core p.326)", () => {
  const d = quickDraft(4);
  assert.deepEqual(d.threat, ["T", "T", "T", "T"]);
  assert.equal(d.wounds, 1);
  assert.equal(d.shock, 3);
  // The row's own Wounds are higher; they are the Elite and Adversary lines' base, not a Troop's.
  assert.equal(QUICK_NPC[4].wounds, 10);
});

test("a Tier 5 game reads the table's last row, and the note says so (§11.86)", () => {
  const d = quickDraft(5);
  assert.equal(d.defence, QUICK_NPC[4].defence);
  assert.match(d.note ?? "", /Tier 4 \(Core p\.326\), the table's last row/);
  // Below Tier 1 there is no row either; the first one stands in.
  assert.equal(quickDraft(0).defence, QUICK_NPC[1].defence);
});

// Issue #43 step 5: a row of Threat Assessment p.7's table becomes a RUIN ability that keeps its cite.
test("ruinAbility turns an Additional Ruin Action into a RUIN ability with its cite", () => {
  const table = { id: "t", name: "Additional Ruin Actions", source: "threat-assessment" as const, page: 7, rows: [] };
  const row = { kind: "spend" as const, pool: "ruin" as const, n: 1, name: "Placeholder", text: "[effect]" };
  assert.deepEqual(ruinAbility(table, row), {
    type: "RUIN",
    name: "Placeholder",
    text: "[effect] (TA p.7)",
    weapons: [],
  });
});
