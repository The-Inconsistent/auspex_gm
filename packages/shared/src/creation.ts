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

// Total XP to reach a rating from 1 (Attributes, Core p.24) or 0 (Skills, Core p.25), by rating.
export const ATTRIBUTE_XP = [0, 0, 4, 10, 20, 35, 55, 80, 110, 145, 185, 230, 280] as const;
export const SKILL_XP = [0, 2, 6, 12, 20, 30, 42, 56, 72] as const;
// A Species' printed XP is exactly the cost of the ratings it grants (Core p.29, FSPG pp.92–97), so validate checks it.
export const ratingsXp = (r: {
  attributes: Partial<Record<Attribute, number>>;
  skills: Partial<Record<Skill, number>>;
}) =>
  Object.values(r.attributes).reduce((n, v) => n + (ATTRIBUTE_XP[v] ?? 0), 0) +
  Object.values(r.skills).reduce((n, v) => n + (SKILL_XP[v] ?? 0), 0);

// An Archetype's printed XP is, for most entries in every book, its ratings plus (Tier − 1) × 10 for the Archetype
// Ability, so validate flags the others (a misprint, or a transcription error).
export const archetypeXp = (a: Parameters<typeof ratingsXp>[0] & { tier: number }) => ratingsXp(a) + (a.tier - 1) * 10;

