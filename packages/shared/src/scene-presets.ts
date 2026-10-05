import { z } from "zod";
import {
  BeatType,
  Intensity,
  MAX_POOL_STEP,
  TEST_POOL,
  TestKind,
  type BeatTest,
  type CodexInput,
  type PoolEntry,
  type PoolSpend,
} from "./codex.ts";
import { Amount } from "./creation.ts";
import { Lookups } from "./lookups.ts";
import { SpaceHulkGenerator } from "./places.ts";
import { Dice, tableProblems } from "./roll-table.ts";
import { Source } from "./source.ts";
import { ATTRIBUTES, Pool, SKILLS, type Skill } from "./state.ts";
import { THREAT_SOURCES, threatCite, type ThreatSource } from "./threat.ts";
import { UpgradeMod, WargearFilter } from "./weapon-effect.ts";

// GM-only book data for building scenes (GitHub issue #39), served by /api/campaigns/:id/scene-presets. Book text, so
// it never reaches a player; once the GM makes a scene from an event, its text lives in that campaign (and its export).

const skill = z.enum(Object.keys(SKILLS) as [Skill, ...Skill[]]);

// Skills and DN (Core pp.122–126): one printed example per Skill and DN, shown under the scene editor's DN chips.
// Psychic Mastery has none.
export const SkillDn = z.object({
  skill,
  dn: z.number().int().min(1),
  source: Source,
  page: z.number().int().positive(), // printed page
  example: z.string().min(1).max(200), // as printed
});
export type SkillDn = z.infer<typeof SkillDn>;

// A Test an event prints. One DN often goes with a choice of Skills ("Awareness (Int), Leadership (Wil), or Survival
// (Wil)"), so `skills` lists them all; the scene gets one Test per Skill. `dn` is null where the book prints none,
// and the table's `defaultDn` (or the GM, §11.75) fills it. The printed Attribute of a Skill isn't kept: it comes
// from SKILLS, so a misprint like "Insight (Int)" stays in the text only.
export const PresetTest = z
  .object({
    kind: TestKind,
    skills: z.array(skill).max(6).default([]),
    attribute: z.enum(ATTRIBUTES).nullable().default(null),
    dn: z.number().int().min(1).max(20).nullable().default(null),
    // A DN of the game's Tier plus this: "a DN equal to the game's Tier" (TA p.11) is 0. `dn` stays null. A place's
    // hazard works it out from the campaign's Tier (apps/web/lib/hazards); a scene made from an event leaves it to the GM
    // (§11.75).
    tierDn: z.number().int().min(0).max(5).optional(),
    purpose: z.string().min(1).max(300), // what it's for, in our words: the book's own text stays in the event
    gm: z.string().min(1).max(300).optional(), // what a Test can't hold (a condition, repeats, bonus dice, a non-Core Skill)
  })
  .superRefine((t, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: "custom", message });
    const pool = TEST_POOL[t.kind];
    if (pool === "skill" && (!t.skills.length || t.attribute)) fail("A Skill Test names its Skills and no Attribute");
    if (pool === "attribute" && (!t.attribute || t.skills.length)) fail("An Attribute Test names one Attribute");
    if (pool === "either" && !t.skills.length === !t.attribute) fail("An Opposed Test names Skills or an Attribute");
    if (pool === "either" && (t.dn !== null || t.tierDn !== undefined)) fail("An Opposed Test has no DN");
    if (t.dn !== null && t.tierDn !== undefined) fail("A Test has a printed DN or a Tier DN, not both");
    if (pool === "trait" && (t.skills.length || t.attribute)) fail(`A ${t.kind} Test rolls a trait`);
  });
export type PresetTest = z.infer<typeof PresetTest>;

// One printed event: its range on the table, name and text as printed.
export const PresetEvent = z.object({
  from: z.number().int(),
  to: z.number().int(),
  name: z.string().min(1).max(200), // as printed; the scene's title
  page: z.number().int().positive(), // printed page the event starts on
  type: BeatType.optional(), // when this event's scene differs from the table's
  readAloud: z.string().max(5000).default(""), // the boxed or italic read-aloud, verbatim
  text: z.string().min(1).max(5000), // the rest of the event, verbatim; nested tables are plain lines
  tests: z.array(PresetTest).max(12).default([]),
});
export type PresetEvent = z.infer<typeof PresetEvent>;

