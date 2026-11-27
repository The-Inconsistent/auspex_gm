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
  MAX_PENDING_SPENDS,
  MAX_SPEND_AMOUNT,
  MAX_UPGRADES,
  RARITY_DN,
  MAX_KEYWORD_LENGTH,
  MAX_MUTATIONS,
  MOB_MIN,
  THREAT_PROFILES,
  SEVERITIES,
  SKILLS,
  Threat,
  ThreatSize,
  TIMED_CONDITIONS,
  UPGRADE_SLOTS,
  type Attribute,
  type Skill,
} from "@wg/shared";
import { ADVENTURE_STATUS } from "../../../apps/web/components/gm/prep/constants.ts";
import { rulesList } from "../index.ts";
import { buildParams } from "./build-params.ts";
import { bookTables, TABLES } from "./tables.ts";

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
      // Determination turns Wounds into Shock (p.196); the op refuses an Exhausted Agent (p.199, rules-flow §11.172).
      convert: true,
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
// A psyker sustaining powers has +2 DN to every Test per power (p.265, sustainPenalty, rules-flow §11.180): the powers
// are a list field shown as chips, the GM's to add and end, and the DN reads their count.
const SUSTAIN = "derived.sustainDn";
const sustaining = {
  type: "list",
  label: "Sustaining",
  chips: true,
  visibility: "party",
  cite: "Core p.265",
} as const;
const SUSTAIN_DN = {
  id: "sustainDn",
  label: "Sustaining: DN",
  expr: "has(sustaining) ? 2 * count(sustaining) : 0",
  visibility: "party",
  cite: "Core p.265",
} as const;
// Who manifests a power (the tracker's PSYCHIC POWERS panel, §11.180): Psychic Mastery rated, or the PSYKER Keyword.
const PSYKER = `${opt("skill.psychicMastery")} > 0 || (has(keywords) && contains(keywords, "PSYKER"))`;

// What the call form and a called Test's card call each Test and input (InconsisTable's house decision #77), in the
// words of this repo's call form (TEST_KIND_LABELS, test-call.ts). The options are the printed Skill and Attribute names.
const INPUT_WORDS = { dn: "DN", bonus: "Bonus dice", ignoreWounded: "Not Wounded (no +1 DN)" } as const;
const SKILL_WORDS = () => Object.fromEntries((Object.keys(SKILLS) as Skill[]).map((s) => [idOf(s), s]));
const ATTRIBUTE_WORDS = () => Object.fromEntries(ATTRIBUTES.map((a) => [idOf(a), ATTRIBUTE_NAMES[a]]));