const id = z.string().regex(/^[a-z0-9-]+$/);
const ids = z.array(id).min(1);
const keyword = z.string().regex(/^(\[[A-Z0-9' -]+\]|[A-Z0-9' -]+)$/); // as printed: "ADEPTUS ASTARTES", "[CHAPTER]"
const attribute = z.enum(ATTRIBUTES as unknown as [Attribute, ...Attribute[]]);
const skill = z.enum(Object.keys(SKILLS) as [Skill, ...Skill[]]);
const rating = z.number().int().min(0).max(12);
const cap = z.number().int().min(1).max(20); // a Species maximum: Custodian S 14, Ghost Warrior S 16 (Apocrypha p.18)

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

const requirements = [
  z.object({ kind: z.literal("attribute"), attribute, min: rating }),
  z.object({ kind: z.literal("skill"), skill, min: rating }),
  z.object({ kind: z.literal("influence"), min: z.number().int() }),
  z.object({ kind: z.literal("keyword"), anyOf: z.array(keyword).min(1) }),
  z.object({ kind: z.literal("notKeyword"), anyOf: z.array(keyword).min(1) }),
  z.object({ kind: z.literal("species"), anyOf: ids }), // a Species' `countsAs` matches too
  z.object({ kind: z.literal("notSpecies"), anyOf: ids }),
  z.object({ kind: z.literal("archetype"), anyOf: ids }),
  z.object({ kind: z.literal("subFaction"), anyOf: ids }), // a Successor matches its `successorOf` too
  z.object({ kind: z.literal("talent"), anyOf: ids }),
  z.object({ kind: z.literal("notTalent"), anyOf: ids }), // "can't be taken with" (Alpha-level Psyker, Apocrypha p.230)
  // A choice from an OptionGroup: the Pariah template (Anathema, Apocrypha p.230).
  z.object({ kind: z.literal("option"), groupId: id, anyOf: z.array(z.string().min(1)).min(1) }),
  z.object({ kind: z.literal("power"), anyOf: ids }),
  z.object({ kind: z.literal("wargear"), anyOf: z.array(z.string().min(1)).min(1) }), // printed names, e.g. an augmetic
  z.object({ kind: z.literal("rank"), min: z.number().int().min(1) }),
  z.object({ kind: z.literal("tier"), min: z.number().int().min(1).max(5) }),
  z.object({ kind: z.literal("text"), text: z.string().min(1) }), // not mechanical; validate counts these
] as const;
export const RequirementOne = z.discriminatedUnion("kind", requirements);
// `either`: any one of `of` will do ("Absolvers Chapter, or extensive Gilead experience", VoA p.47; "Rating 1+ in any
// of" seven Skills, Core p.135).
export const Requirement = z.discriminatedUnion("kind", [
  ...requirements,
  z.object({ kind: z.literal("either"), of: z.array(RequirementOne).min(2) }),
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
  z.object({ keywords: z.array(keyword).min(2) }), // taken together: "ANHRATHE and [COTERIE]" (Core p.39)
  z.object({ power: id }),
  z.object({ wargear: WargearItem }),
  z.object({ bundle: z.array(WargearItem).min(2) }), // items taken together: "a Bolt Pistol and a Chainsword" (Core p.99)
  z.object({ text: z.string().min(1) }), // "1 item of Uncommon Wargear"
]);
export const Grant = z.union([
  grantOne,
  // powers of the character's choice from these disciplines ("choose two powers from Divination, Phantasmancy or
  // Telepathy", IoE p.49)
  z.object({ choose: z.number().int().positive(), fromDisciplines: ids }),
  // Skills of the character's choice raised to `rating`: "Increase any two Skills of your choice to 4" (Core p.116);
  // `skills` limits the choice ("Ballistic Skill 2 or Weapon Skill 2", Apocrypha p.79).
  z.object({
    choose: z.number().int().positive(),
    rating: z.number().int().min(1).max(8),
    skills: z.array(skill).min(2).optional(),
  }),
  // `optional`: the character may take none ("You may choose to take the PSYKER Keyword", Core p.29).
  z.object({
    choose: z.number().int().positive(),
    from: z.array(grantOne).min(1),
    optional: z.boolean().default(false),
  }),
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
  writeIn: z.boolean().default(false), // the player may fill it with a name the books don't list (rules-flow.md §11.25)
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
  // A Successor Chapter's founding Chapter. One with no traits of its own takes its parent's (Absolvers → Blood Angels,
  // docs/rules-flow.md §11.23).
  successorOf: id.optional(),
  traits: z.array(Rule.extend({ geneSeed: z.boolean().default(false) })).default([]), // Primaris ignore gene-seed (Core p.71)
});
export type SubFaction = z.infer<typeof SubFaction>;

const attributes = z.partialRecord(attribute, rating);
const skills = z.partialRecord(skill, z.number().int().min(0).max(8));

export const Species = z.object({
  ...record,
  xp: z.number().int().min(0), // already inside every archetype's cost (Core p.29)
  speed: z.number().int().positive(),
  size: z.enum(["Tiny", "Small", "Average", "Large", "Huge", "Gargantuan"]).optional(), // not printed for every Species
  attributes, // the ratings the Species grants
  skills,
  max: z.object({ S: cap, T: cap, A: cap, I: cap, Wil: cap, Int: cap, Fel: cap, speed: cap }).optional(), // not printed for every Species (Necrontyr)
  keywords: z.array(keyword).default([]), // Species Keywords (Core p.38), for Advanced Creation
  abilities: z.array(Rule).default([]),
  grants: z.array(Grant).default([]), // e.g. "either IMPERIUM or CHAOS"
  // Species it also counts as for requirements: Primaris is Adeptus Astartes (docs/rules-flow.md §11.18).
  countsAs: z.array(id).default([]),
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
  requires: z.array(Requirement).optional(), // who may take the row: a Navis Nobilite Origin matches the House (§11.26)
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
  text: z.string().default(""), // the group's own printed rule: how many, what it costs, what limits it
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
  requires: z.array(Requirement).default([]), // beyond Species: a Pariah archetype needs the Pariah template
  xp: z.number().int().min(0),
  keywords: z.array(keyword).default([]),
  grants: z.array(Grant).default([]), // a keyword choice: "either ASTRA MILITARUM, [REGIMENT] or …" (Apocrypha p.109)
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
      xp: z
        .object({ attributes: z.number().int().min(0), skills: z.number().int().min(0) })
        .partial()
        .optional(), // as printed
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
  // "perChoice": once for each choice of its bracket or option (Hatred [Any], Signature Saedath; rules-flow.md §11.29).
  repeatable: z.union([z.boolean(), z.literal("perChoice")]).default(false),
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
  // "+2 per Tier Ascended" (Dauntless Reputation, Core p.151) is { perTier: 2 }
  influence: z.union([z.number().int(), z.object({ perTier: z.number().int() })]).default(0),
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
  alsoIn: z.array(id).default([]), // other disciplines that list it (Miasma of Pestilence in Contagion, Apocrypha p.303)
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
        text: z.string().default(""), // the Framework's description and Example Missions
        limitations: z.array(Requirement).default([]),
        wargear: z.array(Grant).default([]),
        bonus: z.string().min(1),
        grants: z.array(Grant).default([]), // what the Bonus gives outright: "gain the NAVIS NOBILITE Keyword"
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
