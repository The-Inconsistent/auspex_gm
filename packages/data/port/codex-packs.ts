// The codex pack for InconsisTable (#325): the entries a GM makes codex entries and rows from (its house decisions #89,
// #97). A `hazard` per book row of the hazard tables (Core pp.201-202, Threat Assessment pp.9-21, Darktide pp.14-27,
// Redacted Records p.11), a `place` per place of the books with its parent, and a `sceneEvent` per row of the event
// tables. Built from packages/data through its schemas: names, cites, the Tests and Conditions as data, and a summary
// in this repo's words of what the row asks; the printed text, read-aloud and descriptions stay in the book.
import {
  ATTRIBUTE_NAMES,
  BeatType,
  sourceCite,
  threatCite,
  type Attribute,
  type PresetTest,
  type Skill,
} from "@wg/shared";
import { creationCatalogue, placeList, rulesList, scenePresets } from "../index.ts";
import type { Pack } from "./pack.ts";
import { idOf, SUMMARY_MAX } from "./ruleset.ts";

export { SUMMARY_MAX };

type Body = Record<string, string | number | string[]>;
export interface CodexEntry {
  key: string;
  type: "hazard" | "place" | "sceneEvent" | "framework" | "patron";
  name: string;
  tags: string[];
  cite: string;
  visibility: "gm";
  body: Body;
}

/** The pack's slug and version, which a room document expects (room.ts). */
// 0.1.1: the Frameworks and Patrons the premise is made from (the owner's decision 2).
export const CODEX_PACK = { slug: "wrath-and-glory-codex", version: "0.1.1" } as const;
// The rulesets whose codex reads these entries (0.1.14, 0.2.14).
const RULESET = { id: "wrath-and-glory", range: "^0.1.14 || ^0.2.14" };

/** A Test of this repo as the ruleset's Test and its inputs, as a scene's prepared Test line holds it. */
export function testOf(t: {
  kind: string;
  skill?: Skill | null;
  attribute?: Attribute | null;
  dn?: number | null;
}): { testId: string; inputs: Record<string, string | number> } | null {
  const dn: Record<string, number> = t.dn ? { dn: t.dn } : {};
  if (t.kind === "skill" && t.skill) return { testId: "skill", inputs: { skill: idOf(t.skill), ...dn } };
  if (t.kind === "attribute" && t.attribute)
    return { testId: "attribute", inputs: { attribute: idOf(t.attribute), ...dn } };
  if (t.kind === "influence" || t.kind === "resolve") return { testId: "trait", inputs: { trait: t.kind, ...dn } };
  if (t.kind === "corruption") return { testId: "corruption", inputs: dn };
  // An Opposed Test is reported, with no DN (p.170): it names what both sides roll.
  if (t.kind === "opposed" && (t.skill || t.attribute))
    return { testId: "opposed", inputs: { roll: idOf((t.skill ?? t.attribute)!) } };
  return null;
}
const presetTest = (p: PresetTest) => testOf({ kind: p.kind, skill: p.skills[0], attribute: p.attribute, dn: p.dn });

// A Test in words: its Skills or Attribute and DN, a Tier DN as "DN Tier + n".
const conditionName = (id: string) =>
  rulesList().find((r) => r.kind === "condition" && idOf(r.name) === idOf(id))?.name ?? id;
const testWords = (p: PresetTest) => {
  const what =
    p.kind === "skill"
      ? p.skills.join(" or ")
      : p.kind === "attribute" && p.attribute
        ? ATTRIBUTE_NAMES[p.attribute]
        : p.kind[0]!.toUpperCase() + p.kind.slice(1);
  const dn = p.dn ? ` DN ${p.dn}` : p.tierDn !== undefined ? ` DN Tier${p.tierDn ? ` + ${p.tierDn}` : ""}` : "";
  return `${what}${dn}`;
};
const cut = (s: string) => (s.length <= SUMMARY_MAX ? s : `${s.slice(0, SUMMARY_MAX - 1).replace(/\s+\S*$/, "")}…`);