// What a player may ask the GM to spend, or the GM does in one tap (InconsisTable's house decision #84): this repo's
// spend kinds (spendCost, spend.ts; spend.actions.ts), each with its cost and what it runs. The dice stay physical.
const LOST = `${opt("res.corruption")} >= ${CHAOS_SPAWN_AT}`;
// The spends asked of a running fight: Seize, Aware, Determination and Manifest.
const FIGHT_ONLY: ReadonlySet<string> = new Set(["seize", "aware", "determination", "manifest"]);
const spends = ({ ledger }: { ledger: boolean }) =>
  [
    // Wrath: Reroll Failures (p.164). The reroll is at the table: the app takes the Wrath.
    { id: "reroll", label: "Reroll failures", cost: [{ resource: "wrath", amount: "1" }], cite: "Core p.164" },
    {
      // Wrath: Restore Shock, Rank + Tier (restoreShockAmount), only while conscious and with Shock to restore (p.196).
      id: "restoreShock",
      label: "Restore Shock",
      cost: [{ resource: "wrath", amount: "1" }],
      if: `res.shock > 0 && !(${DEAD}) && !(${DYING})${ledger ? ` && !(${LOST})` : ""}`,
      run: [
        {
          primitive: "health.harm",
          op: "hit",
          input: { actorId: "ctx.self", shock: "-(derived.rank + campaign.tier)" },
        },
      ],
      cite: "Core p.164, p.196",
    },
    // Glory: one per extra die or point of damage (p.165), up to 10 a request (MAX_SPEND_AMOUNT) and to the pool.
    ...(["dice", "damage"] as const).map((what) => ({
      id: what === "dice" ? "gloryDice" : "gloryDamage",
      label: what === "dice" ? "Glory dice" : "Glory damage",
      cost: [{ pool: "glory", amount: `ctx.${what}` }],
      inputs: { [what]: { label: what === "dice" ? "Dice" : "Damage", min: 1, max: String(MAX_SPEND_AMOUNT) } },
      cite: "Core p.165",
    })),
    {
      // Seize the Initiative: the run op takes its own Glory and checks the Seize limit (p.177, rules-flow §11.1).
      id: "seize",
      label: "Seize the Initiative",
      cost: [{ pool: "glory", amount: "1", byRun: true }],
      if: "ctx.fight.in",
      run: [{ primitive: "initiative.sides", op: "seize", input: { id: "ctx.self" } }],
      cite: "Core p.177",
    },
    {
      // Aware of the ambush: 1 Glory to act in Round 1 (p.177, rules-flow §11.177).
      id: "aware",
      label: "Aware of the ambush",
      cost: [{ pool: "glory", amount: "1", byRun: true }],
      if: "ctx.fight.barred",
      run: [{ primitive: "initiative.sides", op: "lift", input: { id: "ctx.self" } }],
      cite: "Core p.177",
    },
    {
      // Determination: the Icons rolled turn as many Wounds into Shock, free, never while Exhausted (pp.196, 199;
      // rules-flow §11.172). Mortal Wounds cannot be turned: the GM judges before accepting.
      id: "determination",
      label: "Determination",
      cost: [],
      if: "res.wounds > 0",
      inputs: { icons: { label: "Icons rolled", min: 1, max: "max(1, res.wounds)" } },
      run: [{ primitive: "health.harm", op: "convert", input: { actorId: "ctx.self", amount: "ctx.icons" } }],
      cite: "Core p.196, p.199",
    },
    {
      // Manifest a psychic power: once a Round in a fight, whether or not it succeeds (p.259, rules-flow §11.181); with a
      // Wrath Die showing 1 the GM opens Perils of the Warp with the extra ones (pp.263-264). A spend's `then` takes
      // no condition, so Perils is always offered; the count starts at 0 so a Manifest with no 1 is recorded as it
      // was, the platform carries it to Perils at its own least, 1, and the GM leaves that offer unapplied (§11.191).
      id: "manifest",
      label: "Manifest a power",
      cost: [],
      if: PSYKER,
      inputs: { ones: { label: "Wrath Dice showing 1", min: 0, max: "10" } },
      limit: { per: "round", max: 1 },
      then: { table: TABLES.perils, inputs: { ones: "ones" } },
      entities: ["agent", "threat"],
      cite: "Core p.259, p.263",
    },
  ].map((x) => ({
    entities: ["agent"],
    ...x,
    // An ask made against the old pools is cleared when a session starts or ends (p.162, p.164, rules-flow §11.124);
    // one tied to the fight, when it ends (§11.122).
    clearOn: ["sessionStart", "sessionEnd", ...(FIGHT_ONLY.has(x.id) ? ["encounterEnd"] : [])],
  }));

