// The sheet's meanings on tap (InconsisTable's house decision #126, its #222; rules-flow §11.206). Each of this app's
// sheet terms (`lib/sheet-terms`: this repo's own short words, never the book's) becomes the `summary` of the ruleset
// definitions that name it, so a player taps the name on the platform's sheet and reads it, as on this app's sheet. A
// definition keeps its own cite; one without a cite takes the term's. The platform holds a summary in one language
// (its house decision #211), so the meanings are English only.
import { ATTRIBUTE_NAMES, ATTRIBUTES, SKILLS, type Skill } from "@wg/shared";
import {
  ATTRIBUTE_TERMS,
  SHEET_TERMS,
  SKILL_TERMS,
  type SheetTermKey,
} from "../../../apps/web/lib/sheet-terms/sheet-terms.ts";
import { idOf } from "./ruleset.ts";

/**
 * The terms that name no definition the platform can give a summary: the sheet's section heads, a Test's dice and DN,
 * the Critical Hit and Perils tables, and what the ledger keeps as entries rather than fields.
 */
export const NO_DEFINITION: readonly SheetTermKey[] = [
  "attributes",
  "skills",
  "dice",
  "dn",
  "abilities",
  "talents",
  "wargear",
  "critical",
  "perils",
];

/** Where each term's meaning goes: `<entity>.field:<id>`, `<entity>.derived:<id>`, `resource:<id>` or `campaignField:<id>`. */
export function meaningPlaces(): Record<SheetTermKey, string[]> {
  const places: Partial<Record<SheetTermKey, string[]>> = {
    defence: ["agent.derived:defence", "threat.derived:defence", "threat.field:stat.defence"],
    resilience: ["agent.derived:resilience", "threat.derived:resilience", "threat.field:stat.resilience"],
    armourRating: ["agent.field:armour.ar"],
    wounds: ["resource:wounds", "agent.derived:maxWounds", "threat.derived:maxWounds", "threat.field:stat.wounds"],
    shock: ["resource:shock", "agent.derived:maxShock", "threat.derived:maxShock", "threat.field:stat.shock"],
    resolve: ["agent.derived:resolve", "threat.field:stat.resolve"],
    conviction: ["agent.derived:conviction", "threat.field:stat.conviction"],
    determination: ["agent.derived:determination"],
    traumatic: ["agent.field:traumatic", "agent.derived:maxTraumatic"],
    mutations: ["agent.field:mutations"],
    corruption: ["resource:corruption"],
    bonus: ATTRIBUTES.map((a) => `agent.derived:${idOf(ATTRIBUTE_NAMES[a])}Bonus`),
    speed: ["agent.derived:speed", "agent.field:baseSpeed", "threat.field:stat.speed"],
    passiveAwareness: ["agent.derived:passiveAwareness", "threat.field:stat.passiveAwareness"],
    influence: ["agent.derived:influence"],
    wealth: ["resource:wealth"],
    wrath: ["resource:wrath"],
    glory: ["resource:glory"],
    tier: ["campaignField:tier"],
    species: ["agent.field:species"],
    archetype: ["agent.field:archetype"],
    rank: ["agent.derived:rank"],
    xp: ["agent.field:xp"],
    keywords: ["agent.field:keywords", "threat.field:keywords"],
    damage: ["weapon.field:damage"],
    ed: ["weapon.field:ed", "weapon.field:edDice"],
    ap: ["weapon.field:ap"],
    range: ["weapon.field:range.s", "weapon.field:range.m", "weapon.field:range.l"],
    salvo: ["weapon.field:salvo"],
  };
  for (const a of ATTRIBUTES)
    places[ATTRIBUTE_TERMS[a]] = [`agent.field:attr.${idOf(a)}`, `threat.field:attr.${idOf(a)}`];
  for (const s of Object.keys(SKILLS) as Skill[])
    places[SKILL_TERMS[s]] = [
      `agent.field:skill.${idOf(s)}`,
      `agent.derived:${idOf(s)}`,
      `threat.field:skill.${idOf(s)}`,
    ];
  for (const k of NO_DEFINITION) places[k] = [];
  return places as Record<SheetTermKey, string[]>;
}

type Def = { cite?: string; summary?: string };
type Defs = {
  entities: { id: string; fields: Record<string, Def>; derived: (Def & { id: string })[] }[];
  resources: (Def & { id: string })[];
  campaignFields: Record<string, Def>;
};

/** The ruleset with each sheet meaning as the summary of the definitions it names; throws on a place it lacks. */
export function withMeanings<T>(ruleset: T): T {
  const r = structuredClone(ruleset) as T & Defs;
  for (const [term, places] of Object.entries(meaningPlaces()) as [SheetTermKey, string[]][]) {
    const { meaning, cite } = SHEET_TERMS[term];
    const told = (d: Def | undefined) => {
      if (d === undefined) throw new Error(`the meaning of ${term} names a definition the ruleset lacks`);
      return { ...d, summary: meaning, cite: d.cite ?? cite };
    };
    for (const place of places) {
      const [kind, id] = place.split(":") as [string, string];
      if (kind === "resource") {
        const i = r.resources.findIndex((x) => x.id === id);
        r.resources[i] = told(r.resources[i]) as Defs["resources"][number];
      } else if (kind === "campaignField") r.campaignFields[id] = told(r.campaignFields[id]);
      else {
        const [entity, part] = kind.split(".");
        const e = r.entities.find((x) => x.id === entity);
        if (part === "field") {
          const d = told(e?.fields[id]);
          e!.fields[id] = d;
        } else {
          const i = e?.derived.findIndex((x) => x.id === id) ?? -1;
          const d = told(e?.derived[i]) as Defs["resources"][number];
          e!.derived[i] = d;
        }
      }
    }
  }
  return r;
}
