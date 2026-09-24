import { z } from "zod";
import { ATTRIBUTES, Mods, SKILLS, type Attribute, type Skill } from "./state.ts";

// The character-creation catalogue: every species, archetype, talent, package, power and table a character is built
// from, transcribed from the books (docs/data.md, "Creation catalogue"). Records cross-reference each other by id and
// packages/data/validate.ts resolves every reference. It holds book text, so it is served to seats only.

// Books, in precedence order: when one thing is printed in several books only the first listed is transcribed, and
// the others are cited in its `note` (docs/data.md). Official beats homebrew, then newest printing wins.
export const SOURCES = {
  "vow-of-absolution": { cite: "VoA", official: true, pages: "printed" }, // Apr 2024 printing
  "inheritance-of-embers": { cite: "IoE", official: true, pages: "printed" }, // Jan 2024
  "forsaken-system": { cite: "FSPG", official: true, pages: "printed" }, // 2021
  core: { cite: "Core", official: true, pages: "printed" }, // 2020
  apocrypha: { cite: "Apocrypha", official: false, pages: "printed" }, // homebrew, v9 2023
  "legacy-of-the-necrontyr": { cite: "Necrontyr", official: false, pages: "pdf" }, // homebrew, no printed pages
} as const;
export type Source = keyof typeof SOURCES;
export const Source = z.enum(Object.keys(SOURCES) as [Source, ...Source[]]);
export const sourceCite = ({ source, page }: { source: Source; page: number }) => `${SOURCES[source].cite} p.${page}`;

const id = z.string().regex(/^[a-z0-9-]+$/);
const ids = z.array(id).min(1);
const keyword = z.string().regex(/^(\[[A-Z0-9' -]+\]|[A-Z0-9' -]+)$/); // as printed: "ADEPTUS ASTARTES", "[CHAPTER]"
const attribute = z.enum(ATTRIBUTES as unknown as [Attribute, ...Attribute[]]);
const skill = z.enum(Object.keys(SKILLS) as [Skill, ...Skill[]]);
const rating = z.number().int().min(0).max(12);

// Every record: where it is printed. `note` holds print errors copied as printed, and the other books that print it.
const record = {
  id,
  name: z.string().min(1).max(100),
  source: Source,
  page: z.number().int().positive(), // printed page, or PDF page for a `pages: "pdf"` source
  note: z.string().max(1000).optional(),
};

// A background or table bonus: a Trait from `Mods`, Wealth (FSPG p.92), Passive Awareness (Apocrypha p.43) or
// Corruption (Core p.86).
export const Bonus = z.enum([...Mods.keyof().options, "wealth", "passiveAwareness", "corruption"]);
export type Bonus = z.infer<typeof Bonus>;

export const Requirement = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("attribute"), attribute, min: rating }),
  z.object({ kind: z.literal("skill"), skill, min: rating }),
  z.object({ kind: z.literal("influence"), min: z.number().int() }),
  z.object({ kind: z.literal("keyword"), anyOf: z.array(keyword).min(1) }),
  z.object({ kind: z.literal("notKeyword"), anyOf: z.array(keyword).min(1) }),
  z.object({ kind: z.literal("species"), anyOf: ids }),
  z.object({ kind: z.literal("archetype"), anyOf: ids }),
  z.object({ kind: z.literal("subFaction"), anyOf: ids }),
  z.object({ kind: z.literal("talent"), anyOf: ids }),
  z.object({ kind: z.literal("power"), anyOf: ids }),
  z.object({ kind: z.literal("wargear"), anyOf: z.array(z.string().min(1)).min(1) }), // printed names, e.g. an augmetic
  z.object({ kind: z.literal("rank"), min: z.number().int().min(1) }),
  z.object({ kind: z.literal("tier"), min: z.number().int().min(1).max(5) }),
  z.object({ kind: z.literal("text"), text: z.string().min(1) }), // not mechanical; validate counts these
]);
export type Requirement = z.infer<typeof Requirement>;

export const XpCost = z.union([
  z.number().int().min(0),
  z.object({ perTier: z.number().int().positive() }), // "10 × new Tier" (Core p.149)
  z.object({ base: z.number().int().min(0), plus: z.string().min(1) }), // "20, plus the augmetic's Value" (Core p.129)
  z.object({ atCreation: z.number().int().min(0), later: z.number().int().min(0) }), // Smite (Core p.272)
  z.object({ text: z.string().min(1) }),
]);
export type XpCost = z.infer<typeof XpCost>;

// A catalogue item as printed; `wargearId` once the Wargear catalogue has it (validate counts the rest).
export const WargearItem = z.object({
  name: z.string().min(1).max(200),
  qty: z.number().int().positive().default(1),
  wargearId: id.optional(),
});