// The items an Agent carries (InconsisTable's house decision #95), by the wargear entry's kind, which the wargear pack
// writes as a tag (creation-packs.ts): weapons and armour drawn as the build's cards, upgrades fitted to them (three at
// most, one per slot; Matched Pair by the GM only, pp.227-228, Apocrypha p.388, rules-flow §11.63-§11.64), counted
// ammunition and grenades the holder spends (p.229), and the rest as gear (pp.211-247).
const ITEM_KINDS = [
  { id: "weapon", label: "Weapons", tag: "weapon", card: "weapons", cite: "Core pp.211-226" },
  { id: "armour", label: "Armour", tag: "armour", card: "armour", cite: "Core pp.230-233" },
  {
    id: "upgrade",
    label: "Upgrades",
    tag: "upgrade",
    fits: { to: ["weapon", "armour"], max: MAX_UPGRADES, slot: "slot", gmTag: "pair" },
    cite: "Core pp.227-229",
  },
  { id: "ammo", label: "Ammunition", tag: "ammo", stacks: true, spend: true, cite: "Core p.229" },
  { id: "grenade", label: "Grenades and missiles", tag: "grenade", stacks: true, spend: true, cite: "Core p.229" },
  { id: "gear", label: "Gear", card: "gear", cite: "Core pp.229-247" },
].map((k) => ({ ...k, entry: "wargear", entities: ["agent"] }));
/** The item kind a wargear entry of this catalogue kind is carried as: the first that takes its tag, else gear. */
export const itemKindOf = (wargearKind: string) => ITEM_KINDS.find((k) => k.tag === wargearKind)?.id ?? "gear";
/** The item kinds that are counted, never given or fitted (p.229). */
export const COUNTED_KINDS: ReadonlySet<string> = new Set(ITEM_KINDS.filter((k) => k.stacks).map((k) => k.id));
// Requisition (pp.205-206, requisitionTest): DN Value + the Rarity's penalty, an Influence Test, open to an Agent with a
// Keyword in common, each one past the first a bonus die; [ANY] stands for one more of the Agent's Keywords not
// already matched (rules-flow §11.15).
const RARITY = Object.entries(RARITY_DN).reduceRight(
  (rest, [r, dn]) => `item.rarity == "${idOf(r)}" ? ${dn} : (${rest})`,
  "0",
);
const SHARED = "overlap(item.keywords, keywords)";
const MATCHES = `(${SHARED} + (contains(item.keywords, "[ANY]") && count(keywords) > ${SHARED} ? 1 : 0))`;
const ACQUIRE = {
  test: "requisition",
  inputs: {
    dn: [
      { label: "Value", value: opt("item.value") },
      { label: "Rarity", value: `has(item.rarity) ? (${RARITY}) : 0` },
    ],
    bonus: [{ label: "Keywords past the first", value: `max(0, ${MATCHES} - 1)` }],
  },
  if: `has(keywords) && has(item.value) && ${MATCHES} > 0`,
  // One Wargear Test and one Ammo Test a session; Grenades and Missiles are got as Ammo (p.205, p.229).
  limits: [
    { kinds: ["weapon", "armour", "upgrade", "gear"], max: 1 },
    { kinds: ["ammo", "grenade"], max: 1 },
  ],
  // A failed Test may buy Icons with Wealth, 1 each (p.205).
  topUp: { resource: "wealth" },
  // 3 Ammo, or 5 Grenades or Missiles less the Rarity penalty (p.229, requisitionYield).
  quantity: `contains(item.tags, "grenade") ? 5 - (has(item.rarity) ? (${RARITY}) : 0) : 3`,
  cite: "Core pp.205-206, p.229",
};
const requisition = () => ({
  kind: "poolSuccesses",
  ...POOL,
  entities: ["agent"],
  pool: "derived.influence",
  // Every input is the acquisition's, so the Wounded +1 DN (p.193) has no tick to take it off here.
  target: `ctx.dn + (has(res.wounds) && res.wounds > 0 ? 1 : 0) + ${SUSTAIN}`,
  inputs: { dn: "int", bonus: "int" },
  label: "Requisition Test",
  inputLabels: { dn: INPUT_WORDS.dn, bonus: INPUT_WORDS.bonus },
  offers: WRATH_OFFERS,
  cite: "Core pp.205-206",
});

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
  // The sustaining psyker's +DN, at the start of each of its Turns (sustainTurnReminder, psychic.ts).
  {
    id: "sustaining",
    at: "turnStart",
    text: "Sustaining powers: +2 DN to every Test per power",
    if: "has(sustaining) && count(sustaining) > 0",
    cite: "Core p.265",
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
      // What a requisition reads (p.205) and the slot an upgrade takes on its host (pp.227-228, rules-flow §11.64).
      keywords: { type: "list", label: "Keywords", ...party, cite: "Core p.205" },
      slot: { type: "enum", label: "Upgrade slot", values: [...UPGRADE_SLOTS], ...party, cite: "Core p.227" },
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

// What a Threat may take when it joins a fight (InconsisTable's house decision #92), as prepareThreat does (threat-scale.ts).
// The Threat Profiles (VoA p.126), additive, on any Threat at any Tier (rules-flow §11.103, §11.108): an Attribute,
// Resilience or Resolve printed "–" stays "–" (an add skips an unset field), and an unlisted Skill lands on the
// block's Default pool plus the bonus (p.323, §11.105), none without a Default.
const PROFILE_SKILL: Record<string, string> = {
  "Weapon Skill": "skill.weaponSkill",
  "Ballistic Skill": "skill.ballisticSkill",
};
const profileEffects = (mods: (typeof THREAT_PROFILES)[number]["mods"]) => [
  ...Object.entries(mods.attributes ?? {}).map(([a, d]) => ({
    path: attrPath(a as Attribute),
    mode: "add",
    value: String(d),
  })),
  ...Object.entries(mods.skills ?? {}).flatMap(([name, d]) => {
    const path = PROFILE_SKILL[name]!;
    return [
      { path, mode: "add", value: String(d) },
      { path, mode: "override", value: `skill.default + ${d}`, when: `!has(${path}) && has(skill.default)` },
    ];
  }),
  ...(mods.resilience ? [{ path: "stat.resilience", mode: "add", value: String(mods.resilience) }] : []),
  ...(mods.resolve ? [{ path: "stat.resolve", mode: "add", value: String(mods.resolve) }] : []),
];
// Scaling Threats (p.326, scaleBy): an Elite takes the Tier in Wounds and Shock, an Adversary or a Monstrous Creature
// the Agents seated plus the Tier, a Troop or a Mob nothing (a Mob's members have 1 Wound each, p.325, §11.107); a Shock
// printed "–" stays "–". Fixed at spawn on the class of the campaign's Tier.
const SCALE_BY = `${CLASS} == "elite" ? campaign.tier : (${CLASS} == "troop" ? 0 : party.seated + campaign.tier)`;
// Building Encounters (Threat Assessment p.8, encounterBudget, rules-flow §11.82): two Troops per Agent, half of them in
// Mobs, one Elite or Adversary, at most 10 enemies tracked (a Mob is one); a fortified position doubles each.
const TROOP = `${CLASS} == "troop"`;
export const SPAWN = {
  options: [
    ...THREAT_PROFILES.map((p) => ({
      id: idOf(p.id),
      label: p.name,
      entities: ["threat"],
      effects: profileEffects(p.mods),
      cite: p.cite,
    })),
    // Only a switch: what it adds is the adjustment below.
    { id: "scaled", label: "Scaling Threats", entities: ["threat"], effects: [], cite: "Core p.326" },
  ],
  adjust: [
    {
      option: "scaled",
      entities: ["threat"],
      when: "!ctx.mob",
      add: { "stat.wounds": SCALE_BY, "stat.shock": SCALE_BY },
      cite: "Core p.326",
    },
  ],
  budget: {
    cite: "Threat Assessment p.8",
    lines: [
      { id: "troops", label: "Troops", cost: `${TROOP} ? ctx.count : 0`, budget: "2 * party.seated" },
      {
        id: "inMobs",
        label: "Of those, in Mobs",
        cost: `${TROOP} && ctx.mob && ctx.count >= ${MOB_MIN} ? ctx.count : 0`,
        budget: "party.seated",
      },
      {
        id: "elites",
        label: "Elite or Adversary",
        cost: `${CLASS} == "elite" || ${CLASS} == "adversary" ? ctx.count : 0`,
        budget: "1",
      },
      {
        id: "enemies",
        label: "Enemies tracked",
        cost: `ctx.mob && ctx.count >= ${MOB_MIN} ? 1 : ctx.count`,
        budget: "10",
      },
    ],
    switches: [{ id: "fortified", label: "Fortified position", by: "ctx.budget * 2" }],
  },
};

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
    sustaining,
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
    version: "0.1.10",
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
          SUSTAIN_DN,
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
          sustaining,
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
          SUSTAIN_DN,
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
      {
        // A printed Mutation, or a row of a Mutation's own d6 table (pp.287-295), which an Agent holds by key. Its
        // effects are its mods; its summary says what the GM adds by hand (a weapon, gear, a Keyword).
        id: "mutation",
        label: "Mutation",
        base: "ability",
        fields: {
          severity: { type: "enum", label: "Severity", values: [...SEVERITIES], cite: "Core p.287" },
          summary: { type: "text", label: "Summary", maxLength: 200 },
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
      {
        // A Champion's own Ruin, seeded from its stat block when it joins (combatant.personalRuin, p.325).
        id: "personalRuin",
        label: "Personal Ruin",
        scope: "entity",
        entities: ["threat"],
        start: "has(stat.personalRuin) ? stat.personalRuin : 0",
        cite: "Core p.323, p.325",
      },
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
        target: `ctx.dn + ${WOUNDED} + ${SUSTAIN}`,
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
        target: `ctx.dn + ${WOUNDED} + ${SUSTAIN}`,
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
        target: `ctx.dn + ${WOUNDED} + ${SUSTAIN}`,
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
        target: `ctx.dn + derived.corruptionMod + (${holds(BLIGHTED_SOUL)} ? 1 : 0) + ${WOUNDED} + ${SUSTAIN}`,
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
      // How a spend ask differs from this repo's (rules-flow §11.189).
      {
        id: "spendAsks",
        text: "A player may have 3 asks pending, counted per player, one per spend and Agent; an ask is shown to whoever sees the pool it costs. Asks clear when a session starts or ends.",
        cite: "Core p.162, p.164, p.165",
      },
      // What the items and requisition cannot say (rules-flow §11.190).
      {
        id: "upgradeLimitsByHand",
        text: "Distinction counts toward an item's three upgrades, a support system takes its slot, and an upgrade's own copy limit (3 Chains, Blades and Hooks) is the GM's.",
        cite: "Core p.228",
      },
      {
        id: "upgradeHostByHand",
        text: "Which weapons or armour an upgrade may be fitted to (a sight to a ranged weapon, say) is the GM's: the app fits any upgrade to any weapon or armour. The Anti-Gravitic Suspensor Crystal takes its weapon slot on armour too.",
        cite: "Core pp.227-228",
      },
      {
        id: "requisitionByHand",
        text: "A requisition's Complication costs 1 Wealth, which the GM takes by hand; acquired ammunition is a counted item beside the seven ammo counters.",
        cite: "Core p.205, p.229",
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
      // What the lookups and the Mutations cannot say (rules-flow §11.191).
      {
        id: "mortalAsWounds",
        text: "A table's Mortal Wounds are applied as Wounds: they ignore Resilience, and a table's Wounds are counted after it.",
        cite: "Core p.193",
      },
      {
        id: "tableDiceTyped",
        text: "A row's dice (1d3, 1d6+1 and the like) are rolled at the table and their total typed into the table's input before APPLY.",
        cite: "Core p.198, p.264",
      },
      {
        id: "gloryWithinPool",
        text: "The Glory stepper of a Critical Hit goes to 10: the GM spends no more than the pool holds.",
        cite: "Core p.197",
      },
      {
        id: "perilsThreatCorruption",
        text: "A Threat carries no Corruption: on Perils of the Warp the GM leaves the Corruption dice at 0 for one.",
        cite: "Core p.264",
      },
      {
        id: "mutationVariantAgain",
        text: "Landing again on Visions, Extra Appendages or Aberration with another d6 result grants the second one; the book says roll again, which the GM does.",
        cite: "Core p.287",
      },
      {
        id: "mutationGrantsByHand",
        text: "A Mutation's weapon, gear or Keyword (Horn, Spike or Claw; Corrosive Bile; Aquatic's apparatus; Wyrdling's PSYKER) is the GM's to add: a held record moves numbers only. Its summary says so.",
        cite: "Core pp.288-295",
      },
      {
        id: "sustainHitByHand",
        text: "After a sustaining psyker takes damage, the Willpower Test (DN the Wounds and Shock taken plus 2 per power) is the GM's to call: a reminder has no moment after a hit.",
        cite: "Core p.265",
      },
      {
        id: "manifestWho",
        text: "Manifest is offered to an Agent with Psychic Mastery or the PSYKER Keyword, and to a Threat with either; a power on a ledger sheet alone does not open it.",
        cite: "Core p.259",
      },
      // What spawning cannot say (rules-flow §11.192).
      {
        id: "scaleBySeated",
        text: "Scaling Threats counts the Agents whose players hold a seat, where this app counted the Agents in the fight.",
        cite: "Core p.326",
      },
      {
        id: "monstrousBudgetUncounted",
        text: "The encounter budget has no line for Monstrous Creatures: the book names a target for Troops, Mobs, Elites and Adversaries only.",
        cite: "Threat Assessment p.8",
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
          { id: "mutations", label: "Mutations", show: [{ widget: "held" }] },
          { id: "who", label: "Who you are", show: DETAIL.map(([id]) => `detail.${id}`) },
        ],
      },
    },
    codex: CODEX,
    // Critical Hits, Perils of the Warp and the Mutation tables, the book's rows as lookups (tables.ts; the owner's
    // decision 1 of 2026-11-26, rules-flow §11.191).
    tables: bookTables(),
    // The Mutations an Agent holds, by key: their mods move its numbers, and other players read "Unseen" in place of the
    // name (state.ts; Core pp.287-295). Granted by a Mutation table's line.
    held: {
      mutations: {
        label: "Mutations",
        entry: "mutation",
        field: "mutations",
        entities: ["agent"],
        unseen: "Unseen",
        max: MAX_MUTATIONS,
        cite: "Core pp.287-295",
      },
    },
    spawn: SPAWN,
    spends: spends({ ledger: false }),
    // Three pending asks at once (MAX_PENDING_SPENDS), counted per user on the platform (rules-flow §11.189).
    requests: { max: MAX_PENDING_SPENDS },
  };
  if (builder !== "ledger") return ruleset;

  const params = buildParams();
  return {
    ...ruleset,
    version: "0.2.10",
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
    spends: spends({ ledger: true }),
    // ponytail: the budget's cost is compiled over every actor type the creation steps do not build, so the ledger's
    // Agent (built by `build`, not `creation`) is read as spawned and has no class; the budget comes back once the
    // platform leaves `build.actor` out of it.
    spawn: { options: SPAWN.options, adjust: SPAWN.adjust },
    decisions: [
      ...ruleset.decisions,
      {
        id: "budgetByHand",
        text: "The encounter budget is the GM's in this ruleset: two Troops per Agent, half in Mobs, one Elite or Adversary, at most 10 enemies, doubled in a fortified position.",
        cite: "Threat Assessment p.8",
      },
    ],
    tests: { ...ruleset.tests, requisition: requisition() },
    // GIVE reads the codex item's catalogue entry; an item with none is given as gear by its name (p.205, §11.112).
    items: { kinds: ITEM_KINDS, give: { ref: "wargear", loose: "gear" }, acquire: ACQUIRE },
    codex: {
      kinds: {
        ...CODEX.kinds,
        item: {
          fields: {
            ...CODEX.kinds.item.fields,
            // The catalogue entry it is (`wargearId`), which GIVE puts on the sheet (rules-flow §11.112).
            wargear: { type: "ref", label: "Catalogue entry", entity: "wargear", visibility: "gm" },
          },
        },
      },
    },
    // The quick picks of what an Agent sustains are the psychic powers the packs serve (house decision #91).
    entities: [
      ...ruleset.entities.map((e) =>
        e.id === "agent"
          ? { ...e, fields: { ...e.fields, sustaining: { ...sustaining, picks: { entity: "power" } } } }
          : e,
      ),
      ...catalogueEntities(params),
    ],
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
