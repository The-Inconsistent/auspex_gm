import { z } from "zod";
import type { ActionInput } from "./actions.ts";
import { rowsFor } from "./roll-table.ts";
import { Source } from "./source.ts";

// The Critical Hit table and Perils of the Warp, which the GM reads most mid-fight (rules-flow.md §11.120). The app
// never rolls on them: the GM types the d66 from the physical dice, the app shows the printed row, and only its
// mechanical part is applied, through the existing damage and Condition actions. GM-only book data, served inside
// /scene-presets (docs/data.md, Copyright).

// What a row does to the target, besides narration. `amount` is printed; `dice` ("1d3") is rolled at the table and the
// GM types the result. Conditions are named as in CONDITIONS (state.ts). A Condition the target already holds isn't added again;
// ponytail: no stacking ("Hindered (2)"), add it if a transcribed row needs it.
export const LookupApply = z.union([
  z.object({ kind: z.enum(["wounds", "shock"]), amount: z.number().int().positive().max(100) }),
  z.object({ kind: z.enum(["wounds", "shock"]), dice: z.string().trim().min(1).max(20) }),
  z.object({ kind: z.literal("condition"), condition: z.string().trim().min(1).max(60) }),
]);
export type LookupApply = z.infer<typeof LookupApply>;

const row = {
  name: z.string().min(1).max(100),
  text: z.string().min(1).max(2000), // verbatim narration and effect
  apply: z.array(LookupApply).max(6).default([]),
};

// Critical Hit (Core p.198, d66). A Critical Hit is a hit with a Wrath Die of 6 (§5). `glorious` is the Glorious
// Criticals column (Core pp.197–198): its text, with the Glory price as printed. The app shows it and spends nothing.
export const CritRow = z.object({
  from: z.number().int().min(11).max(66),
  to: z.number().int().min(11).max(66),
  ...row,
  glorious: z.string().min(1).max(2000).optional(),
});
export type CritRow = z.infer<typeof CritRow>;

// Perils of the Warp: d66 plus 10 per extra Wrath Die showing 1 (§8), so a result can pass 66. The last row's `to` may
// be null: open-ended, for whatever the book prints at the top (not assumed here).
export const PerilsRow = z.object({
  from: z.number().int().min(11),
  to: z.number().int().min(11).nullable(),
  ...row,
});
export type PerilsRow = z.infer<typeof PerilsRow>;

const base = {
  source: Source,
  // printed page; null until transcribed (the Perils page is read from the book with its rows)
  page: z.number().int().positive().nullable(),
  dice: z.literal("d66"),
};
export const CritTable = z.object({ ...base, rows: z.array(CritRow) });
export type CritTable = z.infer<typeof CritTable>;
export const PerilsTable = z.object({ ...base, rows: z.array(PerilsRow) });
export type PerilsTable = z.infer<typeof PerilsTable>;

export const Lookups = z.object({ criticalHits: CritTable, perils: PerilsTable });
export type Lookups = z.infer<typeof Lookups>;

// A d66 reads one die as tens and one as units, so both digits are 1–6 (Core p.170).
export const isD66 = (n: number) => Number.isInteger(n) && n >= 11 && n <= 66 && n % 10 >= 1 && n % 10 <= 6;

// Perils: the d66 plus 10 per extra Wrath Die showing 1 (§8).
export const perilsResult = (d66: number, extraOnes: number): number => d66 + 10 * Math.max(0, extraOnes);

// The row(s) a result lands on: none in an unprinted gap or an empty table, two where the book prints an overlap.
export const lookup = <R extends { from: number; to: number | null }>(table: { rows: R[] }, result: number): R[] =>
  rowsFor(
    table.rows.map((r, i) => ({ from: r.from, to: r.to ?? Infinity, i })),
    result,
  ).map((r) => table.rows[r.i]!);

// What's wrong with a Perils table's ranges, where tableProblems (a closed d66 grid) can't be used: each starts at or
// below its end, none overlaps the next, and only the last is open-ended.
export function openRangeProblems(rows: { from: number; to: number | null }[]): string[] {
  const sorted = [...rows].sort((a, b) => a.from - b.from);
  const problems: string[] = [];
  sorted.forEach((r, i) => {
    if (r.to !== null && r.from > r.to) problems.push(`${r.from}–${r.to} runs backwards`);
    const next = sorted[i + 1];
    if (next && (r.to === null || r.to >= next.from))
      problems.push(`${r.from}–${r.to ?? "open"} overlaps ${next.from}`);
  });
  return problems;
}

export type LookupTarget =
  | { kind: "pc"; id: string; conditions: string[] } // the character's id
  | { kind: "threat"; id: string; conditions: string[] }; // the combatant's id

// The dice amounts a row needs typed in, one per `dice` item in order; the GM rolls them at the table.
export const diceNeeded = (row: { apply: LookupApply[] }): string[] =>
  row.apply.flatMap((a) => ("dice" in a ? [a.dice] : []));

// The actions that apply a row's mechanical part to the target: Wounds and Shock as positive deltas (the damage rules
// run server-side), Conditions added to the ones held. `typed` lists the dice results in order; a missing or
// non-positive one skips that item. Nothing is returned for a row with nothing to apply.
export function applyActions({
  row,
  target,
  typed = [],
}: {
  row: { apply: LookupApply[] };
  target: LookupTarget;
  typed?: number[];
}): ActionInput[] {
  let t = 0;
  const hit: { wounds?: number; shock?: number } = {};
  const conditions = [...target.conditions];
  for (const a of row.apply) {
    if (a.kind === "condition") {
      if (!conditions.includes(a.condition)) conditions.push(a.condition);
      continue;
    }
    const n = "amount" in a ? a.amount : typed[t++];
    if (n && n > 0) hit[a.kind] = (hit[a.kind] ?? 0) + n;
  }
  // Conditions go first: a hit can add one on its own (an automatic Prone), and a later update from the list read
  // before the hit would drop it.
  const out: ActionInput[] = [];
  if (conditions.length > target.conditions.length)
    out.push(
      target.kind === "pc"
        ? { type: "character.update", id: target.id, conditions }
        : { type: "combatant.update", id: target.id, conditions },
    );
  if (hit.wounds || hit.shock)
    out.push(
      target.kind === "pc"
        ? { type: "character.adjust", id: target.id, ...hit }
        : { type: "combatant.adjust", id: target.id, ...hit },
    );
  return out;
}
