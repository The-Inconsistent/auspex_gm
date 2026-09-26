import { test } from "node:test";
import assert from "node:assert/strict";
import { ruleKey } from "./rules.ts";

test("ruleKey matches data spellings to printed entry names", () => {
  const pairs: [string, string][] = [
    ["Blast (6)", "Blast (X)"],
    ["Blast 20", "Blast (X)"],
    ["Blast (Small)", "Blast (X)"],
    ["Inflict (Poison 7)", "Inflict (Condition)"],
    ["Inflicts (On Fire)", "Inflict (Condition)"],
    ["Rapid-Fire (1)", "Rapid Fire (X)"],
    ["Rapid Fire", "Rapid Fire (X)"],
    ["WAAAGH!", "Waaagh!"],
    ["Warp Weapon", "Warp Weapons"],
    ["Asault", "Assault"],
    ["Bulky (1)", "Bulk (X)"],
    ["’Ere We Go!", "'Ere We Go!"],
    ["’Ere We Go", "’Ere We Go!"],
    ["Agonizing", "Agonising"],
    ["Hindered (2)", "Hindered"],
    ["PINNED", "Pinned"],
  ];
  for (const [data, entry] of pairs) assert.equal(ruleKey(data), ruleKey(entry), data);
});

test("ruleKey keeps unknown names distinct", () => {
  assert.notEqual(ruleKey("Penetrating (3)"), ruleKey("Rending (X)"));
  assert.equal(ruleKey("3 Ammo"), "3 ammo");
});