// A rolled event table. `gaps` and `overlaps` list results the book prints no row for, or two rows for, so validate
// tells a print quirk (kept as printed) from a transcription slip.
export const EventTable = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/), // unique across scene-presets/*.json
    name: z.string().min(1).max(200), // as printed
    source: z.enum(Object.keys(THREAT_SOURCES) as [ThreatSource, ...ThreatSource[]]),
    page: z.number().int().positive(), // printed page the table starts on
    dice: Dice,
    type: BeatType, // the scene type its events make
    defaultDn: z.number().int().min(1).max(20).optional(), // "Skill Tests are DN 5 unless you determine otherwise"
    gm: z.string().min(1).max(2000).optional(), // the book's notes on using the table, verbatim: when to roll, Wrath Die
    rows: z.array(PresetEvent).min(1),
    gaps: z.array(z.number().int()).default([]),
    overlaps: z.array(z.number().int()).default([]),
  })
  .superRefine((t, ctx) => {
    for (const message of tableProblems(t)) ctx.addIssue({ code: "custom", message });
  });
export type EventTable = z.infer<typeof EventTable>;

// A book's ready-made Ruin and Glory lines for a scene (issue #40): what earns either pool, or what it buys. `n` is the
// amount or cost as printed, null where the book prints none: the GM sets it (rules-flow.md §11.78).
export const PoolPreset = z.object({
  kind: z.enum(["earn", "spend"]),
  pool: Pool,
  n: z.number().int().min(1).max(MAX_POOL_STEP).nullable(),
  name: z.string().min(1).max(100), // as printed; in our words only where the book names none
  page: z.number().int().positive().optional(), // printed page, where it isn't the table's
  text: z.string().max(450).default(""), // the printed effect, verbatim
  gm: z.string().min(1).max(200).optional(), // a condition the app can't check ("Tier 4 only")
});
export type PoolPreset = z.infer<typeof PoolPreset>;
export const PoolPresetTable = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/), // unique across scene-presets/pools/*.json
  name: z.string().min(1).max(200), // as printed
  source: z.enum(Object.keys(THREAT_SOURCES) as [ThreatSource, ...ThreatSource[]]),
  page: z.number().int().positive(), // printed page the list starts on
  gm: z.string().min(1).max(2000).optional(), // the book's notes on using the list, verbatim
  rows: z.array(PoolPreset).min(1),
});
export type PoolPresetTable = z.infer<typeof PoolPresetTable>;

// A preset copied into a scene, with where it came from: an earned line goes to its pool's list, a spend to the
// spends. An award the book gives no amount starts at 1 (§11.77); a spend it gives no cost waits for the GM's (§11.78).
export function presetLine({ table, row }: { table: PoolPresetTable; row: PoolPreset }) {
  const cite = `(${threatCite({ source: table.source, page: row.page ?? table.page })})`;
  if (row.kind === "earn") {
    const line: PoolEntry = { text: [row.name, row.gm, cite].filter(Boolean).join(" "), amount: row.n ?? 1 };
    return { list: row.pool, line } as const;
  }
  const line: Omit<PoolSpend, "cost"> & { cost: number | null } = {
    pool: row.pool,
    name: row.name,
    cost: row.n,
    text: [row.text, row.gm, cite].filter(Boolean).join(" "),
  };
  return { list: "spends", line } as const;
}

