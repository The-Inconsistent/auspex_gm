// The Wrath & Glory ruleset for InconsisTable (its P3, stage 1: the rules a sheet, the pools and a called Test need).
// Built from this repo's own constants and rules data, so no number or page is retyped from memory. The output is
// private content: write it with `bun packages/data/port/write.ts <file>` and import it through InconsisTable's
// /library; never commit it to the InconsisTable repo (its ADR 0001).
//
// What the manifest cannot say yet is listed in InconsisTable's docs/p3-plan.md; here it is simply left out.
import {
  AMMO_TYPES,
  ASCENSION_XP,
  Attitude,
  ATTITUDE_DN,
  ATTRIBUTE_NAMES,
  AdventureStatus,
  BLIGHTED_SOUL,
  BeatType,
  ATTRIBUTES,
  CONDITIONS,
  corruptionLevel,
  CHAOS_SPAWN_AT,
  CodexInput,
  ENDURING_LIFE,
  FactionStance,
  MAX_FACTION_KEYWORDS,
  MAX_KEYWORD_LENGTH,
  MOB_MIN,
  SKILLS,
  Threat,
  ThreatSize,
  TIMED_CONDITIONS,
  type Attribute,
  type Skill,
} from "@wg/shared";
import { ADVENTURE_STATUS } from "../../../apps/web/components/gm/prep/constants.ts";
import { rulesList } from "../index.ts";
import { buildParams } from "./build-params.ts";

/** "Ballistic Skill" → "ballisticSkill": the camelCase ids the manifest asks for. */
export const idOf = (name: string) =>
  name
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((w, i) => (i === 0 ? w.toLowerCase() : w[0]!.toUpperCase() + w.slice(1).toLowerCase()))
    .join("");

const attrPath = (a: Attribute) => `attr.${idOf(a)}`;
// Skills and Attribute Tests roll the Attribute's total: Powered (X) armour adds X to Strength (p.232, rules-flow
// §11.160). No Trait reads Strength, so the Traits keep the rating.
const attrTotal = (a: Attribute) => (a === "S" ? "derived.strengthTotal" : attrPath(a));
// An unset value reads as 0: a sheet typed by hand rarely fills every Skill and bonus.
const opt = (path: string) => `(has(${path}) ? ${path} : 0)`;

// The additive bonuses of `Mods` (state.ts): the GM types them until entries can carry effects.
const MODS = {
  maxWounds: "Max Wounds",
  maxShock: "Max Shock",
  defence: "Defence",
  resilience: "Resilience",
  resolve: "Resolve",
  conviction: "Conviction",
  influence: "Influence",
  speed: "Speed",
  determination: "Determination",
  passiveAwareness: "Passive Awareness",
  maxTraumatic: "Max Traumatic Injuries",
} as const;
const mod = (k: keyof typeof MODS) => opt(`mod.${k}`);

// The three parts of CharacterDetail as the sheet labels them (apps/web/components/ui/character-detail), and their cap.
const DETAIL = [
  ["appearance", "Appearance"],
  ["past", "Your past"],
  ["personality", "Your personality"],
] as const;
const DETAIL_MAX = 4000;

// Traits, pp.36-37 and the sheet (deriveStats, state.ts). All have a minimum of 1 (p.36), except the last two rows.
const TRAITS: { id: string; label: string; expr: string; cite: string }[] = [
  {
    id: "maxWounds",
    label: "Max Wounds",
    expr: `max(1, attr.t + 2 * campaign.tier + ${mod("maxWounds")})`,
    cite: "Core pp.36-37",
  },
  {
    id: "maxShock",
    label: "Max Shock",
    expr: `max(1, attr.wil + campaign.tier + ${mod("maxShock")})`,
    cite: "Core pp.36-37",
  },
  { id: "defence", label: "Defence", expr: `max(1, attr.i - 1 + ${mod("defence")})`, cite: "Core pp.36-37" },
  {
    id: "resilience",
    label: "Resilience",
    expr: `max(1, attr.t + 1 + ${opt("armour.ar")} + ${mod("resilience")})`,
    cite: "Core pp.36-37",
  },
  { id: "resolve", label: "Resolve", expr: `max(1, attr.wil - 1 + ${mod("resolve")})`, cite: "Core p.37" },
  { id: "conviction", label: "Conviction", expr: `max(1, attr.wil + ${mod("conviction")})`, cite: "Core pp.36-37" },
  { id: "influence", label: "Influence", expr: `max(1, attr.fel - 1 + ${mod("influence")})`, cite: "Core p.37" },
  { id: "speed", label: "Speed", expr: `max(1, baseSpeed + ${mod("speed")})`, cite: "Core p.29" },
  {
    id: "determination",
    label: "Determination",
    expr: `max(1, attr.t + ${mod("determination")})`,
    cite: "Core pp.36-37",
  },
  {
    // Half the Awareness total, rounded up (rules-flow §11.6: Awareness, not Stealth).
    id: "passiveAwareness",
    label: "Passive Awareness",
    expr: `max(1, (derived.awareness + 1) / 2 + ${mod("passiveAwareness")})`,
    cite: "Core p.37",
  },
  {
    id: "maxTraumatic",
    label: "Max Traumatic Injuries",
    expr: `campaign.tier + 1 + ${mod("maxTraumatic")}`,
    cite: "Core pp.193-194",
  },
  { id: "rank", label: "Rank", expr: `min(3, 1 + ${opt("xp")} / 40)`, cite: "Core pp.146-147" },
];

// The DN modifier of the Agent's Corruption level (Core p.286), as one expression over the points.
const corruptionModifier = () => {
  const steps: { from: number; modifier: number }[] = [];
  for (let p = 0; p <= CHAOS_SPAWN_AT; p++) {
    const { modifier } = corruptionLevel(p);
    if (steps.at(-1)?.modifier !== modifier) steps.push({ from: p, modifier });
  }
  // Built from the lowest level up, so the highest threshold is tested first.
  return steps
    .slice(1)
    .reduce((rest, s) => `${opt("res.corruption")} >= ${s.from} ? ${s.modifier} : (${rest})`, `${steps[0]!.modifier}`);
};

const rules = new Map(rulesList().map((r) => [`${r.kind}/${r.name}`, r]));
const conditionCite = (name: string) => {
  const r = rules.get(`condition/${name}`);
  if (!r) throw new Error(`no rules entry for the Condition ${name}`);
  return `Core p.${r.page}`;
};

// The printed page of a stat block term (rules/stat-block.json), cited like the Conditions are.
const statCite = (name: string) => {
  const r = rules.get(`stat/${name}`);
  if (!r) throw new Error(`no rules entry for the stat block term ${name}`);
  return `Core p.${r.page}`;
};

// The Threat classes (threat.ts ThreatClass), by their code on a stat block.
export const THREAT_CLASSES = { T: "troop", E: "elite", A: "adversary", M: "monstrous" } as const;

