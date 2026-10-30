import { test } from "node:test";
import assert from "node:assert/strict";
import {
  WargearWeapon,
  advancedWargearProblems,
  isMeleeWeapon,
  threatWeapon,
  weaponAtStrength,
  withTypedRange,
  type Wargear,
} from "./index.ts";

// Placeholder profiles in the catalogue's shape, not printed entries.
const entry = (name: string, weapon: unknown) => ({ name, weapon: WargearWeapon.parse(weapon) });

test("threatWeapon resolves a melee (S) + X against the threat's Strength (Core pp.211-213)", () => {
  const w = threatWeapon(entry("Blade", { addStrength: true, damage: 2, ed: 1, range: [1], traits: ["Brutal"] }), 6);
  assert.equal(w.damage, 8);
  assert.deepEqual(w.range, [1]);
  assert.deepEqual(w.traits, ["Brutal"]);
  // A Threat's weapon has no addStrength: zod would drop the flag and leave a 2-damage blade behind.
  assert.ok(!("addStrength" in w));
  // It says the 8 counts Strength, so the threat editor can move it when S changes (rules-flow.md §11.165).
  assert.equal(w.countsStrength, true);
});

test("threatWeapon leaves a ranged weapon's numbers alone", () => {
  const w = threatWeapon(entry("Rifle", { damage: 9, ed: "1d3", ap: -1, salvo: 2, range: [12, 30, 60] }), 6);
  assert.deepEqual(
    { damage: w.damage, ed: w.ed, ap: w.ap, salvo: w.salvo, range: w.range },
    {
      damage: 9,
      ed: "1d3",
      ap: -1,
      salvo: 2,
      range: [12, 30, 60],
    },
  );
  assert.equal(w.countsStrength, undefined);
});

test("threatWeapon turns a thrown S × N into metres (Core p.208)", () => {
  const grenade = threatWeapon(entry("Grenade", { damage: 10, ed: 2, thrown: 3 }), 5);
  assert.deepEqual(grenade.range, [15]);
  assert.equal(grenade.thrown, 3); // kept, so the range can follow a new Strength (rules-flow.md §11.165)
  // A knife thrown as well as swung keeps its reach and notes the throw, as the sheet does.
  const knife = threatWeapon(entry("Knife", { addStrength: true, damage: 1, ed: 1, range: [1], thrown: 2 }), 4);
  assert.deepEqual(knife.range, [1]);
  assert.equal(knife.damage, 5);
  assert.deepEqual(knife.traits, ["Thrown (8 m)"]);
});

test("threatWeapon keeps a count and a null Salvo as printed", () => {
  const w = threatWeapon(entry("Stikkbombz", { count: 2, damage: 8, ed: 1, salvo: null, thrown: 2 }), 4);
  assert.equal(w.count, 2);
  assert.equal(w.salvo, null);
  assert.deepEqual(w.range, [8]);
});

// rules-flow.md §11.165: a weapon follows a new Strength only where it is marked.
test("weaponAtStrength moves a Damage that counts S, and nothing else", () => {
  const S = { from: 4, to: 6 };
  assert.equal(weaponAtStrength({ damage: 6, range: [1], countsStrength: true as const }, S).damage, 8);
  assert.equal(weaponAtStrength({ damage: 5, range: [1] }, S).damage, 5);
  assert.equal(weaponAtStrength({ damage: 10, range: [12, 24, 36] }, S).damage, 10);
});

test("weaponAtStrength throws S × N again, in the range or a swung weapon's trait (Core p.208)", () => {
  const S = { from: 4, to: 5 };
  assert.deepEqual(weaponAtStrength({ damage: 10, range: [12], thrown: 3 }, S).range, [15]);
  // A spear with a reach of 2 and a throw keeps its reach (Singing Spear, Core p.213).
  const spear = threatWeapon(entry("Spear", { addStrength: true, damage: 6, ed: 1, range: [2], thrown: 5 }), 4);
  const moved = weaponAtStrength(spear, S);
  assert.deepEqual([moved.range, moved.damage, moved.traits], [[2], 11, ["Thrown (25 m)"]]);
});

