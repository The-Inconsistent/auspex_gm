import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CritTable,
  PerilsTable,
  addCondition,
  applyActions,
  diceNeeded,
  diceRange,
  isD66,
  type LookupTarget,
  lookup,
  LookupApply,
  openRangeProblems,
  perilsResult,
  perilsRow,
  planApply,
} from "./index.ts";

// Placeholders only: book text never goes in tests (docs/data.md, Copyright).
const apply = [
  { kind: "wounds", amount: 2 },
  { kind: "shock", dice: "1d6" },
  { kind: "condition", condition: "[Condition]" },
] as const;
const crits = CritTable.parse({
  source: "core",
  page: null,
  dice: "d66",
  rows: [
    { from: 11, to: 16, name: "[crit A]", text: "[text]", apply: [], glorious: "[glorious]" },
    { from: 21, to: 66, name: "[crit B]", text: "[text]", apply: apply.map((a) => ({ ...a })) },
  ],
});
const perils = PerilsTable.parse({
  source: "core",
  page: null,
  dice: "d66",
  rows: [
    { from: 11, to: 40, name: "[peril A]", text: "[text]" },
    { from: 41, to: null, name: "[peril B]", text: "[text]" },
  ],
});

test("a d66 result has both digits 1 to 6", () => {
  assert.ok(isD66(11) && isD66(66) && isD66(35));
  for (const n of [0, 10, 17, 67, 7, 3.5]) assert.equal(isD66(n), false);
});

test("Perils adds 10 per extra 1 (§8)", () => {
  assert.equal(perilsResult(34, 0), 34);
  assert.equal(perilsResult(34, 2), 54);
  assert.equal(perilsResult(34, -1), 34);
});

test("lookup finds the row, none in a gap, and an open-ended last row", () => {
  assert.deepEqual(
    lookup(crits, 14).map((r) => r.name),
    ["[crit A]"],
  );
  assert.deepEqual(lookup(crits, 18), []);
  assert.deepEqual(
    lookup(perils, 41).map((r) => r.name),
    ["[peril B]"],
  );
  assert.deepEqual(
    lookup(perils, 96).map((r) => r.name),
    ["[peril B]"],
  );
  assert.deepEqual(lookup({ rows: [] }, 11), [], "an empty table finds nothing");
});

test("openRangeProblems names overlaps and a non-final open end", () => {
  assert.deepEqual(openRangeProblems(perils.rows), []);
  assert.equal(
    openRangeProblems([
      { from: 11, to: 30 },
      { from: 30, to: null },
    ]).length,
    1,
  );
  assert.equal(
    openRangeProblems([
      { from: 11, to: null },
      { from: 30, to: 40 },
    ]).length,
    1,
  );
});

test("applyActions: damage as positive deltas, Conditions added once and first, typed dice in order", () => {
  const row = crits.rows[1]!;
  assert.deepEqual(diceNeeded(row), ["1d6"]);
  const pc: LookupTarget = { kind: "pc", id: "c1", conditions: ["Prone"] };
  assert.deepEqual(applyActions({ row, target: pc, typed: [3] }), [
    { type: "character.update", id: "c1", conditions: ["Prone", "[Condition]"] },
    { type: "character.adjust", id: "c1", wounds: 2, shock: 3 },
  ]);
  const threat: LookupTarget = {
    kind: "threat",
    id: "t1",
    conditions: ["[Condition]"],
    threatClass: "E",
    maxShock: 3,
  };
  assert.deepEqual(applyActions({ row, target: threat }), [{ type: "combatant.adjust", id: "t1", wounds: 2 }]);
  assert.deepEqual(applyActions({ row: crits.rows[0]!, target: threat }), []);
});

test("Mortal Wounds are plain Wounds; Corruption is an Agent's character.corrupt and skipped for a Threat", () => {
  const row = {
    apply: [
      { kind: "mortal", amount: 1 },
      { kind: "wounds", amount: 2 },
      { kind: "corruption", dice: "1d3" },
    ] as LookupApply[],
  };
  assert.deepEqual(applyActions({ row, target: { kind: "pc", id: "c1", conditions: [] }, typed: [2] }), [
    { type: "character.adjust", id: "c1", wounds: 3 },
    { type: "character.corrupt", id: "c1", delta: 2 },
  ]);
  assert.deepEqual(
    applyActions({
      row,
      target: { kind: "threat", id: "t1", conditions: [], threatClass: "E", maxShock: 3 },
      typed: [2],
    }),
    [{ type: "combatant.adjust", id: "t1", wounds: 3 }],
  );
});

test("Glory is spent last, applies each per Glory and first once (p.197)", () => {
  const row = {
    apply: [{ kind: "mortal", amount: 1 }] as LookupApply[],
    glory: {
      each: [{ kind: "wounds", amount: 1 }] as LookupApply[],
      first: [{ kind: "condition", condition: "[Condition]" }] as LookupApply[],
    },
  };
  const target: LookupTarget = { kind: "pc", id: "c1", conditions: [] };
  assert.deepEqual(applyActions({ row, target, glory: { spent: 0 } }), [
    { type: "character.adjust", id: "c1", wounds: 1 },
  ]);
  assert.deepEqual(applyActions({ row, target, glory: { spent: 3 } }), [
    { type: "character.update", id: "c1", conditions: ["[Condition]"] },
    { type: "character.adjust", id: "c1", wounds: 4 },
    { type: "pool.adjust", pool: "glory", delta: -3 },
  ]);
  // after Corruption too, and a row without glory spends nothing
  const corrupt = { ...row, apply: [{ kind: "corruption", amount: 2 }] as LookupApply[] };
  assert.equal(applyActions({ row: corrupt, target, glory: { spent: 1 } }).at(-1)?.type, "pool.adjust");
  assert.deepEqual(applyActions({ row: { apply: row.apply }, target, glory: { spent: 2 } }), [
    { type: "character.adjust", id: "c1", wounds: 1 },
  ]);
});

