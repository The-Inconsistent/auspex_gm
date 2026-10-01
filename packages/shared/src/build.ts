import { z } from "zod";
import {
  ATTRIBUTE_XP,
  CREATION_TYPES,
  LANGUAGE_XP,
  MAX_BOUGHT_WEALTH,
  SKILL_XP,
  WEALTH_XP,
  WargearItem,
  startingXp,
  rankOf,
  treeOfLearning,
  type Creation,
  type Grant,
  type Requirement,
  type Rule,
  type Amount as AmountSchema,
  type Archetype,
  type BackgroundTable,
  type Scaled,
  type SubFaction,
  type WargearFilter,
  type XpCost,
} from "./creation.ts";
import { RARITY_DN } from "./requisition.ts";
import { SOURCES, sourceCite, type Source } from "./source.ts";
import { ATTRIBUTES, CharacterStats, SKILLS, Tier, type Attribute, Mods, type Skill } from "./state.ts";
import { Wargear, gearLine, sheetWeapon, type WargearWeapon } from "./wargear.ts";

// The character builder (issue #9, docs/data.md §9): a character is the choices made at creation, and its sheet is
// derived from them by `resolveBuild`, which the web runs for a live preview and the api re-runs before it saves.
// Every number comes from the creation catalogue or a cited constant in creation.ts; GM rulings are rules-flow.md §11.

