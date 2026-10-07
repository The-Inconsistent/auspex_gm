import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CharacterStats,
  deriveStats,
  effectiveStrength,
  findMutation,
  mutationRow,
  severityFor,
  sheetMutation,
  type MutationTable,
} from "@wg/shared";
import { mutationTables } from "./index.ts";

const tables = mutationTables();
const table = (severity: MutationTable["severity"]) => tables.find((t) => t.severity === severity)!;
const at = (severity: MutationTable["severity"], d66: number, held = 0) => {
  const row = mutationRow(table(severity), d66, held);
  return "forward" in row ? `→ ${row.forward}` : row.id;
};

test("severity: 1–2 Subtle, 3–4 Minor, 5–6 Severe (Core p.287)", () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6].map(severityFor), ["subtle", "subtle", "minor", "minor", "severe", "severe"]);
});

test("the d66 lands on its printed row, Brute's wide one included (p.288)", () => {
  assert.equal(at("subtle", 11), "hint-of-red-eyes");
  assert.equal(at("subtle", 56), "wyrdling");
  assert.equal(at("minor", 34), "brute");
  assert.equal(at("minor", 43), "brute");
  assert.equal(at("minor", 44), "horns-spines-fangs-or-claws");
  assert.equal(at("severe", 63), "afflicted");
  assert.equal(at("severe", 64), "the-warp-made-manifest");
});

test("+10 per mutation held, past 66 the top row, which sends Subtle and Minor on (p.287, §11.136)", () => {
  assert.equal(at("minor", 24, 2), "horns-spines-fangs-or-claws", "p.287's example: 24 + 20 = 44");
  assert.equal(at("subtle", 61), "→ minor");
  assert.equal(at("subtle", 56, 3), "→ minor");
  assert.equal(at("minor", 55, 1), "→ severe");
  assert.equal(at("severe", 11, 9), "the-warp-made-manifest");
});

test("a mutation is found by id; The Warp Made Manifest's inclusions exist", () => {
  assert.equal(findMutation(tables, "brute")?.mods.attributes.S, 1);
  assert.equal(findMutation(tables, "visions")?.sub?.rows.at(-1)?.name, "Otherworldly");
  assert.equal(findMutation(tables, "minor"), undefined, "a forward row isn't a mutation");
  const manifest = mutationRow(table("severe"), 64, 0);
  assert.ok(!("forward" in manifest) && manifest.includes.length === 3 && manifest.extraRolls === 2);
  for (const id of manifest.includes) assert.ok(findMutation(tables, id), id);
});

test("a mutation's mods reach the sheet when read, and a d6 table's row folds into its line", () => {
  const brute = sheetMutation(findMutation(tables, "brute")!);
  const stats = CharacterStats.parse({ attributes: { S: 3, T: 3, A: 3, I: 3, Wil: 3, Int: 3, Fel: 3 } });
  const before = deriveStats({ stats, overrides: {}, tier: 1 });
  const after = deriveStats({ stats: { ...stats, mutations: [brute] }, overrides: {}, tier: 1 });
  assert.equal(after.maxWounds, before.maxWounds + 1, "+1 Toughness (Core p.290)");
  assert.equal(effectiveStrength({ ...stats, mutations: [brute] }), 4);
  assert.equal(stats.attributes.T, 3, "nothing is stored into the sheet");

  const appendages = findMutation(tables, "extra-appendages")!;
  const leg = sheetMutation(
    appendages,
    appendages.sub!.rows.find((r) => r.name === "Malformed Leg"),
  );
  assert.equal(leg.name, "Extra Appendages: Malformed Leg");
  assert.equal(leg.mods.traits.speed, -1);
  assert.match(leg.effect, /CHAOS/, "the parent's Persuasion penalty comes along");

  const bile = sheetMutation(findMutation(tables, "corrosive-bile")!);
  assert.equal(bile.weapons[0]?.damage, 8);
});