// A single Threat's state, as threatStatus (state.ts) gives it: past Max Wounds an Adversary is the GM's call and any
// other class is Slain; past Max Shock a Troop is Slain and any other class Exhausted (p.324, rules-flow §11.10).
const OVER_WOUNDS = "res.wounds > derived.maxWounds";
const OVER_SHOCK = "(has(stat.shock) && res.shock > stat.shock)";
// The Threat's class follows the campaign's Tier live (its column for that Tier, p.323), where this repo fixes it when
// the Threat joins the fight (addThreat in apps/api/src/encounter/encounter.actions.ts). The pack writes all five
// columns for every Threat, so the column always exists.
const CLASS = "at(class, campaign.tier)";
// A Mob is a Threat that carries the members resource: the platform creates it only once the start field is set,
// which spawning a pack entry with a member count does (addThreat, encounter.actions.ts:137-138). threatStatus reads a
// Mob by its members alone (p.325): Slain at none, the Resolve reminder while half or more are slain (rules-flow
// §11.13), and none of a single Threat's states.
const MOB = "has(res.members)";
const SINGLE = `!${MOB}`;
const THREAT_STATES = [
  {
    id: "slain",
    label: "Slain",
    when: `(${MOB} && res.members == 0) || (${SINGLE} && ((${OVER_WOUNDS} && ${CLASS} != "adversary") || (!(${OVER_WOUNDS}) && ${OVER_SHOCK} && ${CLASS} == "troop")))`,
  },
  {
    id: "halfSlain",
    label: "Resolve DN 3 at Round end",
    when: `${MOB} && res.members > 0 && res.members * 2 <= mob.start`,
  },
  {
    id: "dyingOrDead",
    label: "Dying or dead (GM)",
    when: `${SINGLE} && ${OVER_WOUNDS} && ${CLASS} == "adversary"`,
  },
  {
    id: "threatExhausted",
    label: "Exhausted",
    when: `${SINGLE} && !(${OVER_WOUNDS}) && ${OVER_SHOCK} && ${CLASS} != "troop"`,
  },
  { id: "threatWounded", label: "Wounded", when: `${SINGLE} && !(${OVER_WOUNDS}) && !${OVER_SHOCK} && res.wounds > 0` },
].map((s) => ({ ...s, entities: ["threat"] }));

// An Agent's states as pcStatus gives them (pp.193-196): Dead is an Annihilated Agent (p.194) or one past its Traumatic
// Injuries, and a Dead Agent is neither Dying nor Wounded.
// The Mutations whose printed effect changes a rule the ruleset runs, read from the Agent's held keys (the book row's id,
// as `hasMutation` reads a sheet's `mutations`; Core pp.289, 294).
const holds = (id: string) => `(has(mutations) && contains(mutations, "${id}"))`;
const ENDURING = holds(ENDURING_LIFE);
// With Enduring Life the Agent is never Dead, whether from Traumatic Injuries or Annihilation (p.294, rules-flow §11.185).
const DEAD = `!${ENDURING} && ((has(annihilated) && annihilated) || ${opt("traumatic")} > derived.maxTraumatic)`;
const DYING = `!(${DEAD}) && res.wounds > derived.maxWounds`;

// What one hit does (the platform's `health.harm`): pcHit for an Agent, combatant.adjust for a Threat (state.ts,
// apps/api/src/encounter/encounter.actions.ts:550-577). Every expression reads the actor before the hit.
const HARM = {
  cite: "Core pp.193-199, pp.324-325",
  wounds: "wounds",
  shock: "shock",
  // Every member has 1 Wound: Wounds remove members, healing restores them up to the starting size, and one hit of
  // Shock over the members' Max Shock removes one (p.325, rules-flow §11.9).
  mob: { members: "members", start: "mob.start" },
  profiles: [
    {
      entities: ["agent"],
      // Exhausted: past Max Shock, or the Condition from another source (isExhausted, p.199, rules-flow §11.12).
      spent: { when: "res.shock > derived.maxShock", conditions: ["exhausted"] },
      // Dying (pcStatus): a Wound is one Traumatic Injury per hit (rules-flow §11.11), any healing ends it, and
      // becoming Dying adds Prone (p.193).
      felled: { when: DYING, injuries: "traumatic", condition: "prone", healTo: "derived.maxWounds" },
      // One hit over twice Max Wounds, counted after Resilience (p.194, rules-flow §11.7).
      // Enduring Life makes it an ordinary hit and sets no flag (§11.185).
      // ponytail: Enduring Life puts `over` past any hit (the op takes 100 at most); a `destroyed.when` would say it plainly.
      destroyed: { over: `${ENDURING} ? 1000 : 2 * derived.maxWounds`, field: "annihilated" },
    },
    {
      entities: ["threat"],
      // A Threat printed with "–" never suffers Shock (p.324).
      shockless: "!has(stat.shock)",
      spent: { when: OVER_SHOCK, conditions: ["exhausted"] },
      // No Dying, Traumatic Injury or Annihilation: an Adversary past Max Wounds is the GM's call (rules-flow §11.10).
    },
  ],
};

// A Wounded Agent (any Wounds, so a Dying one too) has +1 DN on every Test (p.193). The app adds it to a called Test,
// which this repo left to the GM (callDn adds only the Corruption modifier); the GM ticks `ignoreWounded` on the call
// for a character it does not apply to, until an entry can carry such an effect itself.
const WOUNDED = "(has(res.wounds) && res.wounds > 0 && !ctx.ignoreWounded ? 1 : 0)";
const IGNORE_WOUNDED = { ignoreWounded: "bool" } as const;

// What the call form and a called Test's card call each Test and input (InconsisTable's house decision #77), in the
// words of this repo's call form (TEST_KIND_LABELS, test-call.ts). The options are the printed Skill and Attribute names.
const INPUT_WORDS = { dn: "DN", bonus: "Bonus dice", ignoreWounded: "Not Wounded (no +1 DN)" } as const;
const SKILL_WORDS = () => Object.fromEntries((Object.keys(SKILLS) as Skill[]).map((s) => [idOf(s), s]));
const ATTRIBUTE_WORDS = () => Object.fromEntries(ATTRIBUTES.map((a) => [idOf(a), ATTRIBUTE_NAMES[a]]));