// A place's dangers (issue #49): Battlezone hazards (TA pp.9–21), Environmental Hazards (Core pp.201–202), a hive's
// Hazards (Darktide pp.14–27) and a space hulk's (RR1 p.11). A place's hazard list points at a row by `id`, as an
// encounter points at a threat, so the book text stays here, GM-only.
export const HazardRow = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/), // unique across scene-presets/hazards/*.json
  from: z.number().int().optional(), // the printed range, on a rolled table
  to: z.number().int().optional(),
  name: z.string().min(1).max(200), // as printed
  page: z.number().int().positive(), // printed page
  text: z.string().min(1).max(5000), // the printed result, verbatim
  tests: z.array(PresetTest).max(6).default([]),
  conditions: z
    .array(z.string().regex(/^[a-z-]+$/))
    .max(4)
    .default([]), // ids in rules/conditions.json
  threats: z
    .array(z.object({ threatId: z.string().min(1), count: Amount }))
    .max(4)
    .default([]), // in the bestiary
  // One per intensity the book prints, each with its own Tests and effect; the GM picks one per place (§11.94).
  variants: z
    .array(
      z.object({ name: Intensity, tests: z.array(PresetTest).max(6).default([]), text: z.string().min(1).max(500) }),
    )
    .max(3)
    .default([]),
  gm: z.string().min(1).max(300).optional(), // what the fields can't hold: a Wrath trigger, Rounds, Influence lost
});
export type HazardRow = z.infer<typeof HazardRow>;
// A book's hazard table. `dice: null` is a list to pick from, not roll on (Core pp.201–202).
export const HazardTable = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    name: z.string().min(1).max(200), // as printed
    source: z.enum(Object.keys(THREAT_SOURCES) as [ThreatSource, ...ThreatSource[]]),
    page: z.number().int().positive(), // printed page the table starts on
    dice: Dice.nullable(),
    gm: z.string().min(1).max(2000).optional(), // the book's notes on using the table, verbatim
    rows: z.array(HazardRow).min(1),
    gaps: z.array(z.number().int()).default([]),
    overlaps: z.array(z.number().int()).default([]),
  })
  .superRefine((t, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: "custom", message });
    if (!t.dice) {
      if (t.rows.some((r) => r.from !== undefined || r.to !== undefined)) fail("A list to pick from has no ranges");
      return;
    }
    const rows = t.rows.flatMap((r) =>
      r.from === undefined || r.to === undefined ? [] : [{ from: r.from, to: r.to }],
    );
    if (rows.length < t.rows.length) fail("Every row of a rolled table has a range");
    for (const message of tableProblems({ ...t, dice: t.dice, rows })) fail(message);
  });
export type HazardTable = z.infer<typeof HazardTable>;

// What the Agents can find (issue #51): the books' loot and bounty tables (Core pp.247–251, RR1 pp.17–22, Darktide
// pp.15–27) and lists of named items (RR2 pp.20–31, Bloody Gates). A row makes codex items through `codex.addLoot`, so
// the book text reaches the campaign only as the GM's notes.
const rowId = z.string().regex(/^[a-z0-9-]+$/);
// How many: a printed number, or dice ("1d3 Hazard Suits") the server rolls when the GM makes the items (§11.113).
export const LootCount = z.union([z.number().int().min(1).max(20), Dice]);
export type LootCount = z.infer<typeof LootCount>;
// One thing a row hands over: a catalogue entry (`wargearId`), a choice the GM makes from the catalogue (`pick`, "an
// IMPERIUM weapon of Value 4 or less"), or a one-off the catalogue doesn't hold (`name` alone).
export const LootItem = z
  .object({
    name: z.string().min(1).max(200).optional(), // as printed, where it differs from the catalogue's, or a one-off
    wargearId: rowId.optional(),
    pick: WargearFilter.optional(),
    count: LootCount.default(1),
    mods: z.array(UpgradeMod).max(10).default([]), // a printed change to its profile, as an upgrade's (§11.116)
  })
  .refine(
    (i) => !(i.wargearId && i.pick) && !!(i.wargearId || i.pick || i.name),
    "An item is a wargearId, a pick or a name",
  );
