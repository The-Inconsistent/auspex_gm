import { z } from "zod";
import { BeatType, TEST_POOL, TestKind, type BeatTest, type CodexInput } from "./codex.ts";
import { Dice, tableProblems } from "./roll-table.ts";
import { Source } from "./source.ts";
import { ATTRIBUTES, SKILLS, type Skill } from "./state.ts";
import { THREAT_SOURCES, threatCite, type ThreatSource } from "./threat.ts";

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
    purpose: z.string().min(1).max(300), // what it's for, in our words: the book's own text stays in the event
    gm: z.string().min(1).max(300).optional(), // what a Test can't hold (a condition, repeats, bonus dice, a non-Core Skill)
  })
  .superRefine((t, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: "custom", message });
    const pool = TEST_POOL[t.kind];
    if (pool === "skill" && (!t.skills.length || t.attribute)) fail("A Skill Test names its Skills and no Attribute");
    if (pool === "attribute" && (!t.attribute || t.skills.length)) fail("An Attribute Test names one Attribute");
    if (pool === "either" && !t.skills.length === !t.attribute) fail("An Opposed Test names Skills or an Attribute");
    if (pool === "either" && t.dn !== null) fail("An Opposed Test has no DN");
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

export const ScenePresets = z.object({ skillDns: z.array(SkillDn), tables: z.array(EventTable) });
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