// What a called Test's result offers the GM, one tap each (InconsisTable's house decision #80). A Wrath Critical earns
// the party 1 Glory, and the GM may take 1 Ruin for a Complication in place of narrating it (pp.163-164, p.320).
const WRATH_OFFERS = [
  {
    id: "wrathCritical",
    label: "Wrath Critical: +1 Glory",
    when: "result.flags.critical",
    changes: [{ pool: "glory", by: "1" }],
    cite: "Core pp.163-164",
  },
  {
    id: "complicationRuin",
    label: "Complication: +1 Ruin",
    when: "result.flags.complication",
    changes: [{ pool: "ruin", by: "1" }],
    cite: "Core p.163, p.320",
  },
];
// A failed Corruption Test gains DN − Icons, doubled on a Complication, and earns the GM 1 Ruin, in one tap as
// character.corrupt (pp.286, 320; corruptionGain, rules-flow §11.134). The DN is the one the Agent rolled against.
const CORRUPTION_OFFER = {
  id: "corruptionGain",
  label: "Gain the Corruption, +1 Ruin",
  when: "!result.passed",
  changes: [
    { resource: "corruption", by: "max(0, result.target - result.total) * (result.flags.complication ? 2 : 1)" },
    { pool: "ruin", by: "1" },
  ],
  cite: "Core p.286, p.320",
};
// A failed Fear Test earns the GM 1 Ruin (p.320); the GM marks a Resolve Test as one against Fear (p.199).
const FEAR = { fear: { label: "Fear", cite: "Core p.199" } };
const FEAR_OFFER = {
  id: "fearRuin",
  label: "Failed Fear: +1 Ruin",
  when: 'ctx.fear && ctx.trait == "resolve" && !result.passed',
  changes: [{ pool: "ruin", by: "1" }],
  cite: "Core p.199, p.320",
};

// The Conditions the book prints with a rating that stacks: Hindered (2) and Bleeding (3) (p.197), Vulnerable (2) (the
// Critical Hit table, p.198). The rest are held or not (addCondition, lookups.ts; rules-flow §11.188).
const RATED = new Set(["Hindered", "Bleeding", "Vulnerable"]);
// A line for the side running the fight while a combatant holds the Condition (TURN_START_REMINDERS and
// TURN_END_REMINDERS, state.ts; pp.198-200), in this ruleset's words.
const CONDITION_LINES: Record<string, { at: "turnStart" | "turnEnd"; text: string }> = {
  "On Fire": {
    at: "turnStart",
    text: "On Fire: 1d3 Mortal Wounds; an Action and Prone with DN 3 Athletics puts it out",
  },
  Poisoned: { at: "turnStart", text: "Poisoned: a Toughness Test to shake it off" },
  Frenzied: { at: "turnStart", text: "Frenzied: DN 3 Willpower Test to resist" },
  Bleeding: { at: "turnEnd", text: "Bleeding: 1 Mortal Wound per stack; DN 4 Toughness stops it" },
};

// The Round's end (roundEndReminders, state.ts): a held action is lost (p.187), and the ambushed act normally from
// Round 2 (p.177). A Mob with half or more slain (p.325) is the Threat's `halfSlain` state: a reminder is read on every
// actor type and an Agent has no members to read (rules-flow §11.188).
const REMINDERS = [
  { id: "heldLost", at: "roundEnd", text: "The held action is lost", if: "held", cite: "Core p.187" },
  {
    id: "ambushOver",
    at: "roundEnd",
    text: "No longer ambushed: acts in Round 2",
    if: "round == 1 && barred",
    cite: "Core p.177",
  },
];

// Enduring Life: 1d6 Corruption for each Traumatic Wound taken (p.294, §11.185). A notice holds once per Injury reached,
// so each added Injury tells the GM one roll, as character.adjust does.
// ponytail: up to 10 Traumatic Injuries, far past any Max (Tier + 1); more rules if a table goes past it.
const ENDURING_NOTICES = Array.from({ length: 10 }, (_, i) => ({
  id: `enduringLife${i + 1}`,
  when: "crossed",
  entities: ["agent"],
  if: `${ENDURING} && ${opt("traumatic")} >= ${i + 1}`,
  text: "{name}: Enduring Life, roll 1d6 Corruption",
  cite: "Core p.294",
}));

// Rank rises by 1 per 40 XP earned, to 3 (Core p.146): one notice per Rank reached, as session.end names it.
const RANKS = [2, 3] as const;
// The Corruption levels a gain enters (corruptionLevel, Core p.286): each but Chaos Spawn calls for a Mutation Test at
// DN 3 plus the level's modifier (p.287, mutationDns, rules-flow §11.135), and Chaos Spawn gives the Agent to the GM.
const corruptionSteps = () => {
  const steps: { from: number; name: string; modifier: number; chaosSpawn: boolean }[] = [];
  for (let p = 1; p <= CHAOS_SPAWN_AT; p++) {
    const l = corruptionLevel(p);
    if (l.level !== corruptionLevel(p - 1).level) steps.push({ from: p, ...l });
  }
  return steps;
};

const POOL = {
  die: 6,
  // 4 or 5 is an Icon, 6 an Exalted Icon worth two (p.159); a surplus Exalted Icon may be Shifted (p.165).
  bands: [
    { id: "exalted", from: 6, to: 6, worth: 2 },
    { id: "icon", from: 4, to: 5, worth: 1 },
  ],
  // One die of every pool is the Wrath Die (p.159): 6 is a Wrath Critical, 1 a Complication (p.163).
  special: { label: "Wrath Die", count: 1, flags: { critical: { from: 6, to: 6 }, complication: { from: 1, to: 1 } } },
  shift: "exalted",
  modifier: "ctx.bonus",
} as const;

// The entity type each catalogue kind of the ledger builder is held in, by the keys of the builder's `Creation` type
// and `wargear` (InconsisTable's ADR 0011). A pack entry of one of these types carries the builder's record.
export const CATALOGUE_KINDS = {
  keywords: "keyword",
  factions: "faction",
  "sub-factions": "subFaction",
  species: "species",
  backgrounds: "background",
  "option-groups": "optionGroup",
  archetypes: "archetype",
  talents: "talent",
  packages: "package",
  disciplines: "discipline",
  powers: "power",
  languages: "language",
  wargear: "wargear",
} as const;
export type CatalogueKind = keyof typeof CATALOGUE_KINDS;

// The catalogue's entity types. None is built or fought, so none is an actor; wargear is an `item`, every other kind an
// `ability` (the platform's other non-actor bases, `condition` among them, fit none better). The fields repeat a few of
// the record's numbers to browse and filter by; the record itself is the entry's `record`.
function catalogueEntities(params: ReturnType<typeof buildParams>) {
  const party = { visibility: "party" } as const;
  const xp = { xp: { type: "int", label: "XP", min: 0, ...party } };
  const fields: Partial<Record<(typeof CATALOGUE_KINDS)[CatalogueKind], Record<string, unknown>>> = {
    archetype: {
      tier: {
        type: "int",
        label: "Tier",
        min: params.tiers.min,
        max: params.tiers.max,
        ...party,
        cite: params.cites.archetypeTier,
      },
      ...xp,
    },
    species: { ...xp, speed: { type: "int", label: "Speed", min: 0, ...party, cite: "Core p.29" } },
    talent: xp,
    package: xp,
    power: xp,
    wargear: {
      kind: { type: "enum", label: "Kind", values: params.vocabulary.wargearKinds, ...party },
      value: { type: "int", label: "Value", min: 0, max: 30, ...party },
      rarity: { type: "enum", label: "Rarity", values: params.rarity.order.map(idOf), ...party },
    },
  };
  const labels: Record<CatalogueKind, string> = {
    keywords: "Keyword",
    factions: "Faction",
    "sub-factions": "Sub-faction",
    species: "Species",
    backgrounds: "Background table",
    "option-groups": "Option group",
    archetypes: "Archetype",
    talents: "Talent",
    packages: "Package",
    disciplines: "Psychic discipline",
    powers: "Psychic power",
    languages: "Language",
    wargear: "Wargear",
  };
  return (Object.entries(CATALOGUE_KINDS) as [CatalogueKind, (typeof CATALOGUE_KINDS)[CatalogueKind]][]).map(
    ([kind, id]) => ({
      id,
      label: labels[kind],
      base: kind === "wargear" ? "item" : "ability",
      fields: fields[id] ?? {},
    }),
  );
}