export type LootItem = z.infer<typeof LootItem>;
export const LootRow = z.object({
  id: rowId, // unique across scene-presets/loot/*.json
  from: z.number().int().optional(), // the printed range, on a rolled table
  to: z.number().int().optional(),
  name: z.string().min(1).max(200), // as printed
  page: z.number().int().positive(), // printed page
  text: z.string().min(1).max(5000), // the printed result, verbatim
  items: z.array(LootItem).max(10).default([]),
  ammo: z
    .array(z.object({ kind: z.string().min(1).max(60), count: LootCount }))
    .max(4)
    .default([]),
  wealth: z.number().int().min(1).max(10).optional(),
  gm: z.string().min(1).max(300).optional(), // what the fields can't hold: a boon, healing, bonus dice
});
export type LootRow = z.infer<typeof LootRow>;
// A book's loot table. `dice: null` is a list to pick from. A `fault` table (RR1's "What's Wrong With It?") is rolled
// for another table's find, which names it in `faults`.
export const LootTable = z
  .object({
    id: rowId,
    name: z.string().min(1).max(200), // as printed
    source: z.enum(Object.keys(THREAT_SOURCES) as [ThreatSource, ...ThreatSource[]]),
    page: z.number().int().positive(), // printed page the table starts on
    dice: Dice.nullable(),
    gm: z.string().min(1).max(2000).optional(), // the book's notes on using the table, verbatim
    fault: z.boolean().default(false),
    faults: rowId.optional(),
    rows: z.array(LootRow).min(1),
    gaps: z.array(z.number().int()).default([]),
    overlaps: z.array(z.number().int()).default([]),
  })
  .superRefine((t, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: "custom", message });
    if (!t.dice) {
      if (t.rows.some((r) => r.from !== undefined || r.to !== undefined)) fail("A list to pick from has no ranges");
      return;
    }
    const rows = t.rows.flatMap((r) =>
      r.from === undefined || r.to === undefined ? [] : [{ from: r.from, to: r.to }],
    );
    if (rows.length < t.rows.length) fail("Every row of a rolled table has a range");
    for (const message of tableProblems({ ...t, dice: t.dice, rows })) fail(message);
  });
export type LootTable = z.infer<typeof LootTable>;
// The most items one row makes at once (§11.113). ponytail: a fixed cap, a per-row confirm if a book prints more.
export const MAX_LOOT_ITEMS = 20;

// The GM NOTES a made item opens with: where it came from, the printed result, and what the app doesn't hand out itself
// (Ammo, Wealth, a boon), so the GM awards it in PARTY.
export function lootNotes({
  table,
  row,
  roll,
  fault,
  award,
}: {
  table: Pick<LootTable, "name" | "source">;
  row: LootRow;
  roll?: number;
  fault?: LootRow;
  award?: string[];
}) {
  const cite = threatCite({ source: table.source, page: row.page });
  return [
    `${cite} · ${table.name}${roll === undefined ? "" : `, roll ${roll}`}: ${row.name}`,
    row.text,
    fault && `FAULT (${threatCite({ source: table.source, page: fault.page })}): ${fault.name}. ${fault.text}`,
    row.gm && `GM: ${row.gm}`,
    award?.length && `Award in PARTY: ${award.join(", ")}`,
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 5000);
}

// The Holy Relic creator (RR2 pp.12–19, issue #51 step 8): a Form names a kind of item the GM picks from the catalogue,
// the Origins say whose it was and how it became a Relic, a Power comes from the table for its kind, and an Oddity
// finishes it. `codex.addRelic` writes one item. Powers are text, with `mods` only where a profile holds them (§11.116).
export const RelicKind = z.enum(["melee", "ranged", "ammunition", "armour", "augmetic", "equipment"]);
export type RelicKind = z.infer<typeof RelicKind>;
const relicRow = { id: rowId, from: z.number().int(), to: z.number().int(), name: z.string().min(1).max(200) };
const relicText = z.object({ ...relicRow, text: z.string().min(1).max(3000) });
const relicTable = <R extends z.ZodTypeAny>(row: R) =>
  z
    .object({
      name: z.string().min(1).max(200), // as printed
      page: z.number().int().positive(),
      dice: Dice,
      rows: z.array(row).min(1),
      gaps: z.array(z.number().int()).default([]),
    })
    .superRefine((t, ctx) => {
      for (const message of tableProblems({ ...t, rows: t.rows as { from: number; to: number }[], overlaps: [] }))
        ctx.addIssue({ code: "custom", message: `${t.name}: ${message}` });
    });