/** Every hazard, place and scene event as an entry. */
export function buildCodexPack(): Pack<CodexEntry> {
  const { hazards, tables } = scenePresets();
  const hazardEntries = hazards.flatMap((t) =>
    t.rows.map((h): CodexEntry => {
      const parts = [
        h.tests.length > 0 && `Test: ${h.tests.map(testWords).join("; ")}`,
        h.conditions.length > 0 && `Conditions: ${h.conditions.map(conditionName).join(", ")}`,
        h.threats.length > 0 && "Threats come with it",
        h.variants.length > 0 && `Intensities: ${h.variants.map((v) => v.name).join(", ")}`,
        h.gm,
      ].filter((x): x is string => !!x);
      const first = h.tests[0];
      return {
        key: h.id,
        type: "hazard",
        name: h.name,
        tags: [t.source],
        cite: threatCite({ source: t.source, page: h.page }),
        visibility: "gm",
        body: {
          ...(parts.length > 0 && { summary: cut(parts.join(". ")) }),
          ...(first?.dn && { dn: first.dn }),
        },
      };
    }),
  );
  const placeEntries = placeList().map((p): CodexEntry => ({
    key: p.id,
    type: "place",
    name: p.name,
    tags: [p.source],
    cite: threatCite({ source: p.source, page: p.page }),
    visibility: "gm",
    body: p.parent ? { parent: p.parent } : {},
  }));
  // A scene from a book event takes its first printed Test as a line (rules-flow §11.195).
  const eventEntries = tables.flatMap((t) =>
    t.rows.map((e): CodexEntry => {
      const test = e.tests.map(presetTest).find((x) => x !== null);
      return {
        key: `${t.id}.${idOf(e.name).toLowerCase()}-${e.from}`,
        type: "sceneEvent",
        name: e.name,
        tags: [t.source],
        cite: threatCite({ source: t.source, page: e.page }),
        visibility: "gm",
        body: {
          type: BeatType.parse(e.type ?? t.type),
          ...(test && { tests: [test.testId], ...test.inputs }),
          ...(!test?.inputs.dn && t.defaultDn && test && test.testId !== "opposed" && { dn: t.defaultDn }),
        },
      };
    }),
  );
  // A Framework by name, the Tier it suits and the Patron that offers it (Core p.20, pp.310-313; FSPG pp.64-89):
  // making the premise from one fills its name only (§11.80).
  const { patrons, frameworks } = creationCatalogue();
  const slug = (s: string) => idOf(s).toLowerCase();
  const frameworkEntries = [
    ...patrons.map((p): CodexEntry => ({
      key: `patron.${p.id}`,
      type: "patron",
      name: p.name,
      tags: [p.source],
      cite: sourceCite(p),
      visibility: "gm",
      body: {},
    })),
    ...patrons.flatMap((p) =>
      p.options.map((o): CodexEntry => ({
        key: `framework.${p.id}.${slug(o.name)}`,
        type: "framework",
        name: o.name,
        tags: [p.source],
        cite: sourceCite(p),
        visibility: "gm",
        body: { patron: `patron.${p.id}`, ...(o.tier !== undefined && { tier: o.tier }) },
      })),
    ),
    ...frameworks.map((f): CodexEntry => ({
      key: `framework.${f.id}`,
      type: "framework",
      name: f.name,
      tags: [f.source],
      cite: sourceCite(f),
      visibility: "gm",
      body: f.tier !== undefined ? { tier: f.tier } : {},
    })),
  ];
  return {
    id: CODEX_PACK.slug,
    version: CODEX_PACK.version,
    ruleset: RULESET,
    license: "private",
    entries: [...hazardEntries, ...placeEntries, ...eventEntries, ...frameworkEntries],
  };
}
