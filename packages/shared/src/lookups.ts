import { z } from "zod";
import type { ActionInput } from "./actions.ts";
import { rowsFor } from "./roll-table.ts";
import { Source } from "./source.ts";

// The Critical Hit table and Perils of the Warp, which the GM reads most mid-fight (rules-flow.md §11.125). The app
// never rolls on them: the GM types the d66 from the physical dice, the app shows the printed row, and only its
// mechanical part is applied, through the existing damage and Condition actions. GM-only book data, served inside
// /scene-presets (docs/data.md, Copyright).

// What a row does to the target, besides narration. `amount` is printed; `dice` ("1d3", "1d3+1") is rolled at the table and
// the GM types the result. Conditions are named as in CONDITIONS (state.ts). A Condition the target already holds isn't
// added again; ponytail: no stacking ("Hindered (2)"), add it if a transcribed row needs it.
// `mortal` is Mortal Wounds (Core p.193) and `corruption` is Corruption (an Agent only; Threats have none).
const Dice = z
  .string()
  .trim()
  .max(20)
  .regex(/^\d+d\d+(\+\d+)?$/, "dice such as 1d3 or 1d3+1");
const Amount = z.number().int().positive().max(100);
export const LookupApply = z.union([
  z.object({ kind: z.enum(["wounds", "shock", "mortal", "corruption"]), amount: Amount }),
  z.object({ kind: z.enum(["wounds", "shock", "mortal", "corruption"]), dice: Dice }),
  z.object({ kind: z.literal("condition"), condition: z.string().trim().min(1).max(60) }),
]);
export type LookupApply = z.infer<typeof LookupApply>;

// Glorious Criticals (Core p.197: spend Glory to improve a Critical Hit, and sometimes there is more than one effect to
// choose from). `each` applies once per Glory spent, `first` once if at least 1 is spent, and `choose` is a pick of one
// option per Glory spent, applied in addition to `each`.
export const CritGlory = z.object({
  each: z.array(LookupApply).max(6).default([]),
  first: z.array(LookupApply).max(6).optional(),
  choose: z
    .array(z.object({ label: z.string().trim().min(1).max(60), apply: z.array(LookupApply).max(6) }))
    .max(6)
    .optional(),
});
export type CritGlory = z.infer<typeof CritGlory>;

const row = {
  name: z.string().min(1).max(100),
  text: z.string().min(1).max(2000), // verbatim narration and effect
  apply: z.array(LookupApply).max(6).default([]),
};

// Critical Hit (Core p.198, d66). A Critical Hit is a hit with a Wrath Die of 6 (§5). `glorious` is the Glorious
// Criticals column (Core pp.197–198) as printed; `glory` is its structured reading, which applyActions spends and applies.
export const CritRow = z.object({
  from: z.number().int().min(11).max(66),
  to: z.number().int().min(11).max(66),
  ...row,
  glorious: z.string().min(1).max(2000).optional(),
  glory: CritGlory.optional(),
});
export type CritRow = z.infer<typeof CritRow>;

// Perils of the Warp (Core pp.263–264): d66 plus 10 per extra Wrath Die showing 1 (§8), so a result can pass 66; the
// book prints rows up to 105–106. A `to` of null is open-ended, for a table that prints one.
export const PerilsRow = z.object({
  from: z.number().int().min(11),
  to: z.number().int().min(11).nullable(),
  ...row,
});
export type PerilsRow = z.infer<typeof PerilsRow>;

const base = {
  source: Source,
  // printed page; null for a table not transcribed yet
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

// A Perils total above the table's highest printed `to` reads the top row (house decision §11.155: Core p.263 prints
// rows up to 105–106 and doesn't say what a higher total does). `result` stays the real total. An open-ended table
// has no top, so nothing is capped.
export function perilsRow(
  table: PerilsTable,
  d66: number,
  extraOnes: number,
): { result: number; row: PerilsRow | null } {
  const result = perilsResult(d66, extraOnes);
  const top = table.rows.reduce<PerilsRow | null>(
    (best, r) => (r.to !== null && (!best || (best.to ?? 0) < r.to) ? r : best),
    null,
  );
  const capped = top !== null && top.to !== null && result > top.to && table.rows.every((r) => r.to !== null);
  return { result, row: capped ? top : (lookup(table, result)[0] ?? null) };
}

// The dice amounts a row needs typed in, one per `dice` item in order; the GM rolls them at the table.
export const diceNeeded = (row: { apply: LookupApply[] }): string[] =>
  row.apply.flatMap((a) => ("dice" in a ? [a.dice] : []));

// The actions that apply a row's mechanical part to the target, in this order, so the first refusal stops the rest:
// the Glory spend (not having it refuses everything), Conditions, Wounds and Shock, then Corruption. Wounds and Shock
// are positive deltas (the damage rules run server-side). Mortal Wounds are plain Wounds: they ignore Resilience (Core
// p.193) and the app's Wounds are counted after it. Corruption goes through character.corrupt for an Agent (so the
// Mutation prompts run) and is skipped for a Threat. Glory (p.197): `spent` points, `picks` one option index per Glory
// when the row has `choose`. `typed` lists the row's dice results in order; a missing or non-positive one skips that
// item, and a Glory effect never rolls dice. Nothing is returned for a row with nothing to apply.
export function applyActions({
  row,
  target,
  typed = [],
  glory,
}: {
  row: { apply: LookupApply[]; glory?: CritGlory };
  target: LookupTarget;
  typed?: number[];
  glory?: { spent: number; picks?: number[] };
}): ActionInput[] {
  let t = 0;
  const hit: { wounds?: number; shock?: number } = {};
  let corruption = 0;
  const conditions = [...target.conditions];
  const take = (a: LookupApply, n: number | undefined) => {
    if (a.kind === "condition") {
      if (!conditions.includes(a.condition)) conditions.push(a.condition);
    } else if (n && n > 0) {
      if (a.kind === "corruption") corruption += n;
      else {
        const k = a.kind === "mortal" ? "wounds" : a.kind;
        hit[k] = (hit[k] ?? 0) + n;
      }
    }
  };
  for (const a of row.apply) take(a, "amount" in a ? a.amount : "dice" in a ? typed[t++] : undefined);
  const spent = row.glory ? Math.max(0, Math.trunc(glory?.spent ?? 0)) : 0;
  if (row.glory && spent > 0) {
    const g = row.glory;
    const amountOf = (a: LookupApply) => ("amount" in a ? a.amount : undefined);
    for (const a of g.first ?? []) take(a, amountOf(a));
    for (let i = 0; i < spent; i++) {
      for (const a of g.each) take(a, amountOf(a));
      for (const a of g.choose?.[glory?.picks?.[i] ?? -1]?.apply ?? []) take(a, amountOf(a));
    }
  }
  // Conditions go before damage: a hit can add one on its own (an automatic Prone), and a later update from the list
  // read before the hit would drop it.
  const out: ActionInput[] = [];
  if (spent > 0) out.push({ type: "pool.adjust", pool: "glory", delta: -spent });
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
  if (corruption > 0 && target.kind === "pc") out.push({ type: "character.corrupt", id: target.id, delta: corruption });
  return out;
}