export const RelicPowerRow = z.object({
  ...relicRow,
  text: z.string().min(1).max(3000),
  mods: z.array(UpgradeMod).max(10).default([]),
  enemy: z.boolean().default(false), // the Power names an enemy: roll on the Enemy Keyword Table (RR2 p.18)
});
export type RelicPowerRow = z.infer<typeof RelicPowerRow>;
export const RelicCreator = z.object({
  source: z.enum(Object.keys(THREAT_SOURCES) as [ThreatSource, ...ThreatSource[]]),
  page: z.number().int().positive(),
  // The Form grid (p.13) is printed as two d6, read as a d66 (§11.117). A Form is a kind and a catalogue filter.
  form: relicTable(z.object({ ...relicRow, kind: RelicKind, pick: WargearFilter })),
  owners: relicTable(relicText),
  anointments: relicTable(relicText),
  powers: z.array(z.object({ kind: RelicKind }).and(relicTable(RelicPowerRow))).length(RelicKind.options.length),
  oddities: relicTable(relicText),
  enemies: relicTable(z.object(relicRow)),
});
export type RelicCreator = z.infer<typeof RelicCreator>;

// A made relic's GM NOTES: each roll with its cite and the printed text, so the GM reads where it came from.
export function relicNotes({
  creator: c,
  form,
  item,
  owner,
  anointment,
  power,
  oddity,
  enemy,
}: {
  creator: Pick<RelicCreator, "source" | "page">;
  form: { name: string };
  item: string; // the catalogue entry the Form became, with its cite
  owner: { name: string; text: string };
  anointment: { name: string; text: string };
  power: { kind: RelicKind; name: string; text: string };
  oddity: { name: string; text: string };
  enemy?: { name: string };
}) {
  return [
    `${threatCite({ source: c.source, page: c.page })} · Holy Relic`,
    `FORM: ${form.name}, as ${item}`,
    `ORIGINAL OWNER: ${owner.name}. ${owner.text}`,
    `ANOINTMENT: ${anointment.name}. ${anointment.text}`,
    `POWER (${power.kind}): ${power.name}. ${power.text}${enemy ? `\nENEMY: ${enemy.name}` : ""}`,
    `ODDITY: ${oddity.name}. ${oddity.text}`,
  ]
    .join("\n\n")
    .slice(0, 5000);
}

export const ScenePresets = z.object({
  skillDns: z.array(SkillDn),
  tables: z.array(EventTable),
  pools: z.array(PoolPresetTable),
  hazards: z.array(HazardTable).default([]), // an api from before issue #49 sends none; the rest still loads
  spaceHulk: SpaceHulkGenerator.nullable().default(null), // RR1 pp.6–11 (issue #50 step 8); likewise
  loot: z.array(LootTable).default([]), // issue #51; likewise
  relics: RelicCreator.nullable().default(null), // RR2 pp.12–19 (issue #51 step 8); likewise
  lookups: Lookups.nullable().default(null), // Critical Hit and Perils tables (§11.120); likewise
});
export type ScenePresets = z.infer<typeof ScenePresets>;

// A scene made from one event (issue #39): its name, its scene type, the read-aloud, the printed text as GM notes with
// where it came from, and one Test per Skill it offers at the printed DN, else the table's default, else none for the
// GM to set (§11.75). Nothing else is filled: the encounter, the NPCs and the location stay the GM's call.
export function presetScene({ table, row }: { table: EventTable; row: PresetEvent }) {
  const cite = threatCite({ source: table.source, page: row.page });
  return {
    title: row.name,
    type: row.type ?? table.type,
    readAloud: row.readAloud,
    gmNotes: `${row.text}\n\n(${table.name}, ${cite})`,
    tests: row.tests.flatMap((t): z.input<typeof BeatTest>[] => {
      const dn = TEST_POOL[t.kind] === "either" ? null : (t.dn ?? table.defaultDn ?? null);
      const base = { kind: t.kind, attribute: t.attribute, dn, purpose: t.purpose };
      return t.skills.length
        ? t.skills.map((s) => ({ ...base, skill: s, attribute: null }))
        : [{ ...base, skill: null }];
    }),
  } satisfies Omit<z.input<typeof CodexInput.beat>, "adventureId">;
}