// What this repo's codex holds beside an entry's name and texts (CodexInput, packages/shared/src/codex.ts), so a
// campaign moved over keeps it (InconsisTable's house decision #71). A field's visibility is what toPlayerCodex sends: a
// value it sends once the entry is revealed is `party`, the entry's own visibility hiding it until then; one it blanks
// is `gm`. Enum words are the editor's (codex-editor.tsx, beat-editor.tsx: the value in capitals). A link to another
// entry (`entry`, house decision #76) is one of this repo's foreign keys between codex rows.
const capOf = (s: { unwrap(): { maxLength: number | null } }) => s.unwrap().maxLength!;
const capitals = (values: readonly string[]) => Object.fromEntries(values.map((v) => [v, v.toUpperCase()]));
/** How a faction's Keywords join into its one text field (the codex has no list): as its card shows them. */
export const KEYWORD_JOIN = " · ";
export const CODEX = {
  kinds: {
    npc: {
      fields: {
        // Players see it (rules-flow §11.89). Neutral changes nothing and draws no chip (attitude-chip.tsx): the
        // converter leaves the field unset for it, and the GM may still pick it.
        attitude: {
          type: "enum",
          label: "Attitude",
          values: [...Attitude.options],
          labels: capitals(Attitude.options),
          // The modifier on a social Test's DN, worded as attitudeLabel words it (attitude-chip.tsx), none for 0.
          notes: Object.fromEntries(
            Attitude.options
              .filter((a) => ATTITUDE_DN[a] !== 0)
              .map((a) => [a, `${ATTITUDE_DN[a] < 0 ? "−" : "+"}${Math.abs(ATTITUDE_DN[a])} DN`]),
          ),
          // The chip draws a harder DN as a warning and has no positive colour (attitude-chip.tsx).
          tones: Object.fromEntries(Attitude.options.filter((a) => ATTITUDE_DN[a] > 0).map((a) => [a, "bad"])),
          visibility: "party",
          cite: "Core p.168",
        },
        role: { type: "text", label: "Role", maxLength: capOf(CodexInput.npc.shape.role), visibility: "party" },
        // The bestiary Threat it uses (StatSource `bestiary`), a pack entry's key. The `quick` source (a Tier row of
        // the Quick NPC table, p.326, and a specialty Skill) is no field: the codex has no inline stat block, so the
        // converter writes it into the GM notes (house decision #71: "a ref plus the GM's own text").
        stats: { type: "ref", label: "Stat block", entity: "threat", visibility: "gm" },
        // `factionId`: players never receive it (toPlayerCodex).
        faction: { type: "entry", label: "Faction", kind: "faction", visibility: "gm" },
      },
    },
    // Players receive no faction. The card's ally hint (mixingHint, Core p.317) is computed from stance and Keywords,
    // which no field can say: it is not ported.
    faction: {
      fields: {
        stance: {
          type: "enum",
          label: "Stance",
          values: [...FactionStance.options],
          labels: capitals(FactionStance.options),
          visibility: "gm",
        },
        keywords: {
          type: "text",
          label: "Keywords",
          maxLength: MAX_FACTION_KEYWORDS * MAX_KEYWORD_LENGTH + (MAX_FACTION_KEYWORDS - 1) * KEYWORD_JOIN.length,
          visibility: "gm",
          cite: "Core pp.375-378",
        },
      },
    },
    // Players receive no scene.
    scene: {
      fields: {
        type: {
          type: "enum",
          label: "Type",
          values: [...BeatType.options],
          labels: capitals(BeatType.options),
          visibility: "gm",
        },
        goal: { type: "text", label: "Goal", maxLength: capOf(CodexInput.beat.shape.goal), visibility: "gm" },
        outcome: { type: "text", label: "Outcome", maxLength: capOf(CodexInput.beat.shape.outcome), visibility: "gm" },
      },
    },
    // The premise stays the entry's own text; the brief and the status are what a shown mission's phones read.
    adventure: {
      fields: {
        status: {
          type: "enum",
          label: "Status",
          values: [...AdventureStatus.options],
          labels: { ...ADVENTURE_STATUS },
          visibility: "party",
        },
        brief: {
          type: "text",
          label: "Brief",
          maxLength: capOf(CodexInput.adventure.shape.brief),
          visibility: "party",
        },
      },
    },
    // The GM's free-text hazards; the structured list (`hazardList`, book rows by id) is not ported.
    location: {
      fields: {
        hazards: {
          type: "text",
          label: "Hazards",
          maxLength: capOf(CodexInput.location.shape.hazards),
          visibility: "gm",
        },
      },
    },
    // A player reads only a given item's name and description, the entry's own title and text: where it lay and who
    // carried it (`locationId`, `npcId`, worded as holder-field.tsx asks) stay the GM's.
    item: {
      fields: {
        location: { type: "entry", label: "Where it lies", kind: "location", visibility: "gm" },
        holder: { type: "entry", label: "Who carries it", kind: "npc", visibility: "gm" },
      },
    },
  },
} as const;

/**
 * The ruleset. By default (0.1.x) a character is copied in by hand through the `creation` steps. With
 * `builder: "ledger"` (0.2.x) the Agent is bought with XP by InconsisTable's ledger builder instead: the `build` block
 * and the catalogue's entity types, and no `creation` steps (the platform refuses both on one actor type).
 */
