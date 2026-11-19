// The Wrath & Glory ruleset for InconsisTable (its P3, stage 1: the rules a sheet, the pools and a called Test need).
// Built from this repo's own constants and rules data, so no number or page is retyped from memory. The output is
// private content: write it with `bun packages/data/port/write.ts <file>` and import it through InconsisTable's
// /library; never commit it to the InconsisTable repo (its ADR 0001).
//
// What the manifest cannot say yet is listed in InconsisTable's docs/p3-plan.md; here it is simply left out.
import {
  AMMO_TYPES,
  ATTRIBUTE_NAMES,
  ATTRIBUTES,
  CONDITIONS,
  corruptionLevel,
  CHAOS_SPAWN_AT,
  SKILLS,
  Threat,
  ThreatSize,
  TIMED_CONDITIONS,
  type Attribute,
  type Skill,
} from "@wg/shared";
import { rulesList } from "../index.ts";

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
const THREAT_STATES = [
  {
    id: "slain",
    label: "Slain",
    when: `(${OVER_WOUNDS} && ${CLASS} != "adversary") || (!(${OVER_WOUNDS}) && ${OVER_SHOCK} && ${CLASS} == "troop")`,
  },
  {
    id: "dyingOrDead",
    label: "Dying or dead (GM)",
    when: `${OVER_WOUNDS} && ${CLASS} == "adversary"`,
  },
  {
    id: "threatExhausted",
    label: "Exhausted",
    when: `!(${OVER_WOUNDS}) && ${OVER_SHOCK} && ${CLASS} != "troop"`,
  },
  { id: "threatWounded", label: "Wounded", when: `!(${OVER_WOUNDS}) && !${OVER_SHOCK} && res.wounds > 0` },
].map((s) => ({ ...s, entities: ["threat"] }));

// A Wounded Agent (any Wounds, so a Dying one too) has +1 DN on every Test (p.193). The app adds it to a called Test,
// which this repo left to the GM (callDn adds only the Corruption modifier); the GM ticks `ignoreWounded` on the call
// for a character it does not apply to, until an entry can carry such an effect itself.
const WOUNDED = "(has(res.wounds) && res.wounds > 0 && !ctx.ignoreWounded ? 1 : 0)";
const IGNORE_WOUNDED = { ignoreWounded: "bool" } as const;

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

export function buildRuleset() {
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
  };

  return {
    id: "wrath-and-glory",
    version: "0.1.0",
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
        // A Threat as its stat block prints it: the Traits are numbers, not formulas (p.323). A Mob is not ported yet.
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
        },
        derived: [
          { id: "maxWounds", label: "Max Wounds", expr: "stat.wounds", cite: "Core p.323" },
          { id: "maxShock", label: "Max Shock", expr: opt("stat.shock"), cite: "Core p.324" },
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
      // "Until the end of your next Turn" is counted in the holder's own Turns (rules-flow §11.8).
      duration: (TIMED_CONDITIONS as readonly string[]).includes(name) ? "ownTurnEnd" : "manual",
      ...party,
    })),
    tests: {
      skill: {
        kind: "poolSuccesses",
        ...POOL,
        entities: ["agent"],
        pool: "derived[ctx.skill]",
        target: `ctx.dn + ${WOUNDED}`,
        inputs: { skill: "text", dn: "int", bonus: "int", ...IGNORE_WOUNDED },
        inputOptions: { skill: skills.map(idOf) },
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
        cite: "Core pp.169-170",
      },
      corruption: {
        kind: "poolSuccesses",
        ...POOL,
        entities: ["agent"],
        pool: "derived.conviction",
        // The source's DN plus the modifier of the Agent's Corruption level (p.286).
        target: `ctx.dn + derived.corruptionMod + ${WOUNDED}`,
        inputs: { dn: "int", bonus: "int", ...IGNORE_WOUNDED },
        cite: "Core p.285",
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
      setup: { cite: "Core p.176" },
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
        { id: "dead", label: "Dead", when: `${opt("traumatic")} > derived.maxTraumatic`, entities: ["agent"] },
        { id: "dying", label: "Dying", when: "res.wounds > derived.maxWounds", entities: ["agent"] },
        { id: "wounded", label: "Wounded", when: "res.wounds > 0", entities: ["agent"] },
        { id: "exhausted", label: "Exhausted", when: "res.shock > derived.maxShock", entities: ["agent"] },
        ...THREAT_STATES,
      ],
      cite: "Core pp.193-196, p.324",
    },
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
        ],
      },
    },
  };
}