// Something a record gives: a talent, keyword, power or item, or a choice between several.
const grantOne = z.union([
  z.object({ talent: id }),
  z.object({ keyword }),
  z.object({ power: id }),
  z.object({ wargear: WargearItem }),
  z.object({ text: z.string().min(1) }), // "1 item of Uncommon Wargear"
]);
export const Grant = z.union([
  grantOne,
  z.object({ choose: z.number().int().positive(), from: z.array(grantOne).min(2) }),
]);
export type Grant = z.infer<typeof Grant>;

// A named ability or trait, verbatim. `mods` only where the book prints a flat bonus (Honour the Chapter: +1 Resolve).
export const Rule = z.object({
  name: z.string().min(1).max(100),
  text: z.string().min(1).max(4000),
  page: z.number().int().positive().optional(), // when not the record's page
  // When not the record's book: a homebrew rule kept on the official record that lacks it (docs/data.md §9).
  source: Source.optional(),
  mods: Mods.optional(),
  grants: z.array(Grant).optional(),
});
export type Rule = z.infer<typeof Rule>;

// What fills a [PLACEHOLDER] keyword ("[CHAPTER]" → a chapter). "any" is [ANY] (Core p.375); "mark" is
// [MARK OF CHAOS], filled by a Chaos God (Core p.377).
export const SubFactionType = z.enum([
  "chapter",
  "legion",
  "order",
  "forge-world",
  "regiment",
  "ordo",
  "dynasty",
  "craftworld",
  "coterie",
  "kabal",
  "wych-cult",
  "coven",
  "masque",
  "clan",
  "shield-host",
  "sept",
  "league",
  "house",
  "mark",
  "any",
]);
export type SubFactionType = z.infer<typeof SubFactionType>;

export const Keyword = z.object({
  ...record,
  name: keyword,
  text: z.string().default(""),
  placeholder: SubFactionType.optional(),
});
export type Keyword = z.infer<typeof Keyword>;

// `rules`: rules every member gets (Assassinorum Conditioning, Apocrypha p.55; Coterie Wrath, IoE p.14).
export const Faction = z.object({ ...record, text: z.string().default(""), rules: z.array(Rule).default([]) });
export type Faction = z.infer<typeof Faction>;

export const SubFaction = z.object({
  ...record,
  type: SubFactionType,
  factionId: id,
  keyword, // "SPACE WOLVES", which fills the faction's placeholder
  requires: z.array(Requirement).default([]), // who may join: Black Templars can't be PSYKER (Apocrypha p.27)
  traits: z.array(Rule.extend({ geneSeed: z.boolean().default(false) })).default([]), // Primaris ignore gene-seed (Core p.71)
});
export type SubFaction = z.infer<typeof SubFaction>;

const attributes = z.partialRecord(attribute, rating);
const skills = z.partialRecord(skill, z.number().int().min(0).max(8));

export const Species = z.object({
  ...record,
  xp: z.number().int().min(0), // already inside every archetype's cost (Core p.29)
  speed: z.number().int().positive(),
  size: z.enum(["Tiny", "Small", "Average", "Large", "Huge", "Gargantuan"]),
  attributes, // the ratings the Species grants
  skills,
  max: z.object({ S: rating, T: rating, A: rating, I: rating, Wil: rating, Int: rating, Fel: rating, speed: rating }),
  keywords: z.array(keyword).default([]), // Species Keywords (Core p.38), for Advanced Creation
  abilities: z.array(Rule).default([]),
  grants: z.array(Grant).default([]), // e.g. "either IMPERIUM or CHAOS"
});
export type Species = z.infer<typeof Species>;

// Who a table or option group belongs to.
const Owner = z.union([z.object({ factionId: id }), z.object({ speciesId: id }), z.object({ subFactionId: id })]);

// A row gives +1 to its `bonus`, or what its `grants` say ("Gain +1 [ANY] Keyword", Core p.67).
const backgroundRow = z.object({
  name: z.string().min(1),
  text: z.string().min(1),
  bonus: Bonus.optional(),
  grants: z.array(Grant).optional(),
});
export const BackgroundTable = z.object({
  ...record,
  owner: Owner,
  // Some books print only some columns (IoE has no Origin tables; Anhrathe only Objectives, IoE p.14).
  origin: z.array(backgroundRow).default([]),
  accomplishment: z.array(backgroundRow).default([]),
  goal: z.array(backgroundRow).default([]),
  objectives: z.array(z.string().min(1)).default([]),
});
export type BackgroundTable = z.infer<typeof BackgroundTable>;