test("isMeleeWeapon: any melee reach, not a throw", () => {
  assert.equal(isMeleeWeapon({ damage: 6, range: [1] }), true);
  assert.equal(isMeleeWeapon({ damage: 6, range: [2], countsStrength: true as const }), true);
  assert.equal(isMeleeWeapon({ damage: 6, range: [3], thrown: 1 }), false);
  assert.equal(isMeleeWeapon({ damage: 6, range: [12, 24, 36] }), false);
});

test("withTypedRange: a typed range ends a throw's link, a typed reach keeps a blade's", () => {
  const grenade = { damage: 10, range: [12], thrown: 3 };
  assert.equal(withTypedRange(grenade, [20]).thrown, undefined);
  assert.equal(withTypedRange(grenade, [3]).thrown, undefined);
  const spear = { damage: 10, range: [2], countsStrength: true as const, thrown: 5, traits: ["Thrown (20 m)"] };
  assert.deepEqual([withTypedRange(spear, [3]).countsStrength, withTypedRange(spear, [3]).thrown], [true, 5]);
  assert.deepEqual(
    [withTypedRange(spear, [12]).countsStrength, withTypedRange(spear, [12]).thrown],
    [undefined, undefined],
  );
});

// Advanced Creation's Wargear table (Core p.39); the readings are rules-flow.md §11.128–130.
const piece = (value: number | null, rarity: Wargear["rarity"], name = "Thing") => ({ name, value, rarity });
const messages = (items: ReturnType<typeof piece>[], tier: number) =>
  advancedWargearProblems(items, tier).map((p) => p.what);

test("advancedWargearProblems: Tier 1 totals stay under 15 with no piece over 7 and nothing Rare", () => {
  assert.deepEqual(messages([piece(7, "Uncommon"), piece(7, "Common")], 1), []);
  assert.equal(
    messages([piece(7, "Common"), piece(7, "Common"), piece(1, "Common")], 1).length,
    1,
    "15 is not under 15",
  );
  assert.ok(messages([piece(8, "Common")], 1)[0]!.includes("maximum of 7"));
  assert.ok(messages([piece(3, "Rare")], 1)[0]!.includes("allows 0"));
});

test("advancedWargearProblems: Tier 2 allows two Rare, Tier 3 adds one Very Rare, Tier 4 two and no Max. Value", () => {
  assert.deepEqual(messages([piece(5, "Rare"), piece(5, "Rare"), piece(9, "Common")], 2), []);
  assert.equal(messages([piece(2, "Rare"), piece(2, "Rare"), piece(2, "Rare")], 2).length, 1);
  assert.equal(messages([piece(2, "Very Rare")], 2).length, 1);
  assert.deepEqual(
    messages([piece(10, "Very Rare"), piece(5, "Rare"), piece(5, "Rare")], 3),
    [],
    "the Rare allowance carries up",
  );
  assert.equal(messages([piece(2, "Very Rare"), piece(2, "Very Rare")], 3).length, 1);
  assert.deepEqual(messages([piece(14, "Very Rare"), piece(14, "Very Rare")], 4), []);
  assert.equal(messages([piece(30, "Common")], 4).length, 1, "Total Value still applies at Tier 4");
});

test("advancedWargearProblems: Unique never fits, an unpriced piece and a Tier 5 are the GM's call", () => {
  assert.ok(messages([piece(1, "Unique")], 4)[0]!.includes("Unique"));
  const gm = advancedWargearProblems([piece(null, "Common")], 1);
  assert.ok(gm[0]!.gm);
  const t5 = advancedWargearProblems([piece(1, "Common")], 5);
  assert.deepEqual(
    t5.map((p) => p.gm),
    [true],
  );
});