export function buildRuleset({ builder }: { builder?: "ledger" } = {}) {
  const skills = Object.keys(SKILLS) as Skill[];
  const party = { visibility: "party" } as const;

  const attributes = Object.fromEntries(
    ATTRIBUTES.map((a) => [attrPath(a), { type: "int", label: ATTRIBUTE_NAMES[a], min: 1, max: 12, ...party }]),
  );
  const agentFields = {
    name: { type: "text", label: "Name", visibility: "public" },
    species: { type: "text", label: "Species", ...party },
    archetype: { type: "text", label: "Archetype", ...party },
    keywords: { type: "list", label: "Keywords", ...party },
    xp: { type: "int", label: "XP earned", min: 0, visibility: "owner", cite: "Core pp.146-147" },
    ...attributes,
    ...Object.fromEntries(skills.map((s) => [`skill.${idOf(s)}`, { type: "int", label: s, min: 0, max: 8, ...party }])),
    "armour.ar": { type: "int", label: "Armour Rating", min: 0, ...party },
    "armour.powered": { type: "int", label: "Powered (X)", min: 0, ...party, cite: "Core p.232" },
    baseSpeed: { type: "int", label: "Speed (Species)", min: 0, ...party, cite: "Core p.29" },
    ...Object.fromEntries(
      Object.entries(MODS).map(([k, label]) => [`mod.${k}`, { type: "int", label: `Bonus: ${label}`, ...party }]),
    ),
    traumatic: { type: "int", label: "Traumatic Injuries", min: 0, ...party, cite: "Core pp.193-194" },
    annihilated: { type: "bool", label: "Annihilated", ...party, cite: "Core p.194" },
    // The Mutations the Agent holds, by the book row's id (the sheet's `mutations`, Core pp.287-295). Other players read
    // the effect on the numbers, not the names ("Unseen", state.ts).
    mutations: { type: "list", label: "Mutations", visibility: "owner", cite: "Core pp.287-295" },
    // Who the Agent is, in the player's own words (CharacterDetail, state.ts; Core pp.32-36), on the sheet's WHO YOU
    // ARE. Text only, in no formula. The portrait (`detail.portrait`) is not ported: it names an image bundled with this
    // repo's web app, which InconsisTable does not have.
    ...Object.fromEntries(
      DETAIL.map(([id, label]) => [
        `detail.${id}`,
        { type: "text", label, maxLength: DETAIL_MAX, ...party, editableBy: "owner" },
      ]),
    ),
  };

  const ruleset = {
    id: "wrath-and-glory",
    version: "0.1.6",
    // InconsisTable's engine reports no core version yet: the range its samples declare (rules-flow §11.186).
    core: "^0.1.0",
    // The default is the lowest valid Tier: the platform needs a value before the owner sets one, and this repo has
    // none to give (a campaign's Tier is chosen when it is created).
    campaignFields: { tier: { type: "int", label: "Tier", min: 1, max: 5, default: 1, cite: "Core p.20" } },
    // Core rulebook: PDF page = printed + 1 (CLAUDE.md).
    sources: [{ id: "core", title: "Wrath & Glory Core Rulebook", license: "private", pageOffset: 1 }],
    entities: [
      {
        id: "agent",
        label: "Agent",
        base: "actor",
        fields: agentFields,
        derived: [
          // Skill Rating + the linked Attribute (p.40; the links are printed on the sheet, p.372).
          ...skills.map((s) => ({
            id: idOf(s),
            label: s,
            expr: `${opt(`skill.${idOf(s)}`)} + ${attrTotal(SKILLS[s])}`,
            ...party,
            cite: "Core p.40, p.372",
          })),
          {
            id: "strengthTotal",
            label: "Strength (with Powered)",
            expr: `attr.s + ${opt("armour.powered")}`,
            ...party,
            cite: "Core p.232",
          },
          // Rank reads the XP earned, which only its owner sees.
          ...TRAITS.map((t) => ({ ...t, visibility: t.id === "rank" ? "owner" : "party" })),
          {
            id: "corruptionMod",
            label: "Corruption DN modifier",
            expr: corruptionModifier(),
            visibility: "owner",
            cite: "Core p.286",
          },
        ],
      },
      {
        // A Threat as its stat block prints it: the Traits are numbers, not formulas (p.323). A Mob is one Threat with a
        // member count (`mob.start`, `members`).
        // The fields below `name` are what the Threat pack fills (packages/data/port/pack.ts); an unset one is
        // a printed "–" (or a column the block does not print).
        id: "threat",
        label: "Threat",
        base: "actor",
        fields: {
          name: { type: "text", label: "Name", visibility: "public" },
          faction: { type: "enum", label: "Faction", values: Threat.shape.faction.options.map(idOf) },
          size: { type: "enum", label: "Size", values: ThreatSize.options.map(idOf), cite: statCite("Size") },
          // The class printed for each Tier, as the book prints it (p.323); the class in play is the column of the
          // campaign's Tier.
          ...Object.fromEntries(
            [1, 2, 3, 4, 5].map((n) => [
              `class.t${n}`,
              {
                type: "enum",
                label: `Class at Tier ${n}`,
                values: Object.values(THREAT_CLASSES),
                cite: statCite("Tier and Threat"),
              },
            ]),
          ),
          keywords: { type: "list", label: "Keywords", cite: statCite("Keywords") },
          ...Object.fromEntries(
            ATTRIBUTES.map((a) => [
              attrPath(a),
              { type: "int", label: ATTRIBUTE_NAMES[a], min: 0, cite: statCite(ATTRIBUTE_NAMES[a]) },
            ]),
          ),
          // A printed 0 is real (a Defence of 0 on one block), so no minimum of 1 here.
          "stat.defence": { type: "int", label: "Defence", min: 0, cite: statCite("Defence") },
          "stat.resilience": { type: "int", label: "Resilience", min: 1, cite: statCite("Resilience") },
          "stat.wounds": { type: "int", label: "Max Wounds", min: 1, cite: statCite("Wounds") },
          // Left unset for a Threat printed with "–": it never takes Shock (p.324).
          "stat.shock": { type: "int", label: "Max Shock", min: 1, cite: statCite("Shock") },
          "stat.speed": { type: "int", label: "Speed", min: 0, cite: statCite("Speed") },
          "stat.conviction": { type: "int", label: "Conviction", min: 0, cite: statCite("Conviction") },
          "stat.resolve": { type: "int", label: "Resolve", min: 0, cite: statCite("Resolve") },
          "stat.personalRuin": { type: "int", label: "Personal Ruin", min: 1, cite: statCite("Personal Ruin") },
          "stat.passiveAwareness": { type: "int", label: "Passive Awareness", min: 0, cite: "Core p.37" },
          // The block's short note on its armour (a few words), not rules text.
          "stat.armourNote": { type: "text", label: "Armour note", maxLength: 120, cite: statCite("Resilience") },
          // The Skill ratings as dice; `skill.default` is the block's "all other Skills" rating.
          "skill.default": { type: "int", label: "Other Skills", min: 0, cite: statCite("Skills") },
          ...Object.fromEntries(
            skills.map((s) => [`skill.${idOf(s)}`, { type: "int", label: s, min: 0, cite: statCite("Skills") }]),
          ),
          // "Spend N Ruin or Glory to roll Nd6" (p.323), when the block prints exactly that.
          "determination.cost": { type: "int", label: "Determination: cost", min: 1, cite: statCite("Determination") },
          "determination.pool": { type: "int", label: "Determination: dice", min: 1, cite: statCite("Determination") },
          "determination.currency": {
            type: "enum",
            label: "Determination: paid in",
            values: ["ruin", "glory"],
            cite: statCite("Determination"),
          },
          // Names only: the book's text for each stays in the book.
          abilities: { type: "list", label: "Abilities", cite: statCite("Action") },
          bonuses: { type: "list", label: "Bonuses", cite: statCite("Bonuses") },
          options: { type: "list", label: "Options", cite: "Core p.323" },
          // The keys of this Threat's weapon entries: from its abilities, and from its options.
          weapons: { type: "list", label: "Weapons", cite: "Core p.323" },
          variantWeapons: { type: "list", label: "Option weapons", cite: "Core p.323" },
          // A Mob's starting size (combatant.mobStart): two Troops or more (p.324, MOB_MIN); at most the 500 a Mob is
          // added with (combatant.addThreat, an app limit of this repo, not a rule). Unset for a single Threat.
          "mob.start": {
            type: "int",
            label: "Mob: starting size",
            min: MOB_MIN,
            max: 500,
            ...party,
            cite: "Core p.324",
          },
        },
        derived: [
          { id: "maxWounds", label: "Max Wounds", expr: "stat.wounds", cite: "Core p.323" },
          { id: "maxShock", label: "Max Shock", expr: opt("stat.shock"), cite: "Core p.324" },
          // +1 bonus die per Troop, at most half of them, rounded up (mobBonusDice, attack.ts; rules-flow §11.173).
          {
            id: "mobBonusDice",
            label: "Mob bonus dice",
            expr: `${MOB} ? (res.members + 1) / 2 : 0`,
            cite: "Core p.324",
          },
        ],
      },
      {
        // One printed weapon line of a Threat (its own entry, so the cite is exact). The profile is numbers only.
        id: "weapon",
        label: "Weapon",
        base: "item",
        fields: {
          damage: { type: "int", label: "Damage", min: 0, cite: statCite("Damage and Extra Damage Dice") },
          ed: { type: "int", label: "Extra Damage Dice", min: 0, cite: statCite("Damage and Extra Damage Dice") },
          // A few blocks print the dice, such as 1d3.
          edDice: {
            type: "text",
            label: "Extra Damage Dice (dice)",
            maxLength: 20,
            cite: statCite("Damage and Extra Damage Dice"),
          },
          ap: { type: "int", label: "AP", max: 0, cite: statCite("Armour Penetration") },
          "range.s": { type: "int", label: "Range: short", min: 1, cite: statCite("Range") },
          "range.m": { type: "int", label: "Range: medium", min: 1, cite: statCite("Range") },
          "range.l": { type: "int", label: "Range: long", min: 1, cite: statCite("Range") },
          salvo: { type: "int", label: "Salvo", min: 0, cite: statCite("Salvo") },
          count: { type: "int", label: "Count", min: 1 },
          traits: { type: "list", label: "Traits", cite: "Core p.208" },
          fromOption: { type: "text", label: "From the option", maxLength: 120 },
        },
      },
    ],
    resources: [
      // Wounds and Shock count up from 0 and may pass their maximum (Dying, Exhausted): they start at their minimum
      // and neither is capped.
      {
        id: "wounds",
        label: "Wounds",
        scope: "entity",
        max: "derived.maxWounds",
        capped: false,
        start: "min",
        // A Respite clears both and sets Wrath to 2 (pp.196-197): the engine's long rest.
        resetOn: [{ event: "longRest", to: "min" }],
        ...party,
        cite: "Core p.193",
      },
      {
        id: "shock",
        label: "Shock",
        scope: "entity",
        max: "derived.maxShock",
        capped: false,
        start: "min",
        resetOn: [{ event: "longRest", to: "min" }],
        ...party,
        cite: "Core p.196",
      },
      {
        id: "wrath",
        label: "Wrath",
        scope: "entity",
        entities: ["agent"],
        resetOn: [
          { event: "sessionStart", to: "2" },
          { event: "longRest", to: "2" },
        ],
        ...party,
        cite: "Core p.164",
      },
      {
        id: "glory",
        label: "Glory",
        scope: "party",
        max: "max(6, party.characters + 2)",
        resetOn: [{ event: "sessionStart", to: "0" }],
        ...party,
        cite: "Core p.164",
      },
      {
        // GM-only by rules-flow §11.58, although p.320 has it in view of the players.
        id: "ruin",
        label: "Ruin",
        scope: "gm",
        max: "max(1, 2 * party.characters)",
        resetOn: [{ event: "sessionStart", to: "party.characters" }],
        cite: "Core p.320",
      },
      {
        // A Mob's members standing (combatant.mobCount): full when it is made, never past its starting size (p.325).
        // Its bounds read `mob.start`, so a single Threat, which has none, never carries it.
        id: "members",
        label: "Mob members",
        scope: "entity",
        entities: ["threat"],
        max: "mob.start",
        start: "max",
        ...party,
        cite: "Core pp.324-325",
      },
      { id: "personalRuin", label: "Personal Ruin", scope: "entity", entities: ["threat"], cite: "Core p.323, p.325" },
      { id: "wealth", label: "Wealth", scope: "entity", entities: ["agent"], ...party, cite: "Core p.38" },
      {
        id: "corruption",
        label: "Corruption",
        scope: "entity",
        entities: ["agent"],
        visibility: "owner",
        cite: "Core p.285",
      },
      ...AMMO_TYPES.map((a) => ({
        id: `ammo${a}`,
        label: `${a} ammo`,
        scope: "entity",
        entities: ["agent"],
        visibility: "owner",
        editableBy: "ownerSpendOnly",
        cite: "Core p.229",
      })),
    ],
    conditions: CONDITIONS.map((name) => ({
      id: idOf(name),
      label: name,
      cite: conditionCite(name),
      // "Until the end of your next Turn" is counted in the holder's own Turns, so one given in the holder's own Turn
      // lasts through the next one too (rules-flow §11.8).
      ...((TIMED_CONDITIONS as readonly string[]).includes(name)
        ? { duration: "ownTurnEnd", from: "nextOwnTurn" }
        : { duration: "manual" }),
      ...(RATED.has(name) && { stacking: "stack" }),
      ...CONDITION_LINES[name],
      ...party,
    })),
    reminders: REMINDERS,
    tests: {
      skill: {
        kind: "poolSuccesses",
        ...POOL,
        entities: ["agent"],
        pool: "derived[ctx.skill]",
        target: `ctx.dn + ${WOUNDED}`,
        inputs: { skill: "text", dn: "int", bonus: "int", ...IGNORE_WOUNDED },
        inputOptions: { skill: skills.map(idOf) },
        label: "Skill Test",
        inputLabels: { skill: "Skill", ...INPUT_WORDS },
        inputOptionLabels: { skill: SKILL_WORDS() },
        offers: WRATH_OFFERS,
        cite: "Core p.158",
      },
      attribute: {
        kind: "poolSuccesses",
        ...POOL,
        entities: ["agent"],
        pool: 'ctx.attribute == "s" ? derived.strengthTotal : attr[ctx.attribute]',
        target: `ctx.dn + ${WOUNDED}`,
        inputs: { attribute: "text", dn: "int", bonus: "int", ...IGNORE_WOUNDED },
        inputOptions: { attribute: ATTRIBUTES.map(idOf) },
        label: "Attribute Test",
        inputLabels: { attribute: "Attribute", ...INPUT_WORDS },
        inputOptionLabels: { attribute: ATTRIBUTE_WORDS() },
        offers: WRATH_OFFERS,
        cite: "Core p.158",
      },
      trait: {
        kind: "poolSuccesses",
        ...POOL,
        entities: ["agent"],
        pool: "derived[ctx.trait]",
        target: `ctx.dn + ${WOUNDED}`,
        inputs: { trait: "text", dn: "int", bonus: "int", ...IGNORE_WOUNDED },
        inputOptions: { trait: ["influence", "resolve"] },
        label: "Influence or Resolve Test",
        inputLabels: { trait: "Trait", ...INPUT_WORDS },
        inputOptionLabels: { trait: { influence: "Influence", resolve: "Resolve (Fear, Terror)" } },
        marks: FEAR,
        offers: [FEAR_OFFER, ...WRATH_OFFERS],
        cite: "Core pp.169-170",
      },
      corruption: {
        kind: "poolSuccesses",
        ...POOL,
        entities: ["agent"],
        pool: "derived.conviction",
        // The source's DN plus the modifier of the Agent's Corruption level (p.286).
        // Blighted Soul: +1 DN on the holder's own Corruption Tests (p.289, rules-flow §11.184).
        target: `ctx.dn + derived.corruptionMod + (${holds(BLIGHTED_SOUL)} ? 1 : 0) + ${WOUNDED}`,
        inputs: { dn: "int", bonus: "int", ...IGNORE_WOUNDED },
        label: "Corruption Test",
        inputLabels: INPUT_WORDS,
        offers: [CORRUPTION_OFFER, ...WRATH_OFFERS],
        cite: "Core p.285",
      },
      // An Opposed Test has no DN: most Icons wins (p.170), which both sides roll and compare at the table, so the app
      // records who won (TEST_KINDS `opposed`, state.ts). It rolls a Skill or an Attribute, as this repo's call does.
      opposed: {
        kind: "reported",
        entities: ["agent"],
        outcomes: [
          { id: "won", label: "Won", cite: "Core p.170" },
          { id: "beaten", label: "Lost", cite: "Core p.170" },
        ],
        inputs: { roll: "text" },
        inputOptions: { roll: [...skills.map(idOf), ...ATTRIBUTES.map(idOf)] },
        label: "Opposed Test",
        inputLabels: { roll: "Skill or Attribute" },
        inputOptionLabels: { roll: { ...SKILL_WORDS(), ...ATTRIBUTE_WORDS() } },
        cite: "Core p.170",
      },
    },
    // Alternating Turns (pp.176-177): after an Agent a Threat acts and the other way round, the side whose pick it is
    // chooses who goes, and the players pick first each Round. sideUpNext, canSeize and canAct (state.ts) are the
    // reference; the port's turns test compares the two over generated fights.
    initiative: {
      strategy: "sides",
      // An Agent is on the Agents' side and a Threat on the Threats' (sideOfKind, state.ts).
      sides: [
        { id: "agents", label: "Agents", entities: ["agent"] },
        { id: "threats", label: "Threats", entities: ["threat"] },
      ],
      // Dead Agents and Slain Threats take no Turns and do not hold up the Round (isOut, state.ts; pp.193, 324). An
      // Adversary past Max Wounds stays in the order until the GM removes it (rules-flow §11.10).
      unableStates: ["dead", "slain"],
      firstSide: "fixed",
      // The GM taps BEGIN ROUND N: a Round never ends by itself (rules-flow §11.169).
      roundEnd: "manual",
      // Round 0: Determine Ambushes and Set the Scene, before Round 1 (p.176 Steps 1 and 2, rules-flow §11.167).
      setup: { note: "Round 0: mark who is ambushed and set the scene, then begin Round 1", cite: "Core p.176" },
      // Seize the Initiative: 1 Glory for an Agent, 1 Ruin for a Threat (p.177, p.320).
      outOfTurn: {
        cost: { agents: { pool: "glory", amount: 1 }, threats: { pool: "ruin", amount: 1 } },
        cite: "Core p.177, p.320",
      },
      hold: { cite: "Core p.177, p.187" },
      // Ambushed: no Turn in Round 1; 1 Glory or 1 Ruin makes a character act normally (p.177).
      barred: {
        throughRound: 1,
        liftCost: { agents: { pool: "glory", amount: 1 }, threats: { pool: "ruin", amount: 1 } },
        cite: "Core p.177",
      },
      cite: "Core pp.176-177",
    },
    health: {
      states: [
        { id: "dead", label: "Dead", when: DEAD, entities: ["agent"] },
        { id: "dying", label: "Dying", when: DYING, entities: ["agent"] },
        {
          id: "wounded",
          label: "Wounded",
          when: `!(${DEAD}) && res.wounds > 0 && res.wounds <= derived.maxWounds`,
          entities: ["agent"],
        },
        { id: "exhausted", label: "Exhausted", when: "res.shock > derived.maxShock", entities: ["agent"] },
        ...THREAT_STATES,
      ],
      harm: HARM,
      cite: "Core pp.193-196, pp.324-325",
    },
    // No Respite while Dying or Dead (character.respite; pp.196-197).
    rests: [{ event: "longRest", refusedIn: ["dying", "dead"], cite: "Core pp.196-197" }],
    decisions: [
      {
        id: "ruinHidden",
        text: "The GM's Ruin is shown to the GM only, although the book has it in view of the players.",
        cite: "Core p.320",
      },
      {
        id: "passiveAwareness",
        text: "Passive Awareness is half the Awareness total, rounded up; the sheet's mention of Stealth is not used.",
        cite: "Core p.37",
      },
      {
        id: "timedConditions",
        text: "Hindered, Staggered and Vulnerable end at the end of the affected character's own next Turn.",
        cite: "Core pp.199-200",
      },
      {
        id: "woundedDn",
        text: "The app adds the +1 DN of a Wounded Agent to a called Test. The GM ticks ignoreWounded on the call for a character it does not apply to.",
        cite: "Core p.193",
      },
      {
        id: "seizeOnce",
        text: "After a Seize the other side must act next: a side cannot Seize again until then, and the GM's Seize at the start of a Round follows the same limit.",
        cite: "Core p.177, p.320",
      },
      {
        id: "orderIsASuggestion",
        text: "The app says which side picks next but lets the GM start any ready combatant for free, to fix a slip at the table.",
        cite: "Core p.177",
      },
      {
        id: "roundEndsOnTheGm",
        text: "A Round ends when the GM begins the next one, so a late arrival or an extra Turn can still go first.",
        cite: "Core p.176",
      },
      {
        id: "contaminatedAt11",
        text: "11 Corruption is Contaminated: the book prints 11 in two rows.",
        cite: "Core p.285",
      },
      {
        id: "threatClassAtTier",
        text: "A Threat below its first printed Tier takes that Tier's class, and past its last printed column keeps the last.",
        cite: "Core p.323",
      },
      // What the notices below cannot say (rules-flow §11.187).
      {
        id: "unspentXpUntold",
        text: "Session start does not name who has XP left to spend: a rule cannot read the XP a build has spent. Each player's sheet shows it.",
        cite: "Core p.146, p.148",
      },
      {
        id: "groupAscendUntold",
        text: "Session end does not say the group may Ascend: a rule reads one Agent, and Ascending needs every Agent's XP. The GM checks PARTY.",
        cite: "Core p.147",
      },
      // What a called Test's offers cannot say (rules-flow §11.188).
      {
        id: "corruptionDnByHand",
        text: "A Wrath Critical (DN -2) or a spent Wrath (DN -1, not below 1) on a Corruption Test is applied by the GM: a report carries dice, not that choice.",
        cite: "Core p.286",
      },
      {
        id: "monstrousImmuneByHand",
        text: "Monstrous Creatures are immune to Fear, Pinned and Staggered: the GM leaves those off them.",
        cite: "Core p.323",
      },
      {
        id: "enduringLifeOnGain",
        text: "Gaining Enduring Life with Traumatic Injuries already taken tells a 1d6 Corruption roll for each: the GM ignores those.",
        cite: "Core p.294",
      },
      {
        id: "stacksUncapped",
        text: "Hindered, Bleeding and Vulnerable stack with no cap; the other Conditions are held or not.",
        cite: "Core pp.197-198",
      },
    ],
    // What the GM is told after an action (InconsisTable's house decision #79), in this ruleset's own words; the pool-full
    // line (p.320) is the platform's own. One notice per Rank reached and per Corruption level entered, as
    // session.end and character.corrupt tell them (rules-flow §11.135, §11.187).
    notices: [
      ...RANKS.map((rank) => ({
        id: `rank${rank}`,
        when: "crossed",
        entities: ["agent"],
        if: `derived.rank >= ${rank}`,
        text: `{name} reached Rank ${rank}`,
        cite: "Core p.146",
      })),
      ...corruptionSteps().map((l) => ({
        id: `corruption${l.from}`,
        when: "crossed",
        entities: ["agent"],
        if: `${opt("res.corruption")} >= ${l.from}`,
        text: l.chaosSpawn
          ? "{name} is Chaos Spawn: the GM takes the Agent over"
          : `{name} is ${l.name}: Mutation Test, DN ${3 + l.modifier}`,
        cite: l.chaosSpawn ? "Core p.286" : "Core pp.286-287",
      })),
      ...ENDURING_NOTICES,
    ],
    // Until the creation catalogue and the XP ledger are ported, a character is copied in from a finished sheet:
    // free input, nothing priced, each value checked only against its field's own range. Only the Attributes are
    // asked of everyone; a skipped step leaves its values at nothing (no Skill ratings, no armour, no bonuses).
    creation: [
      { id: "who", label: "Who", fields: ["species", "archetype", "keywords"], optional: true, cite: "Core p.21" },
      { id: "attributes", label: "Attributes", fields: [...ATTRIBUTES.map(attrPath), "baseSpeed"], cite: "Core p.24" },
      {
        id: "skills",
        label: "Skill ratings",
        fields: skills.map((s) => `skill.${idOf(s)}`),
        optional: true,
        cite: "Core p.25",
      },
      {
        id: "armour",
        label: "Armour",
        fields: ["armour.ar", "armour.powered"],
        optional: true,
        cite: "Core pp.36-37, p.232",
      },
      {
        id: "bonuses",
        label: "Trait bonuses",
        fields: Object.keys(MODS).map((k) => `mod.${k}`),
        optional: true,
        cite: "Core p.30",
      },
      // Rank reads the XP earned in play (pp.146-147): nothing for a new character.
      { id: "experience", label: "XP earned in play", fields: ["xp"], optional: true, cite: "Core pp.146-147" },
    ].map((step) => ({ ...step, actor: "agent", kind: "fields" })),
    layout: {
      agent: {
        sections: [
          { id: "attributes", label: "Attributes", show: ATTRIBUTES.map(attrPath) },
          {
            id: "traits",
            label: "Traits",
            show: TRAITS.map((t) => `derived.${t.id}`),
          },
          {
            id: "pools",
            label: "In play",
            show: ["res.wounds", "res.shock", "res.wrath", "res.wealth", "res.corruption"],
          },
          { id: "skills", label: "Skills", show: skills.map((s) => `derived.${idOf(s)}`) },
          { id: "who", label: "Who you are", show: DETAIL.map(([id]) => `detail.${id}`) },
        ],
      },
    },
    codex: CODEX,
  };
  if (builder !== "ledger") return ruleset;

  const params = buildParams();
  return {
    ...ruleset,
    version: "0.2.6",
    // Chaos Spawn: the character is lost and the GM takes it over (Core p.286, `pcStatus`). The default ruleset has no
    // such state; the ledger's `build.gone` names this one beside Dead.
    health: {
      ...ruleset.health,
      states: [
        ...ruleset.health.states,
        { id: "lost", label: "Lost", when: `${opt("res.corruption")} >= ${CHAOS_SPAWN_AT}`, entities: ["agent"] },
      ],
    },
    // A Lost Agent is out of the turn order as a Dead one is (isOut reads isGone, state.ts).
    initiative: { ...ruleset.initiative, unableStates: ["dead", "lost", "slain"] },
    rests: [{ ...ruleset.rests[0]!, refusedIn: ["dying", "dead", "lost"] }],
    entities: [...ruleset.entities, ...catalogueEntities(params)],
    creation: [],
    build: {
      strategy: "ledger",
      actor: "agent",
      params,
      kinds: CATALOGUE_KINDS,
      // Where the resolved sheet lands: the Agent's own fields and resources, the ones the by-hand steps fill.
      sheet: {
        attributes: Object.fromEntries(params.vocabulary.attributes.map((a) => [a.id, attrPath(a.id as Attribute)])),
        skills: Object.fromEntries(params.vocabulary.skills.map((s) => [s.name, `skill.${idOf(s.name)}`])),
        mods: Object.fromEntries(params.vocabulary.mods.map((m) => [m.key, `mod.${m.key}`])),
        armourRating: "armour.ar",
        powered: "armour.powered",
        speed: "baseSpeed",
        species: "species",
        archetype: "archetype",
        keywords: "keywords",
        wealth: "wealth",
        corruption: "corruption",
      },
      tier: "tier",
      xp: "xp",
      cite: params.startingXp.cite,
      // After the character is made. The group Ascends once every character it still counts has earned this much XP
      // in the Tier (Core pp.147-148, rules-flow §11.66, `ASCENSION_XP`); a Milestone Ascension awards the same.
      ascension: { xp: ASCENSION_XP, cite: "Core pp.147-148" },
      // Out of the game for good, so out of the count (`isGone`): Dead, or Lost to Chaos (p.286).
      gone: ["dead", "lost"],
      // A session's end may award up to 100 XP (the `session.end` action), and the GM's band offers 8, 10 and 12
      // (Core p.321, apps/web/components/gm/party/constants.ts `XP_AWARDS`).
      award: { max: 100, suggested: [8, 10, 12], cite: "Core p.321" },
    },
  };
}
