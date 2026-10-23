import { z } from "zod";
import { Rarity } from "./requisition.ts";
import { rowsFor, tableProblems } from "./roll-table.ts";
import { Source } from "./source.ts";
import { MutationMods, type SheetMutation } from "./state.ts";
import { WargearWeapon, isMeleeProfile } from "./wargear.ts";

// Mutations (Core pp.287–295, issue #182): a failed Mutation Test rolls a d6 for severity, then a d66 on that
// severity's table. Book text, so like the scene presets it is served to the GM only.

export const SEVERITIES = ["subtle", "minor", "severe"] as const;
export const Severity = z.enum(SEVERITIES);
export type Severity = z.infer<typeof Severity>;

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

type Entry = z.infer<typeof MutationEntry>;

// A mutation as it lands on the sheet: a d6 table's row folds into its parent's line (Extra Appendage: Strong Arm),
// with both mods. Rows whose rules sit in the flavour (Extra Appendages' Persuasion penalty) keep that text.
export function sheetMutation(row: Entry, sub?: Entry): SheetMutation {
  const sum = <K extends string>(a: Partial<Record<K, number>>, b: Partial<Record<K, number>> = {}) => {
    const out = { ...a };
    for (const [k, v] of Object.entries(b) as [K, number][]) out[k] = (out[k] ?? 0) + v;
    return out;
  };
  return {
    id: row.id,
    name: sub ? `${row.name}: ${sub.name}` : row.name,
    page: row.page,
    effect: [row.effect || row.text, sub && (sub.effect || sub.text)].filter(Boolean).join("\n\n"),
    mods: {
      attributes: sum(row.mods.attributes, sub?.mods.attributes),
      skills: sum(row.mods.skills, sub?.mods.skills),
      traits: sum(row.mods.traits, sub?.mods.traits),
    },
    weapons: [...row.weapons, ...(sub?.weapons ?? [])].map(({ name, profile }) => ({
      name,
      ...profile,
      range: profile.range ?? [1],
      melee: isMeleeProfile({ ...profile, range: profile.range ?? [1] }),
    })),
  };
}

// A printed mutation by id (not a d6 table's row, nor a row that sends the roll on), for character.mutate.
export type Mutation = Extract<MutationRow, { includes: string[] }>;
export const findMutation = (tables: MutationTable[], id: string): Mutation | undefined =>
  tables.flatMap((t) => t.rows).find((r): r is Mutation => !("forward" in r) && r.id === id);