test("a Monstrous Creature's immune Conditions are dropped, with a note (p.323)", () => {
  const row = {
    apply: [
      { kind: "condition", condition: "Staggered" },
      { kind: "condition", condition: "[Condition]" },
    ] as LookupApply[],
  };
  const m: LookupTarget = { kind: "threat", id: "t1", conditions: [], threatClass: "M", maxShock: 5 };
  const r = planApply({ row, target: m });
  assert.deepEqual(r.actions, [{ type: "combatant.update", id: "t1", conditions: ["[Condition]"] }]);
  assert.deepEqual(r.notes, ["Monstrous Creatures are immune to Staggered (p.323)"]);
  assert.deepEqual(applyActions({ row, target: { ...m, threatClass: "E" } })[0], {
    type: "combatant.update",
    id: "t1",
    conditions: ["Staggered", "[Condition]"],
  });
});

test("a Threat with no Shock never takes Shock (p.324)", () => {
  const row = {
    apply: [
      { kind: "shock", amount: 2 },
      { kind: "wounds", amount: 1 },
    ] as LookupApply[],
  };
  const t: LookupTarget = { kind: "threat", id: "t1", conditions: [], threatClass: "T", maxShock: null };
  const r = planApply({ row, target: t });
  assert.deepEqual(r.actions, [{ type: "combatant.adjust", id: "t1", wounds: 1 }]);
  assert.equal(r.notes.length, 1);
  assert.deepEqual(planApply({ row: { apply: [{ kind: "shock", amount: 2 }] }, target: t }).actions, []);
});

test("diceRange is N+M to N·X+M", () => {
  assert.deepEqual(diceRange("1d3"), { min: 1, max: 3 });
  assert.deepEqual(diceRange("1d3+1"), { min: 2, max: 4 });
  assert.deepEqual(diceRange("2d6+2"), { min: 4, max: 14 });
});

test("a Critical Hit that doesn't beat Resilience is 1 Wound and nothing else (p.197)", () => {
  const row = crits.rows[1]!;
  assert.deepEqual(
    applyActions({ row, target: { kind: "pc", id: "c1", conditions: [] }, typed: [3], beatResilience: false }),
    [{ type: "character.adjust", id: "c1", wounds: 1 }],
  );
  const t: LookupTarget = { kind: "threat", id: "t1", conditions: [], threatClass: "E", maxShock: 3 };
  assert.deepEqual(applyActions({ row, target: t, beatResilience: false }), [
    { type: "combatant.adjust", id: "t1", wounds: 1 },
  ]);
});

test("rated Conditions stack, unrated ones aren't repeated (p.197)", () => {
  assert.deepEqual(addCondition(["Hindered"], "Hindered (1)"), ["Hindered (2)"]);
  assert.deepEqual(addCondition(["Vulnerable (1)"], "Vulnerable (2)"), ["Vulnerable (3)"]);
  assert.deepEqual(addCondition(["Prone"], "Prone"), ["Prone"]);
  assert.deepEqual(addCondition(["Prone"], "Hindered (1)"), ["Prone", "Hindered (1)"]);
  const row = { apply: [{ kind: "condition", condition: "Hindered (1)" }] as LookupApply[] };
  assert.deepEqual(applyActions({ row, target: { kind: "pc", id: "c1", conditions: ["Hindered (2)"] } }), [
    { type: "character.update", id: "c1", conditions: ["Hindered (3)"] },
  ]);
});

test("the mutation kind produces no action", () => {
  const row = { apply: [{ kind: "mutation", severity: "minor" }] as LookupApply[] };
  assert.deepEqual(applyActions({ row, target: { kind: "pc", id: "c1", conditions: [] } }), []);
  assert.ok(LookupApply.safeParse({ kind: "mutation", severity: "minor" }).success);
  assert.equal(LookupApply.safeParse({ kind: "mutation", severity: "x" }).success, false);
});

test("perilsRow reads the top row above the highest printed total", () => {
  const closed = PerilsTable.parse({
    source: "core",
    page: null,
    dice: "d66",
    rows: [
      { from: 11, to: 40, name: "[peril A]", text: "[text]" },
      { from: 41, to: 106, name: "[peril B]", text: "[text]" },
    ],
  });
  assert.equal(perilsRow(closed, 35, 0).row?.name, "[peril A]");
  assert.equal(perilsRow(closed, 66, 4).result, 106);
  assert.equal(perilsRow(closed, 66, 4).row?.name, "[peril B]");
  const over = perilsRow(closed, 66, 5);
  assert.deepEqual([over.result, over.row?.name], [116, "[peril B]"]);
  assert.equal(perilsRow(perils, 66, 9).row?.name, "[peril B]");
  assert.equal(perilsRow({ ...closed, rows: [] }, 11, 0).row, null);
});

test("dice strings are NdN or NdN+N", () => {
  for (const dice of ["1d3", "2d6", "1d3+1"]) assert.ok(LookupApply.safeParse({ kind: "mortal", dice }).success);
  for (const dice of ["d6", "1d3 + 1", "1d3-1", ""])
    assert.equal(LookupApply.safeParse({ kind: "shock", dice }).success, false);
});
