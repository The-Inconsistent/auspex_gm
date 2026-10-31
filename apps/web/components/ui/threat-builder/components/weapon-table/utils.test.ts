import { test } from "node:test";
import assert from "node:assert/strict";

import { blankDraft } from "../../constants";
import { parseAp, parseEd, parseRange, parseSalvo, rangeText, salvoText, withStrength } from "./utils";

test("RANGE reads MELEE, one number, or three bands", () => {
  assert.deepEqual(parseRange("melee"), { value: [1] });
  assert.deepEqual(parseRange("48"), { value: [48] });
  assert.deepEqual(parseRange("12 / 24 / 36"), { value: [12, 24, 36] });
  assert.deepEqual(parseRange("12-24-36"), { value: [12, 24, 36] });
  assert.equal(parseRange("12 / 24 / 36 / 48"), null);
  assert.equal(parseRange("0"), null);
  assert.equal(parseRange("far"), null);
  assert.equal(rangeText([1]), "MELEE");
  assert.equal(rangeText([12, 24, 36]), "12 / 24 / 36");
});

test("ED takes a number or a roll", () => {
  assert.deepEqual(parseEd("2"), { value: 2 });
  assert.deepEqual(parseEd("1d3"), { value: "1d3" });
  assert.deepEqual(parseEd("D6"), { value: "d6" });
  assert.equal(parseEd("lots"), null);
});

test("AP is negative or absent, whatever sign was typed", () => {
  assert.deepEqual(parseAp("-2"), { value: -2 });
  assert.deepEqual(parseAp("–3"), { value: -3 });
  assert.deepEqual(parseAp("2"), { value: -2 });
  assert.deepEqual(parseAp(""), { value: undefined });
  assert.deepEqual(parseAp("0"), { value: undefined });
  assert.equal(parseAp("x"), null);
});

test("SALVO keeps a printed dash apart from no salvo at all", () => {
  assert.deepEqual(parseSalvo("–"), { value: null });
  assert.deepEqual(parseSalvo(""), { value: undefined });
  assert.deepEqual(parseSalvo("3"), { value: 3 });
  assert.equal(parseSalvo("x"), null);
  assert.equal(salvoText(null), "–");
  assert.equal(salvoText(undefined), "");
});

// rules-flow.md §11.165: only a weapon marked countsStrength moves with S.
test("a new Strength moves the Damage that counts it, and nothing else", () => {
  const d = {
    ...blankDraft(),
    attributes: { ...blankDraft().attributes, S: 4 },
    abilities: [
      {
        type: "ACTION" as const,
        weapons: [
          { name: "Bayonet", damage: 6, ed: 2, range: [1], countsStrength: true as const },
          { name: "Voidblade", damage: 5, ed: 1, range: [1] },
          { name: "Flayer", damage: 10, ed: 1, range: [12, 24, 36] },
        ],
      },
    ],
    mobAbilities: [{ weapons: [{ name: "Claw", damage: 5, ed: 1, range: [1], countsStrength: true as const }] }],
  };
  const out = withStrength(d, 6);
  assert.equal(out.attributes.S, 6);
  assert.deepEqual(
    out.abilities?.[0]?.weapons?.map((w) => w.damage),
    [8, 5, 10],
  );
  assert.equal(out.mobAbilities?.[0]?.weapons?.[0]?.damage, 7);
});

// rules-flow.md §11.165: a throw is S × N (Core p.208), in the range or, on a blade also thrown, in its trait.
test("a new Strength throws a thrown weapon S × N again", () => {
  const d = {
    ...blankDraft(),
    attributes: { ...blankDraft().attributes, S: 4 },
    abilities: [
      {
        type: "ACTION" as const,
        weapons: [
          { name: "Grenade", damage: 10, ed: 2, range: [12], thrown: 3 },
          {
            name: "Knife",
            damage: 5,
            ed: 1,
            range: [1],
            countsStrength: true as const,
            thrown: 2,
            traits: ["Thrown (8 m)"],
          },
          { name: "Rock", damage: 3, ed: 0, range: [12] },
        ],
      },
    ],
  };
  const ws = withStrength(d, 5).abilities?.[0]?.weapons ?? [];
  assert.deepEqual(ws[0]?.range, [15]);
  assert.deepEqual([ws[1]?.range, ws[1]?.damage, ws[1]?.traits], [[1], 6, ["Thrown (10 m)"]]);
  assert.deepEqual(ws[2]?.range, [12]);
});
