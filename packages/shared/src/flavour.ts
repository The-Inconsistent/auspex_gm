import { Dice, roll, rowsFor } from "./roll-table.ts";

// ROLL NAME and ROLL LOOK in the NPC editor (GitHub issue #48): the creation catalogue's flavour tables, rolled in prep
// only, as `roll-table.ts` rolls the event tables; a Test stays physical dice (rules-flow.md §7). A roll fills an editable field; nothing is saved until the GM's SAVE.

type Table = { columns: string[]; rows: string[][] };
type Rng = () => number; // [0, 1), Math.random by default, a fixed sequence in tests

// One roll's result: one cell, or two where the row says "roll twice". `rolls`: what was looked up, after any modifier
// and cap. `column`: the Features type the first d6 picked ("Augmetic").
export type Rolled = { cells: string[]; rolls: number[]; dice: string; column?: string };

const ELEMENT = /^Element \d/;
const TYPED = /^(\d) (.+)$/; // Features' "1 Augmetic" … "6 Detail" (Core p.33)
const TWICE = /roll twice/i; // Eye Colour 12, "Mismatched – roll twice" (Core p.32)

const pick = (list: string[], rng: Rng) => list[Math.floor(rng() * list.length)]!;
const d6Of = (rng: Rng) => () => 1 + Math.floor(rng() * 6);

// A printed row key, "7" or "11-16", as the inclusive range `rowsFor` reads.
export function keyRange(key: string): { from: number; to: number } {
  const m = /^(\d+)(?:[-–](\d+))?$/.exec(key.trim());
  if (!m) throw new Error(`"${key}" isn't a row key`);
  return { from: Number(m[1]), to: Number(m[2] ?? m[1]) };
}

// A name list (Core pp.27–28, FSPG p.92) is one "Name" column; Asuryani and Drukhari names (IoE pp.12, 15) are two
// independent Element lists, padded with empty cells.
export const isNameTable = (t: Table) =>
  (t.columns.length === 1 && t.columns[0] === "Name") || t.columns.every((c) => ELEMENT.test(c));

// One roll on a flavour table, by its shape: a uniform pick from a list (empty padding is never picked), one pick per
// Element column, a d6 for a Features type then a d6 for the row, or the header's dice (`add` on top, capped at the
// last row, rules-flow §11.90) on `column` or the one value column.
export function rollOn(
  t: Table,
  { column, add = 0, rng = Math.random }: { column?: string; add?: number; rng?: Rng } = {},
): Rolled {
  const d6 = d6Of(rng);
  const dice = Dice.safeParse(t.columns[0]);
  if (!dice.success) {
    if (t.columns.length !== 1 && !t.columns.every((c) => ELEMENT.test(c))) throw new Error("not a rollable table");
    const cells = t.columns.map((_, i) => pick(t.rows.map((r) => r[i] ?? "").filter(Boolean), rng));
    return { cells, rolls: [], dice: "" };
  }
  const typed = t.columns.slice(1).map((c) => TYPED.exec(c));
  if (typed.length > 1 && typed.every(Boolean)) {
    const [type, n] = [d6(), d6()];
    const row = t.rows.find((r) => Number(r[0]) === n)!;
    return { cells: [row[type]!], rolls: [type, n], dice: dice.data, column: typed[type - 1]![2] };
  }
  const col = column ? t.columns.indexOf(column) : 1;
  if (col < 1) throw new Error(`no column "${column}"`);
  const rows = t.rows.map((r) => ({ ...keyRange(r[0]!), cell: r[col]! }));
  const top = Math.max(...rows.map((r) => r.to));
  const rolls: number[] = [];
  const once = () => {
    const n = Math.min(roll(dice.data, d6) + add, top);
    rolls.push(n);
    return rowsFor(rows, n)[0]!.cell;
  };
  const plain = () => {
    let cell = once();
    while (TWICE.test(cell)) cell = once(); // "roll twice" one level only: a re-roll on it rolls again
    return cell;
  };
  const label = add ? `${dice.data}+${add}` : dice.data;
  const first = once();
  if (!TWICE.test(first)) return { cells: [first], rolls, dice: label };
  // "Mismatched": the second roll re-rolls the first's colour (rules-flow §11.90).
  const a = plain();
  let b = plain();
  while (b === a) b = plain();
  return { cells: [a, b], rolls, dice: label };
}

// ROLL LOOK's species chips (Core p.32): Astartes roll their mortal kin's Eye and Hair tables, Aeldari add 3 to Eye
// Colour and use the Aeldari Hair column, Orks share blood-red eyes and none with hair has been recorded.
export const LOOK = {
  human: { label: "HUMAN / ASTARTES", hair: "Human Hair", eyeAdd: 0 },
  aeldari: { label: "AELDARI", hair: "Aeldari Hair", eyeAdd: 3 },
  ork: { label: "ORK", hair: null, eyeAdd: 0, eyes: "Blood-red" },
} satisfies Record<string, { label: string; hair: string | null; eyeAdd: number; eyes?: string }>;
export type LookSpecies = keyof typeof LOOK;
// The tables ROLL LOOK reads (Core pp.32–33), which `/flavour` serves beside the name lists.
export const LOOK_TABLE_IDS = ["eye-colour", "hair-colour", "features"] as const;

// Hair, eyes and one Feature (Core pp.32–33) as a line for DESCRIPTION (rules-flow §11.91), and the dice that made
// it ("HAIR d66 → 44"). Null when a table is missing; the editor disables ROLL LOOK then.
export function rollLook({
  tables,
  species,
  rng = Math.random,
}: {
  tables: readonly (Table & { id: string })[];
  species: LookSpecies;
  rng?: Rng;
}): { line: string; dice: string[] } | null {
  const [eyes, hair, features] = LOOK_TABLE_IDS.map((id) => tables.find((t) => t.id === id));
  if (!eyes || !hair || !features) return null;
  const rule: { hair: string | null; eyeAdd: number; eyes?: string } = LOOK[species];
  const parts: string[] = [];
  const dice: string[] = [];
  const said = (what: string, r: Rolled) => dice.push(`${what} ${r.dice} → ${r.rolls.join(", ")}`);
  if (rule.hair) {
    const r = rollOn(hair, { column: rule.hair, rng });
    parts.push(`${r.cells[0]} hair`);
    said("HAIR", r);
  }
  if (rule.eyes) parts.push(`${rule.eyes} eyes`);
  else {
    const r = rollOn(eyes, { add: rule.eyeAdd, rng });
    parts.push(r.cells.length > 1 ? `mismatched ${r.cells.join(" and ")} eyes` : `${r.cells[0]} eyes`);
    said("EYES", r);
  }
  const f = rollOn(features, { rng });
  said("FEATURE", f);
  // An Augmetic cell names the body part ("Hand"); the other types are whole phrases.
  const feature = f.column === "Augmetic" ? `Augmetic ${f.cells[0]!.toLowerCase()}` : f.cells[0]!.replace(/\.$/, "");
  const first = parts.join(", ");
  return { line: `${first[0]!.toUpperCase()}${first.slice(1)}. ${feature}.`, dice };
}