const id = z.string().regex(/^[a-z0-9-]+$/);
const keyword = z.string().regex(/^(\[[A-Z0-9' -]+\]|[A-Z0-9' -]+)$/);
const attribute = z.enum(ATTRIBUTES as unknown as [Attribute, ...Attribute[]]);
const skill = z.enum(Object.keys(SKILLS) as [Skill, ...Skill[]]);

export const BACKGROUND_ROWS = ["origin", "accomplishment", "goal"] as const;
export const BackgroundRow = z.enum(BACKGROUND_ROWS);
export type BackgroundRow = z.infer<typeof BackgroundRow>;

// The builder's screens (issue #9 §7); every pending choice and problem names the one that fixes it.
export const BUILD_STEPS = ["tier", "archetype", "customise", "faction", "ascension", "detail", "advance"] as const;
export type BuildStep = (typeof BUILD_STEPS)[number];

// The answer to one choice in a grant, keyed by its path (see `grantPath` below): option indexes for `choose … from`,
// otherwise the picked ids or names (wargear ids, Skills, disciplines, powers, an Attribute, a keyword).
export const BuildChoice = z.array(z.union([z.number().int().min(0), z.string().min(1).max(100)])).max(20);
export type BuildChoice = z.infer<typeof BuildChoice>;

// Advancement (Core pp.146–151, issue #9 step 5): what the character buys after creation with the XP earned in play,
// priced from where creation left the ratings. `packages`: Advancement Packages (`notAtCreation` ones too), and one
// Ascension Package each time the group has Ascended since creation, in order (Core p.148, rules-flow.md §11.55).
// `archetypeAscension` takes one Ascension's slot instead, the one to its own Tier (Core p.155, §11.67).
export const Advancement = z
  .object({
    attributes: z.partialRecord(attribute, z.number().int().min(1).max(12)).prefault({}),
    skills: z.partialRecord(skill, z.number().int().min(0).max(8)).prefault({}),
    talents: z.array(z.object({ id, choice: z.string().min(1).max(60).optional() })).prefault([]),
    powers: z.array(id).prefault([]),
    packages: z.array(id).prefault([]),
    languages: z.array(z.string().min(1).max(60)).prefault([]), // bought at 1 XP each (Core p.31)
    // Archetype Ascension (Core p.155): an Archetype of the same Faction at the Tier Ascended to, in place of an
    // Ascension Package. It gives that Archetype's abilities, Keywords, Wargear and Influence, not its ratings.
    archetypeAscension: z.object({ archetypeId: id }).optional(),
    // When each purchase was bought: the session number it first appeared in, keyed by `purchaseKey` (§11.68). The
    // server stamps it and throws a client's copy away, because "when" is the table's fact, not the builder's. Nothing
    // is priced from it — `resolveBuild` only reads it to label the ledger — so a build resolves to the same XP with it
    // and without it, and a build saved before it existed simply has none.
    boughtIn: z.record(z.string().min(1).max(200), z.number().int().min(1).max(10_000)).prefault({}),
  })
  .prefault({});

// A purchase made in play, as a stable key for the history (`Advancement.boughtIn`, §11.68). A rating is one key per
// rating point reached, so buying the same Attribute again later leaves the earlier point's session alone; a Talent's
// bracket pick is part of it (Hatred [Orks] is not Hatred [Tyranids]); `~n` separates the second and later copies of an
// otherwise identical purchase (a repeatable Talent taken twice with the same pick).
export type Purchase =
  | { kind: "attribute"; attribute: Attribute; rating: number }
  | { kind: "skill"; skill: Skill; rating: number }
  | { kind: "talent"; id: string; choice?: string }
  | { kind: "power"; id: string }
  | { kind: "package"; id: string }
  | { kind: "language"; name: string }
  | { kind: "ascension"; archetypeId: string };

export function purchaseKey(p: Purchase): string {
  switch (p.kind) {
    case "attribute":
      return `advance/attribute/${p.attribute}/${p.rating}`;
    case "skill":
      return `advance/skill/${p.skill}/${p.rating}`;
    case "talent":
      return `advance/talent/${p.id}${p.choice ? `:${p.choice}` : ""}`;
    case "power":
      return `advance/power/${p.id}`;
    case "package":
      return `advance/package/${p.id}`;
    case "language":
      return `advance/language/${p.name}`;
    case "ascension":
      return `advance/ascension/${p.archetypeId}`;
  }
}

export const CharacterBuild = z.object({
  tier: Tier, // the campaign Tier the character is made for
  budget: z.number().int().min(0).max(1000).optional(), // a GM's custom budget ("75, or even 50 XP", Core p.20)
  archetypeId: id,
  speciesId: id.optional(), // when the archetype allows several
  // What fills each [PLACEHOLDER] keyword: a sub-faction, or a name the player writes in where the keyword allows it
  // (rules-flow.md §11.25).
  fills: z.record(keyword, z.union([z.object({ id }), z.object({ writeIn: keyword })])).prefault({}),
  // One row of each column by name, and which row's bonus applies: only one does (rules-flow.md §11.22).
  background: z
    .object({
      tableId: id,
      origin: z.string().min(1).optional(),
      accomplishment: z.string().min(1).optional(),
      goal: z.string().min(1).optional(),
      bonus: BackgroundRow.optional(),
    })
    .optional(),
  options: z.array(z.object({ groupId: id, name: z.string().min(1) })).prefault([]), // in the order taken (XP by order)
  // Ratings bought with XP, as the rating to reach. A rating at or below what is granted buys nothing.
  attributes: z.partialRecord(attribute, z.number().int().min(1).max(12)).prefault({}),
  skills: z.partialRecord(skill, z.number().int().min(0).max(8)).prefault({}),
  // `choice`: a bracketed Talent's pick ("Acute Sense (smell)", Hatred [Orks]; rules-flow.md §11.29).
  talents: z.array(z.object({ id, choice: z.string().min(1).max(60).optional() })).prefault([]),
  powers: z.array(id).prefault([]),
  packages: z.array(id).prefault([]), // the Creation Ascension Package, and Advancement Packages bought at creation
  // Languages beyond Low Gothic (Core p.31): `picks` are the free ones (one allowed by a keyword, plus any a grant
  // gives), `bought` cost 1 XP each. A catalogue id, or a write-in name the GM approves (rules-flow.md §11.48–50).
  languages: z
    .object({
      picks: z.array(z.string().min(1).max(60)).prefault([]),
      bought: z.array(z.string().min(1).max(60)).prefault([]),
    })
    .prefault({}),
  wealth: z.number().int().min(0).max(MAX_BOUGHT_WEALTH).prefault(0), // bought on top of the starting Tier (§11.51)
  choices: z.record(z.string().min(1).max(200), BuildChoice).prefault({}),
  advancement: Advancement,
  // The GM's part: rulings on this character that no book makes, and ticks on what only the GM can judge.
  gm: z
    .object({
      species: id.optional(), // "Rubicon Primaris makes him Primaris Astartes" (docs/pregens.md, GM choice 2)
      keywords: z.array(keyword).prefault([]), // DEATHWATCH (docs/kill-team.md decision 3)
      gear: z
        .object({ remove: z.array(z.string().min(1)).prefault([]), add: z.array(WargearItem).prefault([]) })
        .prefault({}),
      approved: z.array(z.string().min(1).max(200)).prefault([]), // paths of `gm` requirements and `story` grants
      // Trait bonuses granted by ruling, added to the build's: the volkus pregens keep all three Background bonuses
      // (docs/pregens.md, GM choice 23; rules-flow.md §11.22).
      mods: Mods.prefault({}),
    })
    .prefault({}),
});
export type CharacterBuild = z.infer<typeof CharacterBuild>;
export type CharacterBuildInput = z.input<typeof CharacterBuild>;

// `pool`: "advancement" for XP earned in play; absent for the creation budget. `key` and `session` are the purchase
// history (§11.68), only ever on an advancement row: `key` is what `Advancement.boughtIn` is keyed by, `session` the
// session number stamped for it, absent until a save stamps one.
export type LedgerRow = {
  what: string;
  xp: number;
  cite?: string;
  step: BuildStep;
  pool?: "advancement";
  key?: string;
  session?: number;
};
// A choice still to make: `choose` of `options` (labels, answered by index) or, when `options` is empty, of the ids
// or names `of` describes.
export type PendingChoice = {
  path: string;
  step: BuildStep;
  what: string;
  choose: number;
  options: string[];
  of?: string;
  cite?: string;
  pick?: ChoicePick; // answered in `choices[path]`; without it, the builder's own field for that step answers it
};
// What a choice in `choices` picks from, so the builder can offer it: option indexes, or ids and names.
export type ChoicePick =
  | { kind: "option" }
  | { kind: "wargear"; filter: WargearFilter }
  | { kind: "skill"; from: Skill[] }
  | { kind: "attribute"; from: Attribute[] }
  | { kind: "discipline"; from: string[] | null }
  | { kind: "power"; disciplines: string[] }
  | { kind: "keyword" };
// Every choice a grant asks for, answered or not, with the current answer: the builder shows them all.
export type BuildChoicePrompt = PendingChoice & { pick: ChoicePick; answer: BuildChoice };
// "error" blocks saving; "gm" needs the GM's tick (its path in `gm.approved`) before it does.
export type BuildProblem = { step: BuildStep; what: string; cite?: string; severity: "error" | "gm"; path?: string };
// What the build gives that a sheet has no field for: Faith, Corruption, followers, bonus dice in a situation…
export type BuildEffect = { what: string; cite?: string };

export type ResolvedBuild = {
  sheet: CharacterStats;
  budget: number;
  spent: number;
  ledger: LedgerRow[];
  pending: PendingChoice[];
  choices: BuildChoicePrompt[];
  problems: BuildProblem[];
  effects: BuildEffect[];
  // In play: the XP earned (the advancement budget), what advancement spends of it, what is left, Rank, the Tier now.
  advancement: { budget: number; spent: number; rank: number; tier: number } | null;
};

// Ready to save: nothing left to choose, nothing wrong, and every GM question ticked.
export const buildReady = (r: ResolvedBuild) => r.pending.length === 0 && r.problems.length === 0;

export type BuildCatalogue = { creation: Creation; wargear: ReadonlyMap<string, Wargear>; homebrew: boolean };

// What GET /api/campaigns/:id/creation serves a seat: the catalogue, filtered to the campaign's allowed books, and the
// Wargear catalogue the builder's picks and sheet preview read.
export type CreationPayload = { homebrew: boolean; creation: Creation; wargear: Wargear[] };
export const CreationPayload = z.object({
  homebrew: z.boolean(),
  creation: z.object(
    Object.fromEntries(Object.entries(CREATION_TYPES).map(([k, schema]) => [k, schema.array()])) as {
      [K in keyof typeof CREATION_TYPES]: z.ZodArray<(typeof CREATION_TYPES)[K]>;
    },
  ),
  wargear: Wargear.array(),
});
export const catalogueOf = (p: CreationPayload): BuildCatalogue => ({
  creation: p.creation,
  wargear: new Map(p.wargear.map((w) => [w.id, w])),
  homebrew: p.homebrew,
});

// The catalogue without the homebrew books: their records, and the homebrew rules merged onto official ones
// (docs/data.md §9, "Keep homebrew extras").
export function officialOnly(c: Creation): Creation {
  const keep = <T extends { source: Source }>(list: T[]) => list.filter((r) => official(r.source));
  const rules = <R extends { source?: Source }>(list: R[]) => list.filter((r) => !r.source || official(r.source));
  return {
    ...c,
    keywords: keep(c.keywords),
    factions: keep(c.factions).map((f) => ({ ...f, rules: rules(f.rules) })),
    "sub-factions": keep(c["sub-factions"]).map((s) => ({ ...s, traits: rules(s.traits) })),
    species: keep(c.species).map((s) => ({ ...s, abilities: rules(s.abilities) })),
    backgrounds: keep(c.backgrounds),
    "option-groups": keep(c["option-groups"]).map((g) => ({ ...g, options: rules(g.options) })),
    archetypes: keep(c.archetypes).map((a) => ({ ...a, abilities: rules(a.abilities) })),
    talents: keep(c.talents),
    packages: keep(c.packages),
    disciplines: keep(c.disciplines),
    powers: keep(c.powers),
    patrons: keep(c.patrons),
    languages: keep(c.languages),
    flavour: keep(c.flavour),
  };
}

// ── indexes ──────────────────────────────────────────────────────────────────────────────────────────────────────────

type Amount = z.infer<typeof AmountSchema>;
// A rolled amount ("1d3 Corruption") is played at the table, not added up here.
const numeric = (a: Amount): Scaled | undefined =>
  typeof a === "number" ||
  (typeof a === "object" && !("roll" in a) && Object.values(a).every((v) => typeof v === "number"))
    ? (a as Scaled)
    : undefined;

const byId = <T extends { id: string }>(list: T[]) => new Map(list.map((r) => [r.id, r]));
const indexes = new WeakMap<Creation, ReturnType<typeof indexOf>>();
function indexOf(c: Creation) {
  return {
    archetypes: byId(c.archetypes),
    species: byId(c.species),
    subFactions: byId(c["sub-factions"]),
    keywords: new Map(c.keywords.map((k) => [k.name, k])),
    backgrounds: byId(c.backgrounds),
    optionGroups: byId(c["option-groups"]),
    talents: byId(c.talents),
    packages: byId(c.packages),
    disciplines: byId(c.disciplines),
    powers: byId(c.powers),
    languages: byId(c.languages),
  };
}
const index = (c: Creation) => indexes.get(c) ?? (indexes.set(c, indexOf(c)), indexes.get(c)!);

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const official = (source: Source) => SOURCES[source].official;
const cite = (r: { source: Source; page: number }) => sourceCite(r);

// ── the character as it is built up ──────────────────────────────────────────────────────────────────────────────────

type Origin = { path: string; step: BuildStep; cite: string; tiersAscended: number; granted: boolean };
type GearItem = z.infer<typeof WargearItem> & { from: string };
type Deferred = {
  reqs: Requirement[];
  what: string;
  origin: Origin;
  severity: "error" | "gm";
  tier?: number;
  choice?: string;
};

type Sheet = {
  base: { attributes: Record<Attribute, number>; skills: Partial<Record<Skill, number>> };
  keywords: string[];
  abilities: { name: string; text: string; page?: string }[];
  talents: Map<string, { id: string; name: string; text: string; page: string; choices: (string | undefined)[] }>;
  powers: Set<string>;
  disciplines: Set<string>;
  // the only disciplines this character may learn from ("may only learn and use Navigator powers", Apocrypha p.119)
  only: Set<string> | null;
  mods: Record<string, number>;
  wealth: number;
  gear: GearItem[];
  weapons: { name: string; weapon: WargearWeapon }[];
  languageGrants: (number | { skill: Skill })[];
  influenceAttribute?: Attribute;
  xpDiscounts: { talents: Map<string, number>; disciplines: { id: string | undefined; multiplier: number }[] };
  neverKeywords: Set<string>;
  optionAccess: Set<string>;
  subFactionIds: string[];
};

// `play`: a character already in play: the campaign's Tier now and the XP it has earned (character.xp). Without it,
// the build is priced as at creation. `xpAtAscension` is the character's XP when the group last Ascended, which the
// server's eligibility check reads (Core pp.147–148); the build itself only prices what is bought.
// `packageWaived`: a Milestone Ascension may excuse the Ascension Package (Core p.148 step 2), so don't ask for one.
export function resolveBuild({
  catalogue,
  build: input,
  play,
}: {
  catalogue: BuildCatalogue;
  build: CharacterBuildInput;
  play?: { tier: number; xpEarned: number; xpAtAscension?: number; packageWaived?: boolean };
}): ResolvedBuild {
  const build = CharacterBuild.parse(input);
  const ix = index(catalogue.creation);
  const tier = build.tier; // the Tier the character was made at
  const nowTier = Math.max(tier, play?.tier ?? tier);
  // Rank 1 at creation (Core p.36), also after a Creation Ascension (p.148); then +1 per 40 XP earned (pp.146–147).
  const rank = play ? rankOf(play.xpEarned) : 1;
  const budget = build.budget ?? startingXp(tier);
  const ledger: LedgerRow[] = [];
  const pending: PendingChoice[] = [];
  const choices: BuildChoicePrompt[] = [];
  const problems: BuildProblem[] = [];
  const effects: BuildEffect[] = [];
  const deferred: Deferred[] = [];
  const later: { grant: Grant; origin: Origin }[] = []; // grants gated on requirements, applied once the rest is known
  const approved = new Set(build.gm.approved);

  const problem = (p: BuildProblem) => {
    if (p.severity === "gm" && p.path && approved.has(p.path)) return;
    problems.push(p);
  };
  // The purchase history is a label on an advancement row and nothing else: no price, no problem and no sheet field
  // reads it, so a build resolves identically with and without it (§11.68). `~n` keeps two identical purchases apart.
  const copies = new Map<string, number>();
  const dated = (p: Purchase) => {
    const base = purchaseKey(p);
    const n = (copies.get(base) ?? 0) + 1;
    copies.set(base, n);
    const key = n > 1 ? `${base}~${n}` : base;
    return { key, session: build.advancement.boughtIn[key] };
  };
  const allowed = (r: { name: string; source: Source; page: number }, step: BuildStep) => {
    if (catalogue.homebrew || official(r.source)) return true;
    problem({
      step,
      severity: "error",
      what: `${r.name} is homebrew (${SOURCES[r.source].cite}), and this campaign allows none`,
      cite: cite(r),
    });
    return false;
  };
  const ownRules = <R extends Rule>(rules: R[]) =>
    rules.filter((r) => catalogue.homebrew || !r.source || official(r.source));

  const s: Sheet = {
    base: { attributes: Object.fromEntries(ATTRIBUTES.map((a) => [a, 1])) as Record<Attribute, number>, skills: {} },
    keywords: [],
    abilities: [],
    talents: new Map(),
    powers: new Set(),
    disciplines: new Set(),
    only: null,
    mods: {},
    wealth: tier, // starting Wealth = Tier (Core p.38)
    gear: [],
    weapons: [],
    languageGrants: [],
    xpDiscounts: { talents: new Map(), disciplines: [] },
    neverKeywords: new Set(),
    optionAccess: new Set(),
    subFactionIds: [],
  };
  const addKeyword = (k: string) => {
    if (!s.keywords.includes(k)) s.keywords.push(k);
  };
  const addMods = (m: Partial<Record<string, Scaled>> | undefined, o: Origin) => {
    for (const [k, v] of Object.entries(m ?? {})) {
      s.mods[k] = (s.mods[k] ?? 0) + scaled(v!, o);
    }
  };
  const scaled = (v: Scaled, o: Origin): number => {
    if (typeof v === "number") return v;
    if ("perTier" in v) return v.perTier * o.tiersAscended;
    if ("timesTier" in v) return v.timesTier * nowTier;
    if ("perRank" in v) return v.perRank * rank + (v.plus ?? 0);
    return rank + v.rankPlus;
  };
  const addRule = (r: Rule, o: Origin) => {
    const page = r.page
      ? r.source
        ? cite({ source: r.source, page: r.page })
        : `${o.cite.split(" p.")[0]} p.${r.page}`
      : o.cite;
    s.abilities.push({ name: r.name, text: r.text, page });
    addMods(r.mods, o);
    r.grants?.forEach((g, i) => grant(g, { ...o, path: `${o.path}/${norm(r.name)}/${i}` }));
  };

  const choiceFor = (path: string) => build.choices[path];
  const ask = (c: PendingChoice) => void pending.push(c);
  // A choice answered in `choices[path]`: always listed for the builder, and pending until `done`.
  const choose = (c: PendingChoice & { pick: ChoicePick }, done: boolean) => {
    choices.push({ ...c, answer: choiceFor(c.path) ?? [] });
    if (!done) pending.push(c);
  };

  // XP of a Talent, power or package at creation. "× the new Tier" is the campaign Tier (Core p.149).
  const price = (x: XpCost, { path, step, what }: { path: string; step: BuildStep; what: string }): number => {
    if (typeof x === "number") return x;
    if ("perTier" in x) return x.perTier * tier;
    if ("atCreation" in x) return x.atCreation; // Smite (Core p.272)
    if ("base" in x) {
      problem({
        step,
        severity: "gm",
        path: `${path}/xp`,
        what: `${what} costs ${x.base} XP plus ${x.plus}: the GM adds it`,
      });
      return x.base;
    }
    const pick = choiceFor(`${path}/xp`)?.[0];
    const c = typeof pick === "number" ? x.byChoice[pick] : undefined;
    choose(
      {
        path: `${path}/xp`,
        step,
        what: `${what}: which price applies`,
        choose: 1,
        options: x.byChoice.map((b) => `${b.xp} XP: ${b.when}`),
        pick: { kind: "option" },
      },
      !!c,
    );
    return c?.xp ?? x.byChoice[0]!.xp;
  };

  // Ratings as they stand: granted, or bought up to (the ledger prices the difference once the grants are all in).
  const ratings = () => ({
    attributes: Object.fromEntries(
      ATTRIBUTES.map((a) => [
        a,
        Math.max(s.base.attributes[a], build.attributes[a] ?? 0, build.advancement.attributes[a] ?? 0),
      ]),
    ) as Record<Attribute, number>,
    skills: Object.fromEntries(
      (Object.keys(SKILLS) as Skill[])
        .map((k) => [k, Math.max(s.base.skills[k] ?? 0, build.skills[k] ?? 0, build.advancement.skills[k] ?? 0)])
        .filter(([, v]) => (v as number) > 0),
    ) as Partial<Record<Skill, number>>,
  });

  // A Talent on the sheet, bought or granted, with its own mods and grants (once, however it arrives).
  const addTalent = (talentId: string, o: Origin, choice?: string) => {
    const t = ix.talents.get(talentId);
    if (!t) return problem({ step: o.step, severity: "error", what: `Unknown talent ${talentId}` });
    const have = s.talents.get(t.id);
    if (have) {
      if (o.granted) return; // granted twice (Rubicon and a Doctrine both give Bolter Discipline): one Talent
      if (t.repeatable === false || (t.repeatable === "perChoice" && have.choices.includes(choice)))
        return problem({ step: o.step, severity: "error", what: `${t.name} is already taken`, cite: cite(t) });
      have.choices.push(choice);
      return;
    }
    // A granted Talent that picks one of its options (Acute Sense's sense, Core p.129) asks for it; the grant names none.
    if (t.options && o.granted && !choice) {
      const path = `${o.path}/choice`;
      const i = choiceFor(path)?.[0];
      choice = typeof i === "number" ? t.options[i] : undefined;
      choose(
        {
          path,
          step: o.step,
          what: `${t.name}: choose one`,
          choose: 1,
          options: t.options,
          cite: cite(t),
          pick: { kind: "option" },
        },
        !!choice,
      );
    }
    if ((t.repeatable === "perChoice" || t.options) && !choice && !o.granted)
      problem({ step: o.step, severity: "error", what: `${t.name}: choose what it applies to`, cite: cite(t) });
    if (t.options && choice && !t.options.some((x) => x.toLowerCase() === choice!.toLowerCase()))
      problem({
        step: o.step,
        severity: "error",
        what: `${t.name}: choose one of ${t.options.join(", ")}`,
        cite: cite(t),
      });
    s.talents.set(t.id, { id: t.id, name: t.name, text: t.effect, page: cite(t), choices: [choice] });
    const to: Origin = { ...o, path: `talent/${t.id}`, cite: cite(t) };
    // A granted Talent whose requirements aren't met is the GM's to tick, not a refusal (rules-flow.md §11.53).
    deferred.push({ reqs: t.requires, what: t.name, origin: o, severity: o.granted ? "gm" : "error", choice });
    addMods(t.mods, to);
    t.grants?.forEach((g, i) => grant(g, { ...to, path: `${to.path}/${i}` }));
  };

  const addItem = (item: z.infer<typeof WargearItem>, o: Origin) => void s.gear.push({ ...item, from: o.path });

  // ── grants ──
  // `gated`: a grant with its own requirements waits in `later` until the character is known, then comes back gated.
  function grant(g: Grant, o: Origin, gated = false): void {
    if (!gated && "requires" in g && g.requires) return void later.push({ grant: g, origin: o });
    if ("all" in g) return g.all.forEach((x, i) => grant(x, { ...o, path: `${o.path}/${i}` }));
    if ("choose" in g && "from" in g) {
      const n = scaled(g.choose, o);
      const answer = (choiceFor(o.path) ?? []).filter((x): x is number => typeof x === "number" && x < g.from.length);
      choose(
        {
          path: o.path,
          step: o.step,
          what: g.optional ? `Choose up to ${n}` : `Choose ${n}`,
          choose: n,
          options: g.from.map(label),
          cite: o.cite,
          pick: { kind: "option" },
        },
        answer.length >= n || (g.optional && !!choiceFor(o.path)), // an optional choice answered [] is declined
      );
      if (!g.repeat && new Set(answer).size !== answer.length)
        problem({ step: o.step, severity: "error", what: "The same option was chosen twice", cite: o.cite });
      return answer.slice(0, n).forEach((j, k) => grant(g.from[j]!, { ...o, path: `${o.path}/${k}` }));
    }
    if ("choose" in g && "rating" in g) {
      const picked = (choiceFor(o.path) ?? []).filter((x): x is Skill => typeof x === "string" && x in SKILLS);
      const bad = picked.filter((k) => g.skills && !g.skills.includes(k));
      if (bad.length)
        problem({
          step: o.step,
          severity: "error",
          what: `${bad.join(", ")} is not one of the Skills offered`,
          cite: o.cite,
        });
      const from = g.skills ?? (Object.keys(SKILLS) as Skill[]);
      choose(
        {
          path: o.path,
          step: o.step,
          what: `Raise ${g.choose} Skill${g.choose > 1 ? "s" : ""} to ${g.rating}`,
          choose: g.choose,
          options: [],
          of: from.join(", "),
          cite: o.cite,
          pick: { kind: "skill", from },
        },
        picked.length >= g.choose,
      );
      for (const k of picked.slice(0, g.choose)) s.base.skills[k] = Math.max(s.base.skills[k] ?? 0, g.rating);
      return;
    }
    if ("choose" in g && "fromDisciplines" in g) {
      const n = scaled(g.choose, o);
      const picked = (choiceFor(o.path) ?? []).filter((x): x is string => typeof x === "string");
      for (const p of picked.slice(0, n)) {
        const pw = ix.powers.get(p);
        if (!pw || ![pw.disciplineId, ...pw.alsoIn].some((d) => g.fromDisciplines.includes(d)))
          problem({
            step: o.step,
            severity: "error",
            what: `${pw?.name ?? p} is not in ${g.fromDisciplines.join(", ")}`,
            cite: o.cite,
          });
        else s.powers.add(pw.id);
      }
      choose(
        {
          path: o.path,
          step: o.step,
          what: g.random ? `Roll ${n} powers` : `Choose ${n} powers`,
          choose: n,
          options: [],
          of: `powers of ${g.fromDisciplines.join(", ")}`,
          cite: o.cite,
          pick: { kind: "power", disciplines: g.fromDisciplines },
        },
        picked.length >= n,
      );
      return;
    }
    if ("talent" in g) return addTalent(g.talent, { ...o, granted: true });
    if ("keyword" in g) return addKeyword(g.keyword);
    if ("keywords" in g) return g.keywords.forEach(addKeyword);
    if ("power" in g) return void s.powers.add(g.power);
    if ("wargear" in g) return addItem(g.wargear, o);
    if ("bundle" in g) return g.bundle.forEach((x) => addItem(x, o));
    if ("pick" in g) {
      const path = o.path;
      const n = scaled(g.pick, o);
      const picked = (choiceFor(path) ?? []).filter((x): x is string => typeof x === "string");
      for (const wid of picked.slice(0, n)) {
        const w = catalogue.wargear.get(wid);
        if (!w || !wargearMatches(w, g.wargearOf, { tier, newTier: tier }))
          problem({
            step: o.step,
            severity: "error",
            what: `${w?.name ?? wid} doesn't qualify for this pick`,
            cite: o.cite,
          });
        else addItem({ name: w.name, qty: 1, wargearId: w.id, scope: "character" }, o);
      }
      if (g.wargearOf.upgrade || g.wargearOf.condition)
        problem({
          step: o.step,
          severity: "gm",
          path: `${path}/condition`,
          what: `Wargear pick: ${g.wargearOf.upgrade ?? g.wargearOf.condition}`,
          cite: o.cite,
        });
      choose(
        {
          path,
          step: o.step,
          what: `Pick ${n} wargear`,
          choose: n,
          options: [],
          of: describeFilter(g.wargearOf),
          cite: o.cite,
          pick: { kind: "wargear", filter: g.wargearOf },
        },
        picked.length >= n,
      );
      return;
    }
    if ("weapon" in g) {
      const { name, range, ...w } = g.weapon;
      return void s.weapons.push({ name, weapon: { ...w, range } });
    }
    if ("wealth" in g) {
      const n = numeric(g.wealth);
      return void (n === undefined
        ? effects.push({ what: `Wealth ${amount(g.wealth)}`, cite: o.cite })
        : (s.wealth += scaled(n, o)));
    }
    if ("influence" in g) return void (s.mods.influence = (s.mods.influence ?? 0) + scaled(g.influence, o));
    if ("mods" in g) {
      const { armourRating, ...rest } = g.mods;
      if (armourRating !== undefined) s.mods.armourRating = (s.mods.armourRating ?? 0) + scaled(armourRating, o);
      return addMods(rest, o);
    }
    if ("attribute" in g) {
      const which = g.attribute;
      let targets: Attribute[];
      if (which === "lowest") {
        const min = Math.min(...ATTRIBUTES.map((a) => s.base.attributes[a]));
        targets = ATTRIBUTES.filter((a) => s.base.attributes[a] === min).slice(0, 1);
      } else if (which === "any" || Array.isArray(which)) {
        const picked = (choiceFor(o.path) ?? []).filter(
          (x): x is Attribute => typeof x === "string" && (ATTRIBUTES as readonly string[]).includes(x),
        );
        const ok = picked.filter((a) => which === "any" || which.includes(a)).slice(0, 1);
        const from = which === "any" ? [...ATTRIBUTES] : which;
        choose(
          {
            path: o.path,
            step: o.step,
            what: "Choose an Attribute",
            choose: 1,
            options: [],
            of: which === "any" ? "any Attribute" : which.join(", "),
            cite: o.cite,
            pick: { kind: "attribute", from },
          },
          ok.length > 0,
        );
        targets = ok;
      } else targets = [which];
      for (const a of targets) {
        if (g.add !== undefined) s.base.attributes[a] += g.add;
        if (g.to !== undefined) s.base.attributes[a] = Math.max(s.base.attributes[a], g.to);
      }
      return;
    }
    if ("skills" in g && "add" in g)
      return g.skills.forEach((k) => (s.base.skills[k] = (s.base.skills[k] ?? 0) + g.add));
    if ("languages" in g) {
      s.languageGrants.push(
        typeof g.languages === "object" && "skill" in g.languages ? g.languages : scaled(g.languages, o),
      );
      if (g.xenos) effects.push({ what: "One of the granted languages is an alien one", cite: o.cite });
      return;
    }
    if ("disciplineAccess" in g) return g.disciplineAccess.forEach((d) => s.disciplines.add(d));
    // falls through: the limit is still listed in effects
    if ("onlyDisciplines" in g && (!g.untilTier || nowTier < g.untilTier)) s.only = new Set(g.onlyDisciplines);
    if ("chooseDisciplines" in g) {
      // Under `onlyDisciplines` the Species' choice is what's left of those; an archetype that grants its one discipline
      // has filled it (rules-flow.md §11.62). Species grants are PSYKER-gated, so they come after the archetype's.
      const only = s.only && [...s.only].filter((d) => !s.disciplines.has(d) && (!g.from || g.from.includes(d)));
      if (only?.length === 0) return;
      const from = only ?? g.from;
      const picked = (choiceFor(o.path) ?? []).filter(
        (x): x is string => typeof x === "string" && ix.disciplines.has(x),
      );
      const ok = picked.filter((d) => !from || from.includes(d)).slice(0, g.chooseDisciplines);
      ok.forEach((d) => s.disciplines.add(d));
      choose(
        {
          path: o.path,
          step: o.step,
          what: `Choose ${g.chooseDisciplines} Discipline${g.chooseDisciplines > 1 ? "s" : ""}`,
          choose: g.chooseDisciplines,
          options: [],
          of: from?.join(", ") ?? "any Discipline you may learn",
          cite: o.cite,
          pick: { kind: "discipline", from: from ?? null },
        },
        ok.length >= g.chooseDisciplines,
      );
      return;
    }
    if ("optionAccess" in g) return void s.optionAccess.add(g.optionAccess);
    if ("neverKeyword" in g) return void s.neverKeywords.add(g.neverKeyword);
    if ("loseKeyword" in g) {
      const k = g.loseKeyword === "[ANY]" ? (choiceFor(o.path)?.[0] as string | undefined) : g.loseKeyword;
      if (g.loseKeyword === "[ANY]")
        choose(
          {
            path: o.path,
            step: o.step,
            what: "Choose the Keyword you lose",
            choose: 1,
            options: [],
            of: "one of your Keywords",
            cite: o.cite,
            pick: { kind: "keyword" },
          },
          !!k,
        );
      if (k) s.keywords = s.keywords.filter((x) => x !== k);
      return;
    }
    if ("influenceAttribute" in g) return void (s.influenceAttribute = g.influenceAttribute);
    if ("xpDiscount" in g) {
      const d = g.xpDiscount;
      if ("talent" in d) return void s.xpDiscounts.talents.set(d.talent, d.xp);
      const disc = d.discipline ?? (choiceFor(o.path)?.[0] as string | undefined);
      if (!d.discipline)
        choose(
          {
            path: o.path,
            step: o.step,
            what: "Choose the Discipline you learn cheaper",
            choose: 1,
            options: [],
            of: "a Discipline",
            cite: o.cite,
            pick: { kind: "discipline", from: null },
          },
          !!disc,
        );
      return void s.xpDiscounts.disciplines.push({ id: disc, multiplier: d.multiplier });
    }
    if ("story" in g) return problem({ step: o.step, severity: "gm", path: o.path, what: g.story, cite: o.cite });
    // Everything else happens in play, not on the sheet: list it so the builder shows it.
    effects.push({ what: describeGrant(g), cite: o.cite });
  }

  // ── species and archetype ──
  const arch = ix.archetypes.get(build.archetypeId);
  if (!arch) {
    problem({ step: "archetype", severity: "error", what: `Unknown archetype ${build.archetypeId}` });
    return {
      sheet: CharacterStats.parse({}),
      budget,
      spent: 0,
      ledger,
      pending,
      choices,
      problems,
      effects,
      advancement: null,
    };
  }
  allowed(arch, "archetype");
  const archOrigin: Origin = {
    path: `archetype/${arch.id}`,
    step: "archetype",
    cite: cite(arch),
    tiersAscended: 0,
    granted: true,
  };
  if (arch.tier > tier)
    problem({
      step: "archetype",
      severity: "error",
      what: `${arch.name} is Tier ${arch.tier}, above the campaign's Tier ${tier}`,
      cite: "Core p.21",
    });
  ledger.push({ what: `${arch.name} (archetype, with its species)`, xp: arch.xp, cite: cite(arch), step: "archetype" });

  const speciesId =
    build.gm.species ?? build.speciesId ?? (arch.speciesIds.length === 1 ? arch.speciesIds[0] : undefined);
  if (!speciesId)
    ask({
      path: `archetype/${arch.id}/species`,
      step: "archetype",
      what: "Choose a species",
      choose: 1,
      options: arch.speciesIds.map((x) => ix.species.get(x)?.name ?? x),
    });
  else if (!build.gm.species && !arch.speciesIds.includes(speciesId))
    problem({
      step: "archetype",
      severity: "error",
      what: `${arch.name} is not open to ${ix.species.get(speciesId)?.name ?? speciesId}`,
      cite: cite(arch),
    });
  const species = speciesId ? ix.species.get(speciesId) : undefined;
  if (speciesId && !species) problem({ step: "archetype", severity: "error", what: `Unknown species ${speciesId}` });

  // The archetype's printed ratings already include the species' (Core p.29); what it doesn't print, the species gives.
  for (const a of ATTRIBUTES) s.base.attributes[a] = arch.attributes[a] ?? species?.attributes[a] ?? 1;
  for (const k of Object.keys(SKILLS) as Skill[]) {
    const v = arch.skills[k] ?? species?.skills[k];
    if (v) s.base.skills[k] = v;
  }
  if (species) {
    allowed(species, "archetype");
    const so: Origin = {
      path: `species/${species.id}`,
      step: "archetype",
      cite: cite(species),
      tiersAscended: 0,
      granted: true,
    };
    ownRules(species.abilities).forEach((r) => addRule(r, so));
    species.grants.forEach((g, i) => grant(g, { ...so, path: `${so.path}/${i}` }));
  }
  arch.keywords.forEach(addKeyword);
  ownRules(arch.abilities).forEach((r) => addRule(r, archOrigin));
  arch.grants.forEach((g, i) => grant(g, { ...archOrigin, path: `${archOrigin.path}/${i}` }));
  arch.wargear.forEach((g, i) => grant(g, { ...archOrigin, path: `${archOrigin.path}/wargear/${i}` }));
  if (arch.influence) s.mods.influence = (s.mods.influence ?? 0) + arch.influence;
  deferred.push({ reqs: arch.requires, what: arch.name, origin: archOrigin, severity: "error" });

  // ── packages: one Creation Ascension Package when the archetype's Tier is below the campaign's (Core p.148), and any
  // Advancement Packages bought at creation ──
  const tiersAscended = Math.max(0, tier - arch.tier);
  const ascensions = build.packages.filter((p) => ix.packages.get(p)?.kind === "ascension");
  if (tiersAscended > 0 && ascensions.length === 0)
    ask({
      path: "ascension",
      step: "ascension",
      what: `Buy one Ascension Package (Tier ${arch.tier} → ${tier})`,
      choose: 1,
      options: [],
      of: "Ascension Packages",
      cite: "Core p.148",
    });
  if (ascensions.length > (tiersAscended > 0 ? 1 : 0))
    problem({
      step: "ascension",
      severity: "error",
      what: tiersAscended
        ? "Creation Ascension takes one Ascension Package"
        : `${arch.name} is already Tier ${tier}: no Creation Ascension`,
      cite: "Core p.148",
    });
  const packageNames: string[] = [];
  for (const pid of build.packages) {
    const p = ix.packages.get(pid);
    if (!p) {
      problem({ step: "customise", severity: "error", what: `Unknown package ${pid}` });
      continue;
    }
    const step: BuildStep = p.kind === "ascension" ? "ascension" : "customise";
    if (!allowed(p, step)) continue;
    const po: Origin = {
      path: `package/${p.id}`,
      step,
      cite: cite(p),
      tiersAscended: p.kind === "ascension" ? tiersAscended : 0,
      granted: true,
    };
    ledger.push({
      what: `${p.name} (${p.kind} package)`,
      xp: price(p.xp, { path: po.path, step, what: p.name }),
      cite: cite(p),
      step,
    });
    packageNames.push(p.name);
    s.mods.influence =
      (s.mods.influence ?? 0) +
      (typeof p.influence === "number" ? p.influence : p.influence.perTier * po.tiersAscended);
    p.grants.forEach((g, i) => grant(g, { ...po, path: `${po.path}/${i}` }));
    // Checked after the grants: `atCreationWith` turns on the kindred chosen (IoE p.20, rules-flow.md §11.61).
    if (p.notAtCreation && !(p.atCreationWith && s.keywords.includes(p.atCreationWith)))
      problem({
        step,
        severity: "error",
        what: `${p.name} can't be taken at creation${p.atCreationWith ? `, except to gain ${p.atCreationWith}` : ""}`,
        cite: cite(p),
      });
    // An Ascension Package's requirements are met before Ascending, at the archetype's Tier (rules-flow.md §11.54).
    deferred.push({
      reqs: p.requires,
      what: p.name,
      origin: po,
      severity: "error",
      tier: p.kind === "ascension" ? arch.tier : tier,
    });
    if (p.becomesArchetypeId)
      effects.push({
        what: `Becomes ${ix.archetypes.get(p.becomesArchetypeId)?.name ?? p.becomesArchetypeId}`,
        cite: cite(p),
      });
  }

  // ── packages bought in play: Advancement Packages, and "a single Ascension Package each time you Ascend" (Core p.148,
  // rules-flow.md §11.55). `campaign.ascend` raises the Tier by one, so each Tier since creation is one Ascension, and
  // the packages fill them in the order they were bought, each priced and checked at its own step. An Archetype
  // Ascension takes the step to its own Tier (Core p.155), so the packages skip that one. ──
  // ponytail: one Ascension per Tier, not a record of each; a Tier raised by more than one at once (campaign.update) reads
  // as one Ascension per Tier. Record each Ascension if a table does that.
  const ascendedTiers = nowTier - tier; // the Ascensions since creation; 0 when the group hasn't Ascended
  const archTo = build.advancement.archetypeAscension
    ? ix.archetypes.get(build.advancement.archetypeAscension.archetypeId)
    : undefined;
  const archStep = archTo && archTo.tier > tier && archTo.tier <= nowTier ? archTo.tier - tier : 0;
  // The Ascensions a package can take, oldest first: step n goes from Tier `tier + n - 1` to `tier + n`.
  const packageSteps = Array.from({ length: ascendedTiers }, (_, i) => i + 1).filter((n) => n !== archStep);
  let ascensionsTaken = 0; // Ascension Packages bought in play, one per Ascension
  for (const pid of build.advancement.packages) {
    const p = ix.packages.get(pid);
    if (!p) {
      problem({ step: "advance", severity: "error", what: `Unknown package ${pid}` });
      continue;
    }
    if (!allowed(p, p.kind === "ascension" ? "ascension" : "advance")) continue;
    // The Tier this package's Ascension reached; an Advancement Package's "new Tier" is the Tier now (Core p.149).
    let reached = nowTier;
    if (p.kind === "ascension") {
      const step = packageSteps[ascensionsTaken];
      ascensionsTaken += 1;
      if (ascendedTiers === 0)
        problem({
          step: "ascension",
          severity: "error",
          what: `${p.name}: the group is still Tier ${nowTier}, so there has been no Ascension`,
          cite: "Core p.148",
        });
      else if (step === undefined)
        problem({
          step: "ascension",
          severity: "error",
          what: `${p.name}: each Ascension takes one Ascension Package or an Archetype Ascension, and the group has Ascended ${ascendedTiers} time${ascendedTiers === 1 ? "" : "s"} since Tier ${tier}`,
          cite: "Core pp.148, 155",
        });
      else reached = tier + step;
    }
    const po: Origin = {
      path: `advance/package/${p.id}`,
      step: p.kind === "ascension" ? "ascension" : "advance",
      cite: cite(p),
      // "per Tier Ascended" on the package itself (Dauntless Reputation's Influence, Core p.151): its one Ascension.
      tiersAscended: p.kind === "ascension" ? 1 : 0,
      granted: true,
    };
    // "× the new Tier" is the Tier its Ascension reached, so a package bought earlier keeps its price (Core p.149).
    ledger.push({
      what: `${p.name} (${p.kind} package)`,
      xp:
        typeof p.xp === "object" && "perTier" in p.xp
          ? p.xp.perTier * reached
          : price(p.xp, { path: po.path, step: "advance", what: p.name }),
      cite: cite(p),
      step: "advance",
      pool: "advancement",
      ...dated({ kind: "package", id: p.id }),
    });
    packageNames.push(p.name);
    s.mods.influence =
      (s.mods.influence ?? 0) +
      (typeof p.influence === "number" ? p.influence : p.influence.perTier * po.tiersAscended);
    p.grants.forEach((g, i) => grant(g, { ...po, path: `${po.path}/${i}` }));
    deferred.push({
      reqs: p.requires,
      what: p.name,
      origin: po,
      // An Ascension Package's requirements are met before Ascending, at the Tier the character leaves (§11.54).
      severity: "error",
      tier: p.kind === "ascension" ? reached - 1 : nowTier,
    });
    if (p.becomesArchetypeId)
      effects.push({
        what: `Becomes ${ix.archetypes.get(p.becomesArchetypeId)?.name ?? p.becomesArchetypeId}`,
        cite: cite(p),
      });
  }

  // ── Archetype Ascension (Core p.155, rules-flow.md §11.67): at an Ascension, in place of an Ascension Package, the
  // character takes an Archetype of their own Faction at the Tier Ascended to. It grants that Archetype's abilities,
  // Keywords, Wargear and Influence — and none of its Attribute or Skill ratings, which XP has to buy (below).
  // Everything the old Archetype gave stays, so the old one is applied above and never replaced. ──
  let ascendedTo: Archetype | undefined;
  const archAscension = build.advancement.archetypeAscension;
  if (archAscension) {
    const to = ix.archetypes.get(archAscension.archetypeId);
    if (!to) problem({ step: "ascension", severity: "error", what: `Unknown archetype ${archAscension.archetypeId}` });
    else if (allowed(to, "ascension")) {
      const path = `advance/archetype/${to.id}`;
      if (ascendedTiers === 0)
        problem({
          step: "ascension",
          severity: "error",
          what: `${to.name}: the group is still Tier ${nowTier}, so there has been no Ascension`,
          cite: "Core p.148",
        });
      if (rank < 3)
        problem({
          step: "ascension",
          severity: "error",
          what: `Archetype Ascension needs Rank 3; ${play?.xpEarned ?? 0} XP earned is Rank ${rank}`,
          cite: "Core pp.146, 155",
        });
      if (to.factionId !== arch.factionId)
        problem({
          step: "ascension",
          severity: "error",
          what: `${to.name} is not an Archetype of ${arch.name}'s Faction`,
          cite: "Core p.155",
        });
      // The Tier of one of the group's Ascensions since creation, which is the one this takes (Core p.155).
      if (ascendedTiers > 0 && !archStep)
        problem({
          step: "ascension",
          severity: "error",
          what: `${to.name} is Tier ${to.tier}, not a Tier the group Ascended to (${tier + 1}–${nowTier})`,
          cite: "Core p.155",
        });
      if (speciesId && !build.gm.species && !to.speciesIds.includes(speciesId))
        problem({
          step: "ascension",
          severity: "error",
          what: `${to.name} is not open to ${species?.name ?? speciesId}`,
          cite: cite(to),
        });
      // The book gives the new Archetype for "a story reason", with the GM's agreement (Core p.155, §11.67).
      problem({
        step: "ascension",
        severity: "gm",
        path,
        what: `Archetype Ascension to ${to.name}: the GM agrees`,
        cite: "Core p.155",
      });
      // 0 XP of its own: what it costs is the Ascension slot it takes and the ratings bought to match (Core p.155). It
      // is on the ledger so the history can date it and ADVANCE says what the Ascension went on (§11.68).
      ledger.push({
        what: `${to.name} (Archetype Ascension)`,
        xp: 0,
        cite: "Core p.155",
        step: "ascension",
        pool: "advancement",
        ...dated({ kind: "ascension", archetypeId: to.id }),
      });
      const ao: Origin = { path, step: "ascension", cite: cite(to), tiersAscended: 1, granted: true };
      to.keywords.forEach(addKeyword);
      ownRules(to.abilities).forEach((r) => addRule(r, ao));
      to.grants.forEach((g, i) => grant(g, { ...ao, path: `${ao.path}/${i}` }));
      to.wargear.forEach((g, i) => grant(g, { ...ao, path: `${ao.path}/wargear/${i}` }));
      if (to.influence) s.mods.influence = (s.mods.influence ?? 0) + to.influence;
      deferred.push({ reqs: to.requires, what: to.name, origin: ao, severity: "error", tier: to.tier });
      packageNames.push(to.name); // the sheet names both: the character keeps what the old Archetype gave
      ascendedTo = to;
    }
  }

  // Each Ascension's second step: an Ascension Package or an Archetype Ascension, unless the GM waived it on a
  // Milestone Ascension (Core p.148 step 2), which is always the latest one.
  const open = packageSteps[ascensionsTaken];
  if (open !== undefined && !(play?.packageWaived && open === ascendedTiers))
    ask({
      path: "advance/ascension",
      step: "ascension",
      what: `Buy one Ascension Package (Tier ${tier + open - 1} → ${tier + open})`,
      choose: 1,
      options: [],
      of: "Ascension Packages",
      cite: "Core p.148",
    });

  // ── background: three rows, one bonus (rules-flow.md §11.22) ──
  const bg = build.background;
  if (!bg)
    ask({
      path: "background",
      step: "faction",
      what: "Choose a Background table",
      choose: 1,
      options: [],
      of: "your faction's, species' or sub-faction's",
      cite: "Core p.30",
    });
  else {
    const table = ix.backgrounds.get(bg.tableId);
    if (!table) problem({ step: "faction", severity: "error", what: `Unknown background table ${bg.tableId}` });
    else if (allowed(table, "faction")) {
      const to: Origin = {
        path: `background/${table.id}`,
        step: "faction",
        cite: cite(table),
        tiersAscended: 0,
        granted: true,
      };
      const chosen: string[] = [];
      for (const row of BACKGROUND_ROWS) {
        if (!table[row].length) continue; // some tables print only some columns (IoE)
        const name = bg[row];
        const r = name ? table[row].find((x) => x.name === name) : undefined;
        if (!name)
          ask({
            path: `${to.path}/${row}`,
            step: "faction",
            what: `Choose a${row === "origin" || row === "accomplishment" ? "n" : ""} ${capital(row)}`,
            choose: 1,
            options: table[row].map((x) => x.name),
            cite: to.cite,
          });
        else if (!r)
          problem({
            step: "faction",
            severity: "error",
            what: `${table.name} has no ${capital(row)} "${name}"`,
            cite: to.cite,
          });
        else {
          chosen.push(`${capital(row)} ${r.name}`);
          if (r.requires)
            deferred.push({ reqs: r.requires, what: `${capital(row)} ${r.name}`, origin: to, severity: "error" });
          if (bg.bonus === row) {
            if (r.bonus === "wealth") s.wealth += 1;
            else if (r.bonus === "corruption") effects.push({ what: "Corruption +1", cite: to.cite });
            else if (r.bonus) s.mods[r.bonus] = (s.mods[r.bonus] ?? 0) + 1;
            r.grants?.forEach((g, i) => grant(g, { ...to, path: `${to.path}/${row}/${i}` }));
          }
        }
      }
      if (!bg.bonus)
        ask({
          path: `${to.path}/bonus`,
          step: "faction",
          what: "Choose which one Background bonus applies",
          choose: 1,
          options: [...BACKGROUND_ROWS],
          cite: "rules-flow.md §11.22",
        });
      if (chosen.length) {
        const b = bg.bonus && table[bg.bonus].find((x) => x.name === bg[bg.bonus!]);
        s.abilities.push({
          name: "Background",
          text: `${chosen.join("; ")}.${b?.bonus ? ` Bonus: +1 ${bonusName(b.bonus)} (${capital(bg.bonus!)}).` : ""}`,
          page: to.cite,
        });
      }
      deferred.push({ reqs: ownerReqs(table.owner), what: table.name, origin: to, severity: "error" });
    }
  }

  // ── option groups: Kroot Mutations, Asuryani Paths… ──
  const taken = new Map<string, number>();
  for (const [i, pick] of build.options.entries()) {
    const group = ix.optionGroups.get(pick.groupId);
    const opt = group?.options.find((x) => x.name === pick.name);
    if (!group || !opt) {
      problem({ step: "faction", severity: "error", what: `Unknown option ${pick.groupId}: ${pick.name}` });
      continue;
    }
    if (!allowed(group, "faction")) continue;
    const n = taken.get(group.id) ?? 0;
    taken.set(group.id, n + 1);
    const go: Origin = {
      path: `option/${group.id}/${i}`,
      step: "faction",
      cite: cite(group),
      tiersAscended: 0,
      granted: true,
    };
    const max = group.pick === "tier" ? tier : group.pick === "any" ? Infinity : group.pick;
    if (n + 1 > max)
      problem({ step: "faction", severity: "error", what: `${group.name}: at most ${max}`, cite: go.cite });
    if (opt.notAtCreation)
      problem({ step: "faction", severity: "error", what: `${opt.name} can't be taken at creation`, cite: go.cite });
    ledger.push({
      what: `${opt.name} (${group.name})`,
      xp: group.xp[Math.min(n, group.xp.length - 1)]!,
      cite: go.cite,
      step: "faction",
    });
    if (!s.optionAccess.has(group.id))
      deferred.push({ reqs: ownerReqs(group.owner), what: group.name, origin: go, severity: "error" });
    deferred.push({ reqs: opt.requires, what: opt.name, origin: go, severity: "error" });
    addRule(opt, go);
  }

  // ── what fills each [PLACEHOLDER], once every keyword is known ──
  const primaris = () => s.keywords.includes("PRIMARIS");
  // A filled [PLACEHOLDER] still counts as held: "[CHAPTER] Keyword" (VoA p.48) means any Chapter.
  const filled = new Set<string>();
  for (const k of [...s.keywords]) {
    if (!k.startsWith("[")) continue;
    const kw = ix.keywords.get(k);
    const fill = build.fills[k];
    const fo: Origin = {
      path: `fill/${norm(k)}`,
      step: "faction",
      cite: kw ? cite(kw) : "Core p.375",
      tiersAscended: 0,
      granted: true,
    };
    const replace = (to: string) => {
      filled.add(k);
      s.keywords = s.keywords.map((x) => (x === k ? to : x));
    };
    if (!fill) {
      const options = catalogue.creation["sub-factions"].filter(
        (x) => x.type === kw?.placeholder && (catalogue.homebrew || official(x.source)),
      );
      ask({
        path: fo.path,
        step: "faction",
        what: `Choose your ${k}`,
        choose: 1,
        options: [],
        of: kw?.writeIn
          ? `${options.map((x) => x.name).join(", ")}, or your own`
          : options.map((x) => x.name).join(", "),
        cite: fo.cite,
      });
    } else if ("writeIn" in fill) {
      // The GM may allow one anyway (rules-flow.md §11.25: the Red Scorpions, kill-team.md ruling 13).
      if (!kw?.writeIn)
        problem({
          step: "faction",
          severity: "gm",
          path: fo.path,
          what: `${k} can't be written in; choose one the books print`,
          cite: "rules-flow.md §11.25",
        });
      replace(fill.writeIn);
    } else {
      const sf = ix.subFactions.get(fill.id);
      if (!sf || sf.type !== kw?.placeholder) {
        problem({
          step: "faction",
          severity: "error",
          what: `${sf?.name ?? fill.id} doesn't fill ${k}`,
          cite: fo.cite,
        });
        continue;
      }
      if (!allowed(sf, "faction")) continue;
      replace(sf.keyword);
      s.subFactionIds.push(sf.id, ...successors(sf, ix.subFactions));
      deferred.push({ reqs: sf.requires, what: sf.name, origin: fo, severity: "error" });
      const so: Origin = { ...fo, path: `subfaction/${sf.id}`, cite: cite(sf) };
      // A Primaris ignores (Gene-seed) traits (Core p.71), but a Successor with no traits of its own takes its
      // founder's, flaw included, Primaris too (Absolvers, rules-flow.md §11.23).
      const founder = !sf.traits.length && sf.successorOf ? ix.subFactions.get(sf.successorOf) : undefined;
      for (const t of ownRules(founder?.traits ?? sf.traits))
        if (!(t.geneSeed && primaris() && !founder)) addRule(t, founder ? { ...so, cite: cite(founder) } : so);
    }
  }

  // ── GM rulings on this character ──
  build.gm.keywords.forEach(addKeyword);
  if (build.gm.species) effects.push({ what: `Species ${species?.name ?? build.gm.species} by the GM's ruling` });
  const removals = build.gm.gear.remove.map(norm);
  s.gear = s.gear.filter((g) => !removals.includes(norm(g.name)));
  build.gm.gear.add.forEach((g) =>
    addItem(g, { path: "gm", step: "archetype", cite: "GM", tiersAscended: 0, granted: true }),
  );

  // ── talents bought: at creation, then with the XP earned in play ──
  const pools = [
    { step: "customise" as BuildStep, pool: undefined, talents: build.talents, powers: build.powers },
    {
      step: "advance" as BuildStep,
      pool: "advancement" as const,
      talents: build.advancement.talents,
      powers: build.advancement.powers,
    },
  ];
  for (const { step, pool, talents } of pools)
    for (const t of talents) {
      const rec = ix.talents.get(t.id);
      if (!rec) {
        problem({ step, severity: "error", what: `Unknown talent ${t.id}` });
        continue;
      }
      if (!allowed(rec, step)) continue;
      const path = `${pool ? "advance/" : ""}talent/${rec.id}`;
      if (s.talents.has(rec.id) && rec.repeatable === false) {
        problem({ step, severity: "error", what: `${rec.name} is already taken`, cite: cite(rec) });
        continue;
      }
      ledger.push({
        what: `${rec.name}${t.choice ? ` (${t.choice})` : ""}`,
        xp: s.xpDiscounts.talents.get(rec.id) ?? price(rec.xp, { path, step, what: rec.name }),
        cite: cite(rec),
        step,
        pool,
        ...(pool ? dated({ kind: "talent", id: rec.id, choice: t.choice }) : {}),
      });
      addTalent(rec.id, { path, step, cite: cite(rec), tiersAscended: 0, granted: false }, t.choice);
    }

  // ── keyword grants (PSYKER, PRIEST…), until nothing new arrives ──
  const seen = new Set<string>();
  for (let changed = true; changed;) {
    changed = false;
    for (const k of [...s.keywords]) {
      const kw = ix.keywords.get(k);
      if (!kw || seen.has(k)) continue;
      seen.add(k);
      changed = true;
      kw.grants.forEach((g, i) =>
        grant(g, { path: `keyword/${kw.id}/${i}`, step: "customise", cite: cite(kw), tiersAscended: 0, granted: true }),
      );
    }
  }
  for (const k of s.neverKeywords)
    if (s.keywords.includes(k))
      problem({ step: "archetype", severity: "error", what: `This character can never have ${k}` });

  // Grants that wait on a requirement ("PSYKER only"): now the character is known, apply those it meets.
  for (const { grant: g, origin } of later) {
    const reqs = ("requires" in g ? g.requires : undefined) ?? [];
    const c = ctx();
    if (reqs.every((r) => meets(r, c) === true)) grant(g, origin, true);
  }

  // ── powers bought: from a discipline the character may learn (Core p.257), at creation, then in play ──
  for (const { step, pool, powers } of pools)
    for (const pid of powers) {
      const p = ix.powers.get(pid);
      if (!p) {
        problem({ step, severity: "error", what: `Unknown power ${pid}` });
        continue;
      }
      if (!allowed(p, step)) continue;
      if (s.powers.has(p.id)) {
        problem({ step, severity: "error", what: `${p.name} is already known`, cite: cite(p) });
        continue;
      }
      const discs = [p.disciplineId, ...p.alsoIn];
      const known = discs.find((d) => s.disciplines.has(d) && (!s.only || s.only.has(d)));
      if (!known)
        problem({
          step,
          severity: "error",
          what: `${p.name} is from a Discipline you can't learn (${discs.join(", ")})`,
          cite: cite(p),
        });
      const disc = ix.disciplines.get(known ?? p.disciplineId);
      const discount = s.xpDiscounts.disciplines.find((d) => d.id && discs.includes(d.id))?.multiplier ?? 1;
      ledger.push({
        what: `${p.name} (power)`,
        // A power's "at creation" price holds only at creation (Smite, Core p.272).
        xp: Math.ceil(
          (pool && typeof p.xp === "object" && "later" in p.xp
            ? p.xp.later
            : price(p.xp, { path: `power/${p.id}`, step, what: p.name })) * discount,
        ),
        cite: cite(p),
        step,
        pool,
        ...(pool ? dated({ kind: "power", id: p.id }) : {}),
      });
      s.powers.add(p.id);
      const po: Origin = { path: `power/${p.id}`, step, cite: cite(p), tiersAscended: 0, granted: false };
      deferred.push({ reqs: [...(disc?.requires ?? []), ...p.requires], what: p.name, origin: po, severity: "error" });
    }

  // ── ratings bought with XP ──
  const attributes = { ...s.base.attributes };
  const skills = { ...s.base.skills };
  for (const [a, to] of Object.entries(build.attributes) as [Attribute, number][]) {
    const from = s.base.attributes[a];
    if (to <= from) continue;
    attributes[a] = to;
    ledger.push({
      what: `${ATTRIBUTE_NAMES[a]} ${from} → ${to}`,
      xp: ATTRIBUTE_XP[to]! - ATTRIBUTE_XP[from]!,
      cite: "Core p.24",
      step: "customise",
    });
  }
  for (const [k, to] of Object.entries(build.skills) as [Skill, number][]) {
    const from = s.base.skills[k] ?? 0;
    if (to <= from) continue;
    skills[k] = to;
    ledger.push({
      what: `${k} ${from} → ${to}`,
      xp: SKILL_XP[to]! - SKILL_XP[from]!,
      cite: "Core p.25",
      step: "customise",
    });
  }
  // In play: ratings raised from where creation left them, one row per rating point, which is how they are bought
  // (Core p.24) and what the history is keyed by (§11.68). The XP is unchanged: the tables are cumulative.
  for (const [a, to] of Object.entries(build.advancement.attributes) as [Attribute, number][]) {
    const from = attributes[a];
    if (to <= from) continue;
    attributes[a] = to;
    for (let r = from + 1; r <= to; r++)
      ledger.push({
        what: `${ATTRIBUTE_NAMES[a]} ${r - 1} → ${r}`,
        xp: ATTRIBUTE_XP[r]! - ATTRIBUTE_XP[r - 1]!,
        cite: "Core p.24",
        step: "advance",
        pool: "advancement",
        ...dated({ kind: "attribute", attribute: a, rating: r }),
      });
  }
  const created = { ...skills };
  for (const [k, to] of Object.entries(build.advancement.skills) as [Skill, number][]) {
    const from = skills[k] ?? 0;
    if (to <= from) continue;
    skills[k] = to;
    for (let r = from + 1; r <= to; r++)
      ledger.push({
        what: `${k} ${r - 1} → ${r}`,
        xp: SKILL_XP[r]! - SKILL_XP[r - 1]!,
        cite: "Core p.25",
        step: "advance",
        pool: "advancement",
        ...dated({ kind: "skill", skill: k, rating: r }),
      });
  }
  // Species maximums (Core p.25), for every rating however it was reached.
  for (const a of ATTRIBUTES) {
    const max = species?.max?.[a];
    if (max !== undefined && attributes[a] > max)
      problem({
        step: "customise",
        severity: "error",
        what: `${ATTRIBUTE_NAMES[a]} ${attributes[a]} is over the ${species!.name} maximum of ${max}`,
        cite: "Core p.25",
      });
  }
  // The Tree of Learning, only for Skills raised with XP (Core p.26, rules-flow.md §11.52).
  for (const [k, to] of Object.entries(build.skills) as [Skill, number][])
    if (to > (s.base.skills[k] ?? 0) && !treeOfLearning(skills, k, to))
      problem({
        step: "customise",
        severity: "error",
        what: `${k} ${to} needs ${to} Skills with points (the Tree of Learning)`,
        cite: "Core p.26",
      });
  for (const [k, to] of Object.entries(build.advancement.skills) as [Skill, number][])
    if (to > (created[k] ?? 0) && !treeOfLearning(skills, k, to))
      problem({
        step: "advance",
        severity: "error",
        what: `${k} ${to} needs ${to} Skills with points (the Tree of Learning)`,
        cite: "Core p.26",
      });

  // Archetype Ascension: "you must spend XP … until your Attributes and Skills equal or exceed" the new Archetype's
  // (Core p.155). The new Archetype grants none of them, so the difference is bought above.
  if (ascendedTo) {
    const want = ascendedTo;
    const short = [
      ...ATTRIBUTES.filter((a) => attributes[a] < (want.attributes[a] ?? 0)).map(
        (a) => `${ATTRIBUTE_NAMES[a]} ${attributes[a]} of ${want.attributes[a]}`,
      ),
      ...(Object.entries(want.skills) as [Skill, number][])
        .filter(([k, v]) => (skills[k] ?? 0) < v)
        .map(([k, v]) => `${k} ${skills[k] ?? 0} of ${v}`),
    ];
    if (short.length)
      problem({
        step: "ascension",
        severity: "error",
        what: `${want.name} needs ${short.join(", ")}`,
        cite: "Core p.155",
      });
  }

  // ── languages (Core p.31, rules-flow.md §11.48–50) ──
  const qualifying = catalogue.creation.languages.filter((l) => l.keywords.some((k) => s.keywords.includes(k)));
  const allowance =
    (qualifying.length ? 1 : 0) +
    s.languageGrants.reduce<number>((n, g) => n + (typeof g === "number" ? g : (skills[g.skill] ?? 0)), 0);
  const { picks, bought } = build.languages;
  if (picks.length > allowance)
    problem({
      step: "detail",
      severity: "error",
      what: `${picks.length} free languages; you have ${allowance}`,
      cite: "Core p.31",
    });
  if (
    qualifying.length &&
    picks.length &&
    !picks.some((p) => qualifying.some((l) => l.id === p)) &&
    s.languageGrants.length === 0
  )
    problem({
      step: "detail",
      severity: "error",
      what: `Your free language comes from your Keywords: ${qualifying.map((l) => l.name).join(" or ")}`,
      cite: "Core p.31",
    });
  if (picks.length < allowance)
    ask({
      path: "languages",
      step: "detail",
      what: `Choose ${allowance - picks.length} free language${allowance - picks.length > 1 ? "s" : ""}`,
      choose: allowance - picks.length,
      options: [],
      of: qualifying.map((l) => l.name).join(", ") || "any language",
      cite: "Core p.31",
    });
  const learned = build.advancement.languages;
  for (const l of [...picks, ...bought, ...learned])
    if (!ix.languages.has(l))
      problem({
        step: "detail",
        severity: "gm",
        path: `language/${norm(l)}`,
        what: `A language the table doesn't list: ${l}`,
        cite: "rules-flow.md §11.50",
      });
  for (const l of bought)
    ledger.push({
      what: `${ix.languages.get(l)?.name ?? l} (language)`,
      xp: LANGUAGE_XP,
      cite: "Core p.31",
      step: "detail",
    });
  for (const l of learned)
    ledger.push({
      what: `${ix.languages.get(l)?.name ?? l} (language)`,
      xp: LANGUAGE_XP,
      cite: "Core p.31",
      step: "advance",
      pool: "advancement",
      ...dated({ kind: "language", name: l }),
    });
  const dupes = [...picks, ...bought, ...learned].filter((l, i, all) => all.indexOf(l) !== i);
  if (dupes.length) problem({ step: "detail", severity: "error", what: `${dupes.join(", ")} taken twice` });

  // ── Wealth bought (Core p.38, §11.51) ──
  if (build.wealth)
    ledger.push({ what: `Wealth +${build.wealth}`, xp: build.wealth * WEALTH_XP, cite: "Core p.38", step: "detail" });
  s.wealth += build.wealth;

  // ── requirements, against the finished character ──
  function ctx(): BuildCtx {
    return {
      ...ratings(),
      keywords: new Set([...s.keywords, ...filled]),
      species: species ? [species.id, ...species.countsAs] : [],
      archetypeId: (ascendedTo ?? arch!).id, // after an Archetype Ascension, the Archetype the character is now
      subFactionIds: new Set(s.subFactionIds),
      talents: new Set(s.talents.keys()),
      talentCategories: [...s.talents.keys()].map((t) => ix.talents.get(t)?.category ?? "talent"),
      powers: [...s.powers].map((p) => ix.powers.get(p)).filter((p) => p !== undefined),
      gear: s.gear,
      wargear: catalogue.wargear,
      options: build.options,
      influence:
        (s.influenceAttribute ? ratings().attributes[s.influenceAttribute] : ratings().attributes.Fel) -
        1 +
        (s.mods.influence ?? 0),
      rank,
      tier: nowTier,
    };
  }
  const final = ctx();
  for (const d of deferred)
    for (const r of d.reqs) {
      const why = meets(r, { ...final, tier: d.tier ?? nowTier, chosen: d.choice });
      if (why === true) continue;
      const gmOnly = typeof why === "object";
      const path = `${d.origin.path}/requires/${norm(JSON.stringify(r))}`.slice(0, 200);
      problem({
        step: d.origin.step,
        severity: gmOnly || d.severity === "gm" ? "gm" : "error",
        path,
        what: gmOnly ? `${d.what}: ${why.gm}` : `${d.what}${d.severity === "gm" ? " (granted)" : ""}: ${why}`,
        cite: d.origin.cite,
      });
    }

  // ── the sheet ──
  const spent = ledger.filter((r) => !r.pool).reduce((n, r) => n + r.xp, 0);
  const advanceSpent = ledger.filter((r) => r.pool).reduce((n, r) => n + r.xp, 0);
  const earned = play?.xpEarned ?? 0;
  if (advanceSpent > earned)
    problem({
      step: "advance",
      severity: "error",
      what: `${advanceSpent - earned} XP more than the ${earned} earned in play`,
      cite: "Core p.146",
    });
  if (spent > budget)
    problem({
      step: "customise",
      severity: "error",
      what: `${spent - budget} XP over the budget of ${budget}`,
      cite: "Core p.20",
    });

  const armourItems = s.gear.map((g) => ({ g, w: g.wargearId ? catalogue.wargear.get(g.wargearId) : undefined }));
  // Worn armour: the best AR the character owns; only one suit counts at a time (Core p.231).
  const worn = armourItems.filter((x) => x.w?.armour).sort((a, b) => b.w!.armour!.ar - a.w!.armour!.ar)[0];
  const armour = worn
    ? {
        name: worn.g.name,
        ...worn.w!.armour!,
        ar: worn.w!.armour!.ar + (s.mods.armourRating ?? 0),
        // As printed, with the build's upgrade ids beside it, the way a weapon carries them: `withUpgrades` applies them
        // on the way out, so storing the result would double-apply (Core pp.227–228, §11.65).
        wargearId: worn.w!.id,
        upgrades: worn.g.upgrades?.length ? [...worn.g.upgrades] : undefined,
      }
    : { name: "", ar: s.mods.armourRating ?? 0, invulnerable: false, powered: 0, traits: [] };
  const strength = attributes.S + armour.powered; // Powered (X), Core p.232
  const weapons = [
    ...s.weapons.map((w) => sheetWeapon(w, strength)),
    ...armourItems
      .filter((x) => x.w?.weapon)
      .map(({ g, w }) => {
        const base = sheetWeapon({ name: g.name, weapon: w!.weapon! }, strength);
        // The profile is stored as printed, with the upgrade ids beside it; `withUpgrades` applies them on the way out.
        // Storing the result instead would double-apply the moment anything derived from the ids as well.
        return {
          ...base,
          count: typeof g.qty === "number" && g.qty > 1 ? g.qty : base.count,
          traits: [...base.traits, ...(g.traitIds ?? [])],
          wargearId: w!.id,
          upgrades: g.upgrades?.length ? [...g.upgrades] : undefined,
        };
      }),
  ];
  const gear = armourItems
    .filter((x) => !x.w?.weapon && x !== worn)
    .map(({ g, w }) => {
      const qty = g.qty === 1 ? "" : ` ×${g.qty}`;
      return w ? `${gearLine(w)}${qty}` : `${g.name}${qty}`;
    });
  const mods: z.infer<typeof Mods> = {};
  for (const k of Mods.keyof().options) if (s.mods[k]) mods[k] = s.mods[k];
  // An Ork's Influence uses Strength (Core p.29): the sheet derives it from Fellowship, so the difference is a mod.
  if (s.influenceAttribute) mods.influence = (mods.influence ?? 0) + attributes[s.influenceAttribute] - attributes.Fel;
  if (movement(armour)) mods.speed = (mods.speed ?? 0) + movement(armour);
  for (const [k, v] of Object.entries(build.gm.mods) as [keyof typeof mods, number][])
    if (v) mods[k] = (mods[k] ?? 0) + v;
  for (const p of s.powers) {
    const pw = ix.powers.get(p);
    if (pw) s.abilities.push({ name: pw.name, text: pw.effect, page: cite(pw) });
  }

  const clip = (r: { name: string; text: string; page?: string }) => ({
    name: r.name.slice(0, 100),
    text: r.text.slice(0, 2000),
    page: r.page?.slice(0, 40),
  });
  const sheet = CharacterStats.parse({
    species: species?.name ?? "",
    archetype: [arch.name, ...packageNames].join(" + ").slice(0, 100),
    keywords: s.keywords.slice(0, 20),
    attributes,
    skills: Object.fromEntries(Object.entries(skills).filter(([, v]) => v > 0)),
    armour,
    speed: species?.speed ?? 6,
    mods,
    abilities: s.abilities.slice(0, 30).map(clip),
    talents: [...s.talents.values()]
      .flatMap((t) => t.choices.map((c) => ({ name: c ? `${t.name} (${c})` : t.name, text: t.text, page: t.page })))
      .slice(0, 30)
      .map(clip),
    weapons: weapons.slice(0, 20),
    gear: gear.slice(0, 60).map((g) => g.slice(0, 200)),
    wealth: s.wealth,
  });
  const advancement = play ? { budget: earned, spent: advanceSpent, rank, tier: nowTier } : null;
  return { sheet, budget, spent, ledger, pending, choices, problems, effects, advancement };
}

// ── requirements ─────────────────────────────────────────────────────────────────────────────────────────────────────

export type BuildCtx = {
  attributes: Record<Attribute, number>;
  skills: Partial<Record<Skill, number>>;
  keywords: Set<string>;
  species: string[]; // the species and what it counts as (rules-flow.md §11.18)
  archetypeId: string;
  subFactionIds: Set<string>; // the sub-faction and its founders (successorOf)
  talents: Set<string>;
  talentCategories: string[];
  powers: { id: string; disciplineId: string }[];
  gear: GearItem[];
  wargear: ReadonlyMap<string, Wargear>;
  options: { groupId: string; name: string }[];
  influence: number;
  rank: number;
  tier: number;
  chosen?: string; // a bracketed Talent's pick, for chosenAttribute / chosenSkill
};

// true when met; otherwise why not, or { gm } for a condition only the GM can judge.
export function meets(r: Requirement, c: BuildCtx): true | string | { gm: string } {
  switch (r.kind) {
    case "attribute":
      return c.attributes[r.attribute] >= r.min || `needs ${ATTRIBUTE_NAMES[r.attribute]} ${r.min}`;
    case "skill":
      return (c.skills[r.skill] ?? 0) >= r.min || `needs ${r.skill} ${r.min}`;
    case "chosenAttribute": {
      const a = ATTRIBUTES.find((x) => x === c.chosen || ATTRIBUTE_NAMES[x] === c.chosen);
      return (a !== undefined && c.attributes[a] >= r.min) || `needs the chosen Attribute at ${r.min}`;
    }
    case "chosenSkill": {
      const k = (Object.keys(SKILLS) as Skill[]).find((x) => x === c.chosen);
      return (k !== undefined && (c.skills[k] ?? 0) >= r.min) || `needs the chosen Skill at ${r.min}`;
    }
    case "influence":
      return c.influence >= r.min || `needs Influence ${r.min}`;
    case "keyword":
      return r.anyOf.some((k) => c.keywords.has(k)) || `needs ${r.anyOf.join(" or ")}`;
    case "notKeyword":
      return !r.anyOf.some((k) => c.keywords.has(k)) || `not for ${r.anyOf.join(" or ")}`;
    case "species":
      return r.anyOf.some((x) => c.species.includes(x)) || `needs species ${r.anyOf.join(" or ")}`;
    case "notSpecies":
      return !r.anyOf.some((x) => c.species.includes(x)) || `not for species ${r.anyOf.join(" or ")}`;
    case "archetype":
      return r.anyOf.includes(c.archetypeId) || `needs archetype ${r.anyOf.join(" or ")}`;
    case "notArchetype":
      return !r.anyOf.includes(c.archetypeId) || `not for archetype ${r.anyOf.join(" or ")}`;
    case "memorableInjuries":
      // No Memorable Injury is taken at creation yet (Core p.33, optional): the builder counts none.
      return r.min === undefined || r.min <= 0 || `needs ${r.min} Memorable Injur${r.min === 1 ? "y" : "ies"}`;
    case "subFaction":
      return r.anyOf.some((x) => c.subFactionIds.has(x)) || `needs ${r.anyOf.join(" or ")}`;
    case "talent":
      return r.anyOf.some((x) => c.talents.has(x)) || `needs talent ${r.anyOf.join(" or ")}`;
    case "notTalent":
      return !r.anyOf.some((x) => c.talents.has(x)) || `can't be taken with ${r.anyOf.join(" or ")}`;
    case "talentCategory":
      return (
        c.talentCategories.filter((x) => x === r.category).length >= r.min ||
        `needs ${r.min} ${r.category} talent${r.min > 1 ? "s" : ""}`
      );
    case "option":
      return (
        c.options.some((o) => o.groupId === r.groupId && r.anyOf.includes(o.name)) || `needs ${r.anyOf.join(" or ")}`
      );
    case "power":
      return r.anyOf.some((x) => c.powers.some((p) => p.id === x)) || `needs power ${r.anyOf.join(" or ")}`;
    case "powerCount": {
      const per = new Map<string, number>();
      for (const p of c.powers) per.set(p.disciplineId, (per.get(p.disciplineId) ?? 0) + 1);
      const n = r.sameDiscipline ? Math.max(0, ...per.values()) : c.powers.length;
      return n >= r.min || `needs ${r.min} psychic powers${r.sameDiscipline ? " from one Discipline" : ""}`;
    }
    case "wargear":
      return r.anyOf.some((n) => c.gear.some((g) => norm(g.name) === norm(n))) || `needs ${r.anyOf.join(" or ")}`;
    case "wargearKeyword":
      return (
        c.gear.some((g) =>
          (g.wargearId ? (c.wargear.get(g.wargearId)?.keywords ?? []) : []).some((k) => r.anyOf.includes(k)),
        ) || `needs wargear with ${r.anyOf.join(" or ")}`
      );
    case "wargearCount": {
      const n = c.gear.filter((g) => {
        const w = g.wargearId ? c.wargear.get(g.wargearId) : undefined;
        return w && wargearMatches(w, r.of, { tier: c.tier, newTier: c.tier });
      }).length;
      return n >= r.min || `needs ${r.min} of ${describeFilter(r.of)}`;
    }
    case "rank":
      return c.rank >= r.min || `needs Rank ${r.min}${r.min > 1 ? ", not at creation" : ""}`;
    case "tier":
      return (
        ((r.min === undefined || c.tier >= r.min) && (r.max === undefined || c.tier <= r.max)) ||
        `needs Tier ${r.min ?? 1}–${r.max ?? 5}`
      );
    case "gm":
      return { gm: r.text };
    case "all": {
      for (const x of r.of) {
        const why = meets(x, c);
        if (why !== true) return why;
      }
      return true;
    }
    case "either": {
      const whys = r.of.map((x) => meets(x, c));
      if (whys.some((w) => w === true)) return true;
      const gm = whys.find((w): w is { gm: string } => typeof w === "object");
      return gm ?? whys.filter((w) => typeof w === "string").join(", or ");
    }
  }
}

// ── wargear filters ──────────────────────────────────────────────────────────────────────────────────────────────────

const RARITIES = Object.keys(RARITY_DN) as (keyof typeof RARITY_DN)[];

export function wargearMatches(w: Wargear, f: WargearFilter, { tier, newTier }: { tier: number; newTier: number }) {
  if (f.kinds && !f.kinds.includes(w.kind)) return false;
  if (f.weapon) {
    if (!w.weapon) return false;
    const melee = w.weapon.range?.length === 1 && w.weapon.thrown === undefined; // melee weapons print one reach
    if ((f.weapon === "melee") !== melee) return false;
  }
  if (f.categories && !f.categories.includes(w.category)) return false;
  if (f.nameIncludes && !norm(w.name).includes(norm(f.nameIncludes))) return false;
  if (f.wargearKeywords && !w.keywords.some((k) => f.wargearKeywords!.includes(k))) return false;
  if (f.allKeywords && !f.allKeywords.every((k) => w.keywords.includes(k))) return false;
  if (f.weaponTraits || f.notWeaponTraits) {
    // Traits are printed with their rating ("Heavy (3)"); the filter names the Trait alone.
    const traits = [...(w.weapon?.traits ?? []), ...(w.armour?.traits ?? [])].map((t) => norm(t.split("(")[0]!));
    if (f.weaponTraits && !f.weaponTraits.some((t) => traits.includes(norm(t)))) return false;
    if (f.notWeaponTraits?.some((t) => traits.includes(norm(t)))) return false;
  }
  if (f.maxValue !== undefined) {
    const max =
      typeof f.maxValue === "number"
        ? f.maxValue
        : "tierPlus" in f.maxValue
          ? tier + f.maxValue.tierPlus
          : newTier + f.maxValue.newTierPlus;
    if (w.value === null || w.value > max) return false;
  }
  if (f.rarity) {
    if (!w.rarity) return false;
    const r = RARITIES.indexOf(w.rarity);
    if (f.rarity.atMost && r > RARITIES.indexOf(f.rarity.atMost)) return false;
    if (f.rarity.atLeast && r < RARITIES.indexOf(f.rarity.atLeast)) return false;
  }
  return true;
}

// ── labels ───────────────────────────────────────────────────────────────────────────────────────────────────────────

const ATTRIBUTE_NAMES: Record<Attribute, string> = {
  S: "Strength",
  T: "Toughness",
  A: "Agility",
  I: "Initiative",
  Wil: "Willpower",
  Int: "Intellect",
  Fel: "Fellowship",
};
const capital = (s: string) => s[0]!.toUpperCase() + s.slice(1);
const bonusName = (b: string) =>
  ({ maxWounds: "Max Wounds", maxShock: "Max Shock", passiveAwareness: "Passive Awareness" })[b] ?? capital(b);

function amount(a: unknown): string {
  if (typeof a === "number" || typeof a === "string") return String(a);
  if (a && typeof a === "object") {
    if ("perTier" in a) return `${String(a.perTier)} per Tier Ascended`;
    if ("timesTier" in a) return `${String(a.timesTier)} × Tier`;
    if ("perRank" in a) return `${String(a.perRank)} × Rank${"plus" in a && a.plus ? ` + ${String(a.plus)}` : ""}`;
    if ("rankPlus" in a) return `Rank + ${String(a.rankPlus)}`;
    if ("roll" in a && "times" in a) return `${String(a.roll)} × ${amount(a.times)}`;
  }
  return "?";
}

function describeFilter(f: WargearFilter): string {
  const bits = [
    f.rarity &&
      (f.rarity.atMost === f.rarity.atLeast
        ? f.rarity.atMost
        : [f.rarity.atLeast && `${f.rarity.atLeast}+`, f.rarity.atMost && `up to ${f.rarity.atMost}`]
            .filter(Boolean)
            .join(" ")),
    f.weapon && `${f.weapon} weapon`,
    f.kinds?.join(" or "),
    f.categories?.join(" or "),
    f.nameIncludes && `"${f.nameIncludes}"`,
    f.wargearKeywords && `with ${f.wargearKeywords.join(" or ")}`,
    f.allKeywords && `with ${f.allKeywords.join(" and ")}`,
    f.weaponTraits && `with the ${f.weaponTraits.join(" or ")} Trait`,
    f.notWeaponTraits && `without the ${f.notWeaponTraits.join(" or ")} Trait`,
    f.maxValue !== undefined &&
      `Value ≤ ${typeof f.maxValue === "number" ? f.maxValue : "tierPlus" in f.maxValue ? `Tier + ${f.maxValue.tierPlus}` : `new Tier + ${f.maxValue.newTierPlus}`}`,
  ].filter(Boolean);
  return bits.join(", ") || "any wargear";
}

// A short label for one option of a choice.
export function label(g: Grant): string {
  if ("all" in g) return g.all.map(label).join(" + ");
  if ("choose" in g && "from" in g) return `${amount(g.choose)} of ${g.from.map(label).join(" / ")}`;
  if ("choose" in g && "rating" in g) return `${g.choose} Skill${g.choose > 1 ? "s" : ""} to ${g.rating}`;
  if ("talent" in g) return `Talent: ${g.talent}`;
  if ("keyword" in g) return g.keyword;
  if ("keywords" in g) return g.keywords.join(" and ");
  if ("power" in g) return `Power: ${g.power}`;
  if ("wargear" in g) return g.wargear.qty === 1 ? g.wargear.name : `${g.wargear.name} ×${g.wargear.qty}`;
  if ("bundle" in g) return g.bundle.map((w) => w.name).join(" and ");
  if ("pick" in g) return `${amount(g.pick)} of ${describeFilter(g.wargearOf)}`;
  return describeGrant(g);
}

function describeGrant(g: Grant): string {
  if ("weaponTrait" in g) return `A weapon gains ${g.weaponTrait}`;
  if ("trinkets" in g) return `${amount(g.trinkets)} Trinkets`;
  if ("corruption" in g) return `Corruption ${amount(g.corruption)}`;
  if ("faith" in g) return `Faith ${amount(g.faith)}`;
  if ("memorableInjuries" in g) return `${amount(g.memorableInjuries)} Memorable Injuries`;
  if ("traumaticInjuries" in g) return `${amount(g.traumaticInjuries)} Traumatic Injuries`;
  if ("mutations" in g) return `${amount(g.mutations)} Mutations`;
  if ("wrathPerSession" in g) return `+${amount(g.wrathPerSession)} Wrath each session`;
  if ("wealthPerSession" in g) return `+${amount(g.wealthPerSession)} Wealth each session`;
  if ("ammoPer" in g) return `${g.ammo} Ammo each ${g.ammoPer}`;
  if ("never" in g) return `Never gains ${capital(g.never)}`;
  if ("gmRuin" in g) return `The GM's Ruin: ${amount(g.gmRuin)}`;
  if ("talentAccess" in g) return `May take ${g.talentAccess} talents`;
  if ("onlyDisciplines" in g)
    return `Only ${g.onlyDisciplines.join(", ")} powers${g.untilTier ? ` until Tier ${g.untilTier}` : ""}`;
  if ("noArmour" in g) return "May not wear armour";
  if ("followers" in g) return `${amount(g.followers)} ${g.kind}${g.threatId ? ` (${g.threatId})` : ""}`;
  if ("bonusDice" in g) return `+${amount(g.bonusDice)} bonus dice ${g.when}`;
  if ("chosenTrait" in g) return `+${amount(g.chosenTrait)} to the chosen Trait`;
  if ("story" in g) return g.story;
  return JSON.stringify(g).slice(0, 120);
}

// Who a table or option group belongs to, as a requirement on the character.
function ownerReqs(o: BackgroundTable["owner"]): Requirement[] {
  if ("speciesId" in o) return [{ kind: "species", anyOf: [o.speciesId] }];
  if ("speciesIds" in o) return [{ kind: "species", anyOf: o.speciesIds }];
  if ("subFactionId" in o) return [{ kind: "subFaction", anyOf: [o.subFactionId] }];
  return []; // a faction's table: the archetype's faction, checked by the builder's choice of table
}

// A Successor's founders, so it matches their requirements too (docs/data.md §9).
function successors(sf: SubFaction, all: ReadonlyMap<string, SubFaction>): string[] {
  const out: string[] = [];
  for (let p = sf.successorOf; p && !out.includes(p); p = all.get(p)?.successorOf) out.push(p);
  return out;
}

// Mk X Phobos: "+1 Movement" (VoA p.72), the armour trait "+1 M" (a printed pregen sheet spells it out); your Movement
// is your Speed (Core p.180).
const movement = (armour: { traits: string[] }) =>
  Number(armour.traits.map((t) => /^\+(\d+) M(?:ovement)?$/.exec(t)?.[1]).find(Boolean) ?? 0);

// A rebuild of a character already in play keeps what play changed: Wealth, Ammo and requisitions, and the armament
// and gear gained since (a requisitioned weapon, loot). What the new build adds joins them; nothing is dropped, and the
// better armour is worn (only one suit counts, Core p.231). `before`, the sheet the stored build derives, says what the
// new build adds: what both builds give is already on the sheet, maybe written in another hand (a pregen's printed
// lines, issue #18), so a rebuild with no changes changes nothing.
export function keepPlay({
  previous,
  next,
  before = previous,
}: {
  previous: CharacterStats;
  next: CharacterStats;
  before?: CharacterStats;
}): CharacterStats {
  // Upgrades come from two places and only one of them is the build's, so the two are kept apart: `upgrades` is what
  // the new build says the starting wargear carries (a build edit that drops one drops it here), and `fitted` is what
  // was fitted in play, which no rebuild may touch. Merging them into one list would make a removal indistinguishable
  // from something fitted at the table.
  // Each build weapon answers for one weapon held, by name first (a requisitioned copy of a build weapon is its own),
  // then by catalogue entry for a sheet made before upgrades were modelled.
  const unmatched = [...next.weapons];
  const counterpart = (w: CharacterStats["weapons"][number]) => {
    let i = unmatched.findIndex((n) => n.name === w.name);
    if (i < 0 && w.wargearId) i = unmatched.findIndex((n) => n.wargearId === w.wargearId);
    return i < 0 ? undefined : unmatched.splice(i, 1)[0];
  };
  const played = previous.weapons.map((w) => {
    const from = counterpart(w);
    // A weapon the new build no longer gives keeps what its build gave, still as the build's: moving it to `fitted`
    // would let removeUpgrade turn it into a gear line, and a rebuild that gives the weapon back would add it twice.
    const upgrades = from ? (from.upgrades ?? []) : (w.upgrades ?? []);
    const fitted = (w.fitted ?? []).filter((id) => !upgrades.includes(id));
    const { upgrades: _, fitted: __, ...line } = w;
    const wargearId = w.wargearId ?? from?.wargearId;
    // Only the keys that hold something, so a printed line (a pregen's, issue #18) stays as printed.
    return {
      ...line,
      ...(wargearId && { wargearId }),
      ...(upgrades.length && { upgrades }),
      ...(fitted.length && { fitted }),
    };
  });
  const weapons = new Set([...previous.weapons, ...before.weapons].map((w) => w.name));
  const gear = new Set([...previous.gear, ...before.gear]);
  const better = next.armour.ar > previous.armour.ar || !previous.armour.name;
  // The suit kept keeps what was fitted to it in play, even when the new build's copy of the same suit wins on AR (a mod
  // the build added). The comparison is of printed AR, because a fitted +1 AR is derived and never stored (§11.65).
  // ponytail: a rebuild that changes the suit loses what was fitted to the old one; putting those back as gear needs the
  // catalogue, which this function doesn't hold — pass a `gearLine` callback in if a table hits it.
  const sameSuit = !!previous.armour.name && previous.armour.name === next.armour.name;
  const fittedTo = sameSuit ? previous.armour.fitted : undefined;
  // A suit printed on a hand-made sheet (a pregen's, issue #18) takes its catalogue id from the build's suit of the same
  // name, the way a printed weapon does above: without it nothing can be fitted to it until the sheet is rebuilt.
  const wornId = previous.armour.wargearId ?? (sameSuit ? next.armour.wargearId : undefined);
  const armour = better
    ? { ...next.armour, ...(fittedTo?.length ? { fitted: fittedTo } : {}) }
    : { ...previous.armour, ...(wornId ? { wargearId: wornId } : {}) };
  const shedArmour = previous.armour.name && previous.armour.name !== armour.name ? [previous.armour.name] : [];
  // The Speed a suit gives (Mk X Phobos) follows the suit worn, not the one the new build would wear.
  const speed = (next.mods.speed ?? 0) - movement(next.armour) + movement(armour);
  const { speed: _, ...mods } = next.mods;
  return {
    ...next,
    mods: speed ? { ...mods, speed } : mods,
    armour,
    weapons: [...played, ...next.weapons.filter((w) => !weapons.has(w.name))].slice(0, 20),
    gear: [
      ...previous.gear,
      ...shedArmour,
      ...next.gear.filter((g) => !gear.has(g) && !g.startsWith(`${armour.name} (`)),
    ]
      .filter((g, i, all) => all.indexOf(g) === i)
      .slice(0, 60),
    wealth: previous.wealth,
    ammo: previous.ammo,
    requisitioned: previous.requisitioned,
  };
}

// The creation part of a build, as a stable string: what a player may no longer change once the character is made
// (everything but the advancement — its purchase history included — the choices its grants ask for, and the GM's part).
// Keys are sorted, so two builds with the same choices compare equal however their objects were put together.
export function creationKey(b: CharacterBuild): string {
  const part = {
    ...b,
    advancement: undefined,
    gm: undefined,
    choices: Object.fromEntries(Object.entries(b.choices).filter(([k]) => !k.startsWith("advance/"))),
  };
  return JSON.stringify(part, (_, v: unknown) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([x], [y]) => x.localeCompare(y)))
      : v,
  );
}
