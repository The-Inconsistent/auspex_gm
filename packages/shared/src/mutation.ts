import { z } from "zod";
import { Rarity } from "./requisition.ts";
import { rowsFor, tableProblems } from "./roll-table.ts";
import { Source } from "./source.ts";
import { ATTRIBUTES, Mods, SKILLS, type Skill } from "./state.ts";
import { WargearWeapon } from "./wargear.ts";

// Mutations (Core pp.287–295, issue #182): a failed Mutation Test rolls a d6 for severity, then a d66 on that
// severity's table. Book text, so like the scene presets it is served to the GM only.

export const SEVERITIES = ["subtle", "minor", "severe"] as const;
export const Severity = z.enum(SEVERITIES);
export type Severity = z.infer<typeof Severity>;

// What a mutation always changes on the sheet, as printed ("–1 Toughness", "reduces your Max Shock by 1"). Situational
// bonus dice and DN penalties ("+1 DN to Tests in daylight") stay in `effect` for the table.
export const MutationMods = z.object({
  attributes: z.partialRecord(z.enum(ATTRIBUTES), z.number().int().min(-5).max(5)).default({}),
  skills: z
    .partialRecord(z.enum(Object.keys(SKILLS) as [Skill, ...Skill[]]), z.number().int().min(-5).max(5))
    .default({}),
  traits: Mods.default({}),
});
export type MutationMods = z.infer<typeof MutationMods>;

const slug = z.string().regex(/^[a-z0-9-]+$/);

// One printed mutation, or one row of a mutation's own d6 table (Visions, Extra Appendages, Aberration).
const MutationEntry = z.object({
  id: slug, // unique across the file
  name: z.string().min(1).max(100), // as printed
  page: z.number().int().positive(), // printed page the entry starts on
  text: z.string().max(2000).default(""), // the flavour before "Effect:", verbatim
  effect: z.string().max(3000).default(""), // the "Effect:" paragraph, verbatim (without the word "Effect:")
  mods: MutationMods.default({ attributes: {}, skills: {}, traits: {} }),
  keywords: z.array(z.string().min(1).max(60)).max(4).default([]), // gained, as printed: Wyrdling's PSYKER
  weapons: z
    .array(z.object({ name: z.string().min(1).max(100), profile: WargearWeapon }))
    .max(4)
    .default([]),
  gear: z
    .array(z.object({ name: z.string().min(1).max(100), value: z.number().int().min(0), rarity: Rarity }))
    .default([]),
  gm: z.string().min(1).max(300).optional(), // a choice the GM or player makes that the app can't: which power, which look
});

const Ranged = { from: z.number().int(), to: z.number().int() };

// A mutation's own table, rolled after it lands (Visions d6, Extra Appendages d6, Aberration d6).
const SubTable = z
  .object({
    name: z.string().min(1).max(100),
    dice: z.literal("d6"),
    rows: z.array(MutationEntry.extend(Ranged)).min(1),
  })
  .superRefine((t, ctx) => {
    for (const message of tableProblems({ dice: t.dice, rows: t.rows, gaps: [], overlaps: [] }))
      ctx.addIssue({ code: "custom", message: `${t.name}: ${message}` });
  });

// A row of a severity table: a mutation, or the top row that sends the roll on ("61+ Roll on the Minor Mutations
// table"). The top row also takes every result over 66, from the +10 per mutation held (p.287).
const MutationRow = z.union([
  MutationEntry.extend({
    ...Ranged,
    sub: SubTable.optional(),
    includes: z.array(slug).max(4).default([]), // other mutations it brings (The Warp Made Manifest)
    extraRolls: z.number().int().min(0).max(3).default(0), // "roll 2 additional mutations"
  }),
  z.object({ ...Ranged, forward: Severity, text: z.string().min(1).max(200) }), // as printed
]);
export type MutationRow = z.infer<typeof MutationRow>;

export const MutationTable = z
  .object({
    severity: Severity,
    name: z.string().min(1).max(100), // as printed
    source: Source,
    page: z.number().int().positive(),
    rows: z.array(MutationRow).min(1),
  })
  .superRefine((t, ctx) => {
    for (const message of tableProblems({ dice: "d66", rows: t.rows, gaps: [], overlaps: [] }))
      ctx.addIssue({ code: "custom", message: `${t.name}: ${message}` });
  });
export type MutationTable = z.infer<typeof MutationTable>;

// The d6 for a failed Mutation Test's severity: 1–2 Subtle, 3–4 Minor, 5–6 Severe (Core p.287).
export const severityFor = (d6: number): Severity => (d6 <= 2 ? "subtle" : d6 <= 4 ? "minor" : "severe");

// The row a d66 lands on, after adding 10 for each mutation already held (p.287); past 66 is the top row. That row may
// send the roll on to another table, rolled the same way, +10s again (rules-flow.md §11.136). A held mutation landed on
// again is rerolled on the same table (p.287), which the caller sees from the id.
export function mutationRow(table: MutationTable, d66: number, held: number): MutationRow {
  const n = Math.min(66, d66 + 10 * held);
  return rowsFor(table.rows, n)[0] ?? table.rows.at(-1)!; // validate checks every d66 result has a row
}

// A mutation by id, a d6 table's row included, for character.mutate.
export function findMutation(tables: MutationTable[], id: string) {
  for (const t of tables)
    for (const row of t.rows) {
      if ("forward" in row) continue;
      if (row.id === id) return row;
      const sub = row.sub?.rows.find((r) => r.id === id);
      if (sub) return sub;
    }
}
