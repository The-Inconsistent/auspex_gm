import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isNameTable, keyRange, rollLook, rollOn } from "./flavour.ts";
import { results, tableProblems } from "./roll-table.ts";

type Table = { id: string; columns: string[]; rows: string[][] };
const book = (file: string): Table[] =>
  JSON.parse(readFileSync(new URL(`../../data/creation/flavour/${file}.json`, import.meta.url), "utf8"));
const core = book("core");
const embers = book("inheritance-of-embers");
const table = (list: Table[], id: string) => list.find((t) => t.id === id)!;
const [eyes, hair, features] = ["eye-colour", "hair-colour", "features"].map((id) => table(core, id)) as [
  Table,
  Table,
  Table,
];

// A fixed random source: each number is one draw in [0, 1).
const seq =
  (...xs: number[]) =>
  () =>
    xs.shift()!;
const face = (f: number) => (f - 0.5) / 6; // the draw that rolls f on a d6
const faces = (...fs: number[]) => seq(...fs.map(face));
const at = (i: number, n: number) => (i + 0.5) / n; // the draw that picks index i of n

test("every d66 result lands on exactly one Hair Colour row (Core p.32)", () => {
  assert.deepEqual(
    tableProblems({ dice: "d66", rows: hair.rows.map((r) => keyRange(r[0]!)), gaps: [], overlaps: [] }),
    [],
  );
  for (const n of results("d66")) {
    const r = rollOn(hair, { rng: faces(Math.floor(n / 10), n % 10) });
    assert.equal(r.cells.length, 1);
    assert.equal(r.rolls[0], n);
  }
  assert.deepEqual(rollOn(hair, { rng: faces(1, 1) }).cells, ["Mud Brown"]);
  assert.deepEqual(rollOn(hair, { rng: faces(6, 6) }).cells, ["Brick Red"]);
  assert.deepEqual(rollOn(hair, { column: "Aeldari Hair", rng: faces(6, 6) }).cells, ["Platinum"]);
});

test("Eye Colour rolls 2d6, and a 12 rolls twice (Core p.32)", () => {
  assert.deepEqual(rollOn(eyes, { rng: faces(3, 4) }).cells, ["Icy Blue"]);
  const twice = rollOn(eyes, { rng: faces(6, 6, 4, 4, 5, 6) });
  assert.deepEqual(twice.cells, ["Grey", "Purple"]);
  assert.deepEqual(twice.rolls, [12, 8, 11]);
  // Mismatched eyes are two colours: a second roll on the first's colour rolls again (§11.90).
  assert.deepEqual(rollOn(eyes, { rng: faces(6, 6, 5, 6, 6, 5, 3, 4) }).cells, ["Purple", "Icy Blue"]);
  // A re-roll that lands on "roll twice" again rolls again, so both cells are colours.
  assert.deepEqual(rollOn(eyes, { rng: faces(6, 6, 6, 6, 1, 1, 3, 4) }).cells, ["Black", "Icy Blue"]);
});

test("Aeldari add 3 to Eye Colour, capped at the last row (rules-flow §11.90)", () => {
  const r = rollOn(eyes, { add: 3, rng: faces(2, 2) });
  assert.deepEqual(r, { cells: ["Icy Blue"], rolls: [7], dice: "2d6+3" });
  const capped = rollOn(eyes, { add: 3, rng: faces(6, 5, 1, 1, 1, 2) });
  assert.equal(capped.rolls[0], 12, "6 + 5 + 3 = 14 reads row 12");
  assert.deepEqual(capped.cells, ["Pale Blue", "Murky Blue"], "each re-roll adds 3 too");
});

test("a name list picks uniformly and never an empty cell", () => {
  const humans = table(core, "human-names");
  const picked = humans.rows.map((_, i) => rollOn(humans, { rng: seq(at(i, humans.rows.length)) }).cells[0]);
  assert.deepEqual(
    picked,
    humans.rows.map((r) => r[0]),
  );
  assert.ok(isNameTable(humans) && !isNameTable(eyes) && !isNameTable(table(core, "ten-questions")));
});

test("Element 1 and Element 2 are picked independently, skipping the padding (IoE pp.12, 15)", () => {
  const asuryani = table(embers, "asuryani-names");
  assert.ok(isNameTable(asuryani));
  const e1 = asuryani.rows.map((r) => r[0]!).filter(Boolean);
  const e2 = asuryani.rows.map((r) => r[1]!).filter(Boolean);
  const r = rollOn(asuryani, { rng: seq(at(e1.indexOf("Yvraine"), e1.length), at(0, e2.length)) });
  assert.deepEqual(r.cells, ["Yvraine", "Born of Twilight"]);
  for (const t of [asuryani, table(embers, "drukhari-names")])
    for (let i = 0; i < 200; i++) assert.ok(rollOn(t).cells.every(Boolean));
});

test("Features rolls a d6 for the type, then a d6 for the row (Core p.33)", () => {
  assert.deepEqual(rollOn(features, { rng: faces(4, 1) }), {
    cells: ["Prays constantly under their breath"],
    rolls: [4, 1],
    dice: "d6",
    column: "Habit",
  });
  assert.equal(rollOn(features, { rng: faces(1, 6) }).column, "Augmetic");
});

test("ROLL LOOK writes hair, eyes and a Feature, by species (Core p.32)", () => {
  assert.deepEqual(rollLook({ tables: core, species: "human", rng: faces(1, 1, 3, 4, 4, 1) }), {
    line: "Mud Brown hair, Icy Blue eyes. Prays constantly under their breath.",
    dice: ["HAIR d66 → 11", "EYES 2d6 → 7", "FEATURE d6 → 4, 1"],
  });
  assert.equal(
    rollLook({ tables: core, species: "aeldari", rng: faces(1, 1, 2, 2, 1, 1) })?.line,
    "Jet Black hair, Icy Blue eyes. Augmetic hand.",
    "Aeldari hair column, eyes 4 + 3",
  );
  assert.deepEqual(rollLook({ tables: core, species: "ork", rng: faces(6, 3) }), {
    line: "Blood-red eyes. A smattering of freckles.",
    dice: ["FEATURE d6 → 6, 3"],
  });
  assert.equal(
    rollLook({ tables: core, species: "human", rng: faces(1, 1, 6, 6, 4, 4, 5, 6, 4, 1) })?.line,
    "Mud Brown hair, mismatched Grey and Purple eyes. Prays constantly under their breath.",
  );
  assert.equal(rollLook({ tables: [], species: "human" }), null);
});