// Choices a Species or Faction offers, beyond Archetype and Talents: Kroot Mutations (FSPG p.98), Asuryani Paths
// (IoE p.10), Kin Cloneskein Traits, Apocrypha Homeworlds and templates.
export const OptionGroup = z.object({
  ...record,
  owner: Owner,
  pick: z.union([z.number().int().positive(), z.literal("tier"), z.literal("any")]), // "tier": as many as your Tier
  xp: z.array(z.number().int().min(0)).min(1).default([0]), // cost of the 1st, 2nd… option taken; the last repeats
  options: z
    .array(
      Rule.extend({
        requires: z.array(Requirement).default([]),
        notAtCreation: z.boolean().default(false),
      }),
    )
    .min(1),
});
export type OptionGroup = z.infer<typeof OptionGroup>;

export const Archetype = z.object({
  ...record,
  factionId: id,
  tier: z.number().int().min(1).max(5),
  speciesIds: ids,
  xp: z.number().int().min(0),
  keywords: z.array(keyword).default([]),
  attributes,
  skills,
  abilities: z.array(Rule).min(1),
  wargear: z.array(Grant).default([]),
  influence: z.number().int().optional(), // not printed on every entry (IoE, some FSPG)
  suggested: z
    .object({
      attributes: attributes.optional(),
      skills: skills.optional(),
      talentIds: z.array(id).default([]),
      powerIds: z.array(id).default([]),
    })
    .optional(),
});
export type Archetype = z.infer<typeof Archetype>;

export const TalentCategory = z.enum(["talent", "faith", "exarch", "prayer", "vow"]);
export const Talent = z.object({
  ...record,
  category: TalentCategory.default("talent"),
  xp: XpCost,
  requires: z.array(Requirement).default([]),
  effect: z.string().min(1),
  repeatable: z.boolean().default(false),
  mods: Mods.optional(),
  grants: z.array(Grant).optional(),
});
export type Talent = z.infer<typeof Talent>;

export const Package = z.object({
  ...record,
  kind: z.enum(["ascension", "advancement"]),
  xp: XpCost,
  requires: z.array(Requirement).default([]),
  notAtCreation: z.boolean().default(false),
  effect: z.string().min(1),
  influence: z.number().int().default(0),
  grants: z.array(Grant).default([]),
  becomesArchetypeId: id.optional(), // an Advancement Package that turns one Archetype into another (VoA p.27)
});
export type Package = z.infer<typeof Package>;

export const Discipline = z.object({
  ...record,
  text: z.string().default(""),
  requires: z.array(Requirement).default([]),
});
export type Discipline = z.infer<typeof Discipline>;

export const PsychicPower = z.object({
  ...record,
  disciplineId: id,
  xp: XpCost,
  dn: z.union([z.number().int().positive(), z.string().min(1)]), // "Target's Defence"
  activation: z.string().min(1),
  duration: z.string().min(1),
  range: z.string().min(1),
  multiTarget: z.union([z.boolean(), z.string().min(1)]),
  tags: z.array(z.string().min(1)).default([]), // the power's Keywords (PSYCHIC…), not Faction Keywords
  effect: z.string().min(1),
  potency: z.array(z.string().min(1)).default([]), // "[3] +1 Mortal Wound", "*" kept as printed
  requires: z.array(Requirement).default([]),
});
export type PsychicPower = z.infer<typeof PsychicPower>;

// A Patron's Framework options (FSPG pp.64–89).
export const Patron = z.object({
  ...record,
  text: z.string().default(""),
  options: z
    .array(
      z.object({
        name: z.string().min(1),
        limitations: z.array(Requirement).default([]),
        wargear: z.array(Grant).default([]),
        bonus: z.string().min(1),
      }),
    )
    .min(1),
});
export type Patron = z.infer<typeof Patron>;

// Names, appearance, languages: rolled tables with no rules effect.
export const FlavourTable = z.object({
  ...record,
  owner: Owner.optional(),
  columns: z.array(z.string().min(1)).min(1),
  rows: z.array(z.array(z.string())).min(1),
});
export type FlavourTable = z.infer<typeof FlavourTable>;

// packages/data/creation/<type>/<source>.json, one array each.
export const CREATION_TYPES = {
  keywords: Keyword,
  factions: Faction,
  "sub-factions": SubFaction,
  species: Species,
  backgrounds: BackgroundTable,
  "option-groups": OptionGroup,
  archetypes: Archetype,
  talents: Talent,
  packages: Package,
  disciplines: Discipline,
  powers: PsychicPower,
  patrons: Patron,
  flavour: FlavourTable,
} as const;
export type CreationType = keyof typeof CREATION_TYPES;
export type Creation = { [K in CreationType]: z.infer<(typeof CREATION_TYPES)[K]>[] };
