// The Mutation pack for InconsisTable (#325): one entry per printed Mutation, and one per row of a Mutation's own d6
// table carrying the parent's numbers with its own (sheetMutation folds them so), against the ruleset's held kind
// `mutations` (InconsisTable's house decision #88). Built from packages/data/mutations through its schema: names,
// pages, severity and the Mutation's mods as effects; no printed text. What a held record cannot carry (a weapon, gear,
// a Keyword, a choice) is said in the entry's own short summary, for the GM to add by hand.
import { ATTRIBUTES, type MutationMods, type MutationRow, type Severity } from "@wg/shared";
import { mutationTables } from "../index.ts";
import type { Pack } from "./pack.ts";
import { idOf } from "./ruleset.ts";
import { mutationKey } from "./tables.ts";

export type Effect = { path: string; mode: "add" | "override"; value: string; when?: string };
export interface MutationEntry {
  key: string;
  type: "mutation";
  name: string;
  tags: string[];
  cite: string;
  visibility: "gm";
  body: { severity: Severity; summary?: string };
  effects: Effect[];
}

/** The pack's slug and version, which a room document expects (room.ts). */
export const MUTATION_PACK = { slug: "wrath-and-glory-mutations", version: "0.1.0" } as const;
// The rulesets that declare the held kind `mutations` (0.1.9, 0.2.9).
const RULESET = { id: "wrath-and-glory", range: "^0.1.9 || ^0.2.9" };

// A Skill rating or Trait bonus may be unset on a sheet, which an `add` skips (InconsisTable's applyBaseEffects): an
// `override` sets it then, so the Mutation counts from 0 as withMutations does (`(skills[k] ?? 0) + v`).
const onField = (path: string, v: number): Effect[] => [
  { path, mode: "add", value: String(v) },
  { path, mode: "override", value: String(v), when: `!has(${path})` },
];

/** A Mutation's mods as effects on the Agent's fields: Attributes, Skill ratings and the Trait bonuses (state.ts). */
export function effectsOf(mods: MutationMods): Effect[] {
  const sum = new Map<string, number>();
  const add = (path: string, v: number) => sum.set(path, (sum.get(path) ?? 0) + v);
  for (const a of ATTRIBUTES) if (mods.attributes[a]) add(`attr.${idOf(a)}`, mods.attributes[a]!);
  for (const [s, v] of Object.entries(mods.skills)) if (v) add(`skill.${idOf(s)}`, v);
  for (const [k, v] of Object.entries(mods.traits)) if (v) add(`mod.${k}`, v);
  // An Attribute is always set (the creation step and the builder write each one), so it is a plain add.
  return [...sum].flatMap(([path, v]) =>
    path.startsWith("attr.") ? [{ path, mode: "add" as const, value: String(v) }] : onField(path, v),
  );
}

const merged = (a: MutationMods, b: MutationMods): MutationMods => {
  const plus = <K extends string>(x: Partial<Record<K, number>>, y: Partial<Record<K, number>>) => {
    const out = { ...x };
    for (const [k, v] of Object.entries(y) as [K, number][]) out[k] = (out[k] ?? 0) + v;
    return out;
  };
  return {
    attributes: plus(a.attributes, b.attributes),
    skills: plus(a.skills, b.skills),
    traits: plus(a.traits, b.traits),
  };
};

type Printed = Extract<MutationRow, { includes: string[] }>;
type Part = Pick<Printed, "keywords" | "weapons" | "gear" | "gm">;

// What the record cannot carry, in this repo's words: the GM adds it.
function summaryOf(parts: Part[]): string | undefined {
  const lines = parts.flatMap((p) => [
    ...p.keywords.map((k) => `Gains the Keyword ${k}: the GM adds it.`),
    ...p.weapons.map((w) => `Grants a weapon, ${w.name}: the GM adds it to the sheet.`),
    ...p.gear.map((g) => `Grants gear, ${g.name}: the GM adds it to the sheet.`),
    ...(p.gm ? [p.gm] : []),
  ]);
  return lines.length > 0 ? lines.join(" ") : undefined;
}

function entry(key: string, name: string, page: number, severity: Severity, mods: MutationMods, parts: Part[]) {
  const summary = summaryOf(parts);
  return {
    key: mutationKey(key),
    type: "mutation",
    name,
    tags: [severity],
    cite: `Core p.${page}`,
    visibility: "gm",
    body: { severity, ...(summary && { summary }) },
    effects: effectsOf(mods),
  } satisfies MutationEntry;
}

/** Every Mutation as an entry: a row with its own d6 table once alone (for a sheet saved before the roll) and per row. */
export function buildMutationPack(): Pack<MutationEntry> {
  const entries = mutationTables().flatMap((t) =>
    t.rows
      .filter((r): r is Printed => !("forward" in r))
      .flatMap((r) => [
        entry(r.id, r.name, r.page, t.severity, r.mods, [r]),
        ...(r.sub?.rows ?? []).map((s) =>
          entry(s.id, `${r.name}: ${s.name}`, s.page, t.severity, merged(r.mods, s.mods), [r, s]),
        ),
      ]),
  );
  return { id: MUTATION_PACK.slug, version: MUTATION_PACK.version, ruleset: RULESET, license: "private", entries };
}

/**
 * The pack key of a Mutation the sheet holds: a d6 table's row is held under its parent's id with the two names joined
 * (sheetMutation), so it is found by that name; any other is its own id.
 */
export function heldKeyOf(m: { id: string; name: string }): string {
  for (const t of mutationTables())
    for (const r of t.rows)
      if (!("forward" in r) && r.id === m.id && r.sub)
        return mutationKey(r.sub.rows.find((s) => `${r.name}: ${s.name}` === m.name)?.id ?? r.id);
  return mutationKey(m.id);
}
