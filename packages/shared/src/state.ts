import { z } from "zod";
import { CHAOS_SPAWN_AT, ENDURING_LIFE, corruptionLevel, hasMutation } from "./corruption.ts";
import { MAX_ICONS } from "./dn.ts";
import { RequisitionSlot } from "./requisition.ts";
import { SpendRequest } from "./spend.ts";
import { Threat, ThreatClass, Weapon } from "./threat.ts";
import { WargearFilter, WeaponMod } from "./weapon-effect.ts";

// Page refs: docs/rules-flow.md (Core rulebook, printed pages).

export const TIERS = [1, 2, 3, 4, 5] as const; // the campaign Tiers that Tier accepts
export const Tier = z.number().int().min(1).max(5);
// "screen" is only ever a guest token (the table TV, read-only), never a membership.
export const Role = z.enum(["gm", "player", "screen"]);
export type Role = z.infer<typeof Role>;

// Who the caller is at one table (GET /api/campaigns/:id/me). userId is the Clerk user; null for a guest (QR token).
export const Me = z.object({
  campaignId: z.string(),
  role: Role,
  characterId: z.string().nullable(),
  userId: z.string().nullable(),
  admin: z.boolean(), // a Clerk admin acting as GM without a seat (docs/architecture.md, "Access")
});
export type Me = z.infer<typeof Me>;

// Signed-in people at a table, and the GM's open invite links (docs/backend.md, "Access").
export const InviteMode = z.enum(["room", "character"]); // room: players claim a character; character: one character
export type InviteMode = z.infer<typeof InviteMode>;
export const Member = z.object({
  userId: z.string(),
  name: z.string(),
  role: Role,
  characterId: z.string().nullable(),
});
export type Member = z.infer<typeof Member>;
export const Invite = z.object({
  id: z.string(),
  mode: InviteMode,
  characterId: z.string().nullable(),
  allowGuests: z.boolean(),
  expiresAt: z.string(),
  uses: z.number().int(),
  maxUses: z.number().int().nullable(),
});
export type Invite = z.infer<typeof Invite>;

export const Side = z.enum(["agents", "threats"]);
export type Side = z.infer<typeof Side>;

export const Pool = z.enum(["glory", "ruin"]);
export type Pool = z.infer<typeof Pool>;

export const CombatantKind = z.enum(["pc", "threat"]);
export type CombatantKind = z.infer<typeof CombatantKind>;

// Colour of the tag/base on the physical mini, so the screen maps to the table.
export const Marker = z.enum(["red", "amber", "green", "blue", "purple", "white"]);
export type Marker = z.infer<typeof Marker>;

// What the players' phones show of a Threat, most hidden first: nothing (its mini isn't on the table yet, §11.56),
// its bars, or its stat block too.
export const Visibility = z.enum(["hidden", "bars", "stats"]);
export type Visibility = z.infer<typeof Visibility>;

export const ATTRIBUTES = ["S", "T", "A", "I", "Wil", "Int", "Fel"] as const;
export type Attribute = (typeof ATTRIBUTES)[number];
export const ATTRIBUTE_NAMES: Record<Attribute, string> = {
  S: "Strength",
  T: "Toughness",
  A: "Agility",
  I: "Initiative",
  Wil: "Willpower",
  Int: "Intellect",
  Fel: "Fellowship",
};

// Skill → linked Attribute, as printed on the character sheet (p.372).
export const SKILLS = {
  Athletics: "S",
  Awareness: "Int",
  "Ballistic Skill": "A",
  Cunning: "Fel",
  Deception: "Fel",
  Insight: "Fel",
  Intimidation: "Wil",
  Investigation: "Int",
  Leadership: "Wil",
  Medicae: "Int",
  Persuasion: "Fel",
  Pilot: "A",
  "Psychic Mastery": "Wil",
  Scholar: "Int",
  Stealth: "A",
  Survival: "Wil",
  Tech: "Int",
  "Weapon Skill": "I",
} as const satisfies Record<string, Attribute>;
export type Skill = keyof typeof SKILLS;
// The Skills "most commonly used to supplement roleplaying" in a social encounter (Core p.167).
export const SOCIAL_SKILLS: readonly Skill[] = [
  "Cunning",
  "Deception",
  "Insight",
  "Intimidation",
  "Leadership",
  "Persuasion",
];

const attr = z.number().int().min(1).max(12);
const rule = z.object({ name: z.string().max(100), text: z.string().max(2000), page: z.string().max(40).optional() });

// Additive modifiers from species, talents, archetypes (e.g. Primaris +3 Wounds, Honour the Chapter +1 Resolve).
export const Mods = z
  .object({
    maxWounds: z.number().int(),
    maxShock: z.number().int(),
    defence: z.number().int(),
    resilience: z.number().int(),
    resolve: z.number().int(),
    conviction: z.number().int(),
    influence: z.number().int(),
    speed: z.number().int(),
    determination: z.number().int(),
    passiveAwareness: z.number().int(), // Ever Vigilant (Core p.133), a Background row (Apocrypha p.43)
    maxTraumatic: z.number().int(), // Traumatic Injuries taken before dying: Ded 'Ard! (Apocrypha p.235)
  })
  .partial();

const SheetWeapon = Weapon.extend({ addStrength: z.boolean().default(false) });

// A psychic power's profile as printed (Core pp.259–260), for the phone's Turn: what it costs to manifest. The effect
// stays in `abilities` (one line each).
export const SheetPower = z.object({
  name: z.string().max(100),
  page: z.string().max(40),
  dn: z.union([z.number().int().positive(), z.string().max(60)]), // "Target's Defence" kept as printed
  activation: z.string().max(60),
  duration: z.string().max(60),
  range: z.string().max(60),
  potency: z.array(z.string().max(500)).max(10).default([]), // Dominate's second line runs 414 characters (Apocrypha p.289)
});
export type SheetPower = z.infer<typeof SheetPower>;

// What a mutation always changes on the sheet, as printed ("–1 Toughness", "reduces your Max Shock by 1"; Core
// pp.288–295). Situational bonus dice and DN penalties stay in the mutation's text for the table.
export const MutationMods = z.object({
  attributes: z.partialRecord(z.enum(ATTRIBUTES), z.number().int().min(-5).max(5)).default({}),
  skills: z
    .partialRecord(z.enum(Object.keys(SKILLS) as [Skill, ...Skill[]]), z.number().int().min(-5).max(5))
    .default({}),
  traits: Mods.default({}),
});
export type MutationMods = z.infer<typeof MutationMods>;

// A mutation on the sheet (character.mutate): snapshotted from the book data like a Threat joining a fight, so a later
// data fix doesn't change an Agent. A d6 table's row (Extra Appendage: Strong Arm) is folded into its line.
export const SheetMutation = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/), // the book row's, so a duplicate is refused (p.287)
  name: z.string().min(1).max(200),
  page: z.number().int().positive(),
  effect: z.string().max(6000).default(""),
  mods: MutationMods,
  weapons: z.array(SheetWeapon).max(4).default([]), // Horn, Spike or Claw; Corrosive Bile
});
export type SheetMutation = z.infer<typeof SheetMutation>;
export const MAX_MUTATIONS = 20;

// The Ammo table, Core p.229. Special rounds (Kraken Bolt, Dragonfire Bolt…) are typed in by name.
export const AMMO_TYPES = ["Projectile", "Las", "Flame", "Bolt", "Plasma", "Melta", "Shuriken"] as const;
export const MAX_AMMO_TYPES = 12;

// A weapon effect as the build resolved it: the record it comes from, and which weapons it reaches. The build turns a
// Talent's chosen weapon (Trademark Weapon) and a record's granted one (the Doctrines) into catalogue ids or names.
export const SheetWeaponEffect = z.object({
  source: z.string().min(1).max(100), // "Bolter Discipline"
  cite: z.string().max(40).optional(), // "VoA p.45"
  fits: WargearFilter.extend({
    wargearIds: z.array(z.string().min(1)).max(10).optional(), // only these catalogue entries
    names: z.array(z.string().min(1).max(100)).max(10).optional(), // only weapons with these names on the sheet
  }),
  mods: z.array(WeaponMod).min(1).max(10),
});
export type SheetWeaponEffect = z.infer<typeof SheetWeaponEffect>;

export const CharacterStats = z.object({
  species: z.string().max(60).default(""),
  archetype: z.string().max(100).default(""),
  keywords: z.array(z.string().max(60)).max(20).default([]),
  attributes: z
    .object({ S: attr, T: attr, A: attr, I: attr, Wil: attr, Int: attr, Fel: attr })
    .default({ S: 1, T: 1, A: 1, I: 1, Wil: 1, Int: 1, Fel: 1 }),
  skills: z
    .partialRecord(z.enum(Object.keys(SKILLS) as [Skill, ...Skill[]]), z.number().int().min(0).max(8))
    .default({}),
  armour: z
    .object({
      name: z.string().max(100),
      ar: z.number().int().min(0).max(20),
      invulnerable: z.boolean().default(false),
      powered: z.number().int().min(0).max(10).default(0),
      traits: z.array(z.string().max(60)).default([]),
      // Upgrades, exactly as a weapon carries them (Core pp.227–228, §11.63–§11.65): what is stored is the suit as
      // printed plus the ids, and `withUpgrades` derives the AR and Traits shown, so nothing is applied twice.
      wargearId: z.string().optional(),
      upgrades: z.array(z.string()).max(8).optional(), // from the build
      fitted: z.array(z.string()).max(8).optional(), // fitted in play (character.fitUpgrade)
      upgradeNames: z.array(z.string()).optional(), // derived by withUpgrades, never stored
      notes: z.array(z.string()).optional(), // derived: what a profile can't hold, for the GM
    })
    .default({ name: "", ar: 0, invulnerable: false, powered: 0, traits: [] }),
  speed: z.number().int().min(0).max(20).default(6), // by Species (p.29)
  mods: Mods.default({}),
  abilities: z.array(rule).max(30).default([]), // archetype, species, chapter traits
  talents: z.array(rule).max(30).default([]),
  weapons: z.array(SheetWeapon).max(20).default([]), // melee "S+X"
  powers: z.array(SheetPower).max(30).optional(), // from the build; absent on a hand-made sheet or one saved before
  gear: z.array(z.string().max(200)).max(60).default([]),
  // The standing weapon effects the build gives (rules-flow.md §11.68), applied when the sheet is read
  // (`withWeaponEffects`), because their Rank amounts follow the XP earned. Absent on a hand-made sheet.
  weaponEffects: z.array(SheetWeaponEffect).max(60).optional(),
  // Live counters, changed by `character.supply`. Wealth starts at Tier (p.206). Ammo counts per type, because each
  // type only reloads its own weapons (p.229), e.g. { "Bolt": 2, "Kraken Bolt": 1 }.
  wealth: z.number().int().min(0).default(0),
  // Corruption points (Core p.286), changed by `character.corrupt`; the level and its Test modifier are `corruptionLevel`.
  corruption: z.number().int().min(0).default(0),
  // Mutations held (Core pp.287–295), GM only like Corruption; their mods reach the sheet through `withMutations`.
  mutations: z.array(SheetMutation).max(MAX_MUTATIONS).default([]),
  ammo: z
    .record(z.string().min(1).max(60), z.number().int().min(0).max(99))
    .refine((a) => Object.keys(a).length <= MAX_AMMO_TYPES, `At most ${MAX_AMMO_TYPES} ammo types`)
    .default({}),
  // The session id of the last requisition Test per slot: one of each per session (p.205).
  requisitioned: z.partialRecord(RequisitionSlot, z.string()).default({}),
});
export type CharacterStats = z.infer<typeof CharacterStats>;

// GM overrides win over everything derived. Passive Awareness and the Traumatic limit take a GM bonus, not an override.
export const Overrides = Mods.omit({ passiveAwareness: true, maxTraumatic: true });
export type Overrides = z.infer<typeof Overrides>;

// −1 on an empty type removes it from the list; otherwise clamped at 0.
export function adjustAmmo(ammo: Record<string, number>, { kind, delta }: { kind: string; delta: number }) {
  const have = ammo[kind] ?? 0;
  if (have === 0 && delta < 0) return Object.fromEntries(Object.entries(ammo).filter(([k]) => k !== kind));
  return { ...ammo, [kind]: Math.max(0, have + delta) };
}

// The sheet with its mutations' mods added (Core pp.288–295). Added when read, never stored, so cutting off a mutated
// part (p.287) or a rebuild has nothing to undo.
export function withMutations(s: CharacterStats): CharacterStats {
  if (!s.mutations.length) return s;
  const attributes = { ...s.attributes };
  const skills = { ...s.skills };
  const mods = { ...s.mods };
  for (const { mods: m } of s.mutations) {
    for (const [k, v] of Object.entries(m.attributes) as [Attribute, number][]) attributes[k] += v;
    for (const [k, v] of Object.entries(m.skills) as [Skill, number][]) skills[k] = (skills[k] ?? 0) + v;
    for (const [k, v] of Object.entries(m.traits) as [keyof z.infer<typeof Mods>, number][])
      mods[k] = (mods[k] ?? 0) + v;
  }
  return { ...s, attributes, skills, mods };
}

// Each Attribute's TOTAL, the sheet's Rating + Bonus (Core p.40): mutations, and Powered (X) armour's Strength bonus
// (p.232). Skills and Attribute Tests roll the total (rules-flow.md §11.160); the Traits keep the rating (no Trait reads S).
export function attributeTotals(s: CharacterStats): Record<Attribute, number> {
  const a = withMutations(s).attributes;
  return { ...a, S: a.S + s.armour.powered };
}

const rawSkillTotal = (s: CharacterStats, skill: Skill) => (s.skills[skill] ?? 0) + s.attributes[SKILLS[skill]];
// Skill Rating + the linked Attribute's TOTAL (p.40).
export const skillTotal = (s: CharacterStats, skill: Skill) =>
  (withMutations(s).skills[skill] ?? 0) + attributeTotals(s)[SKILLS[skill]];
export const effectiveStrength = (s: CharacterStats) => attributeTotals(s).S;

// Traits, pp.36-37 and the sheet (p.372). All Traits have a minimum of 1 (p.36).
export function deriveStats({
  stats: s,
  overrides: o,
  tier,
}: {
  stats: CharacterStats;
  overrides: Overrides;
  tier: number;
}) {
  s = withMutations(s);
  const a = s.attributes,
    m = s.mods;
  const base = {
    maxWounds: a.T + 2 * tier + (m.maxWounds ?? 0),
    maxShock: a.Wil + tier + (m.maxShock ?? 0),
    defence: a.I - 1 + (m.defence ?? 0),
    resilience: a.T + 1 + s.armour.ar + (m.resilience ?? 0),
    resolve: a.Wil - 1 + (m.resolve ?? 0),
    conviction: a.Wil + (m.conviction ?? 0),
    influence: a.Fel - 1 + (m.influence ?? 0),
    speed: s.speed + (m.speed ?? 0),
    determination: a.T + (m.determination ?? 0), // Background bonuses can raise it (p.72)
  };
  const out = Object.fromEntries(
    Object.entries(base).map(([k, v]) => [k, Math.max(1, o[k as keyof Overrides] ?? v)]),
  ) as typeof base;
  return {
    ...out,
    passiveAwareness: Math.max(1, Math.ceil(rawSkillTotal(s, "Awareness") / 2) + (m.passiveAwareness ?? 0)),
    maxTraumatic: tier + 1 + (m.maxTraumatic ?? 0),
  };
}
export type DerivedStats = ReturnType<typeof deriveStats>;

// Who the character is, written by the player: Adding Detail (Core pp.32–36). Appearance (pp.32–33), then the Ten
// Questions, split as the book splits them: Your Past (1–5, pp.34–35) and Your Personality (6–10, pp.35–36).
const detailText = z.string().max(4000).default("");
// portrait: a slug the web maps to a bundled image (apps/web/lib/portraits); an unknown one shows none.
export const CharacterDetail = z.object({
  appearance: detailText,
  past: detailText,
  personality: detailText,
  portrait: z.string().max(64).default(""),
});
export type CharacterDetail = z.infer<typeof CharacterDetail>;

// The GM's private notes to one Agent (docs/campaign-model.md): only that character's player sees them.
export const MAX_OBJECTIVES = 20;
export const Objective = z.object({
  text: z.string().trim().min(1).max(500),
  done: z.boolean().default(false),
  // The session's Objective, rolled on the Faction's table (Core p.43); END SESSION clears it (rules-flow.md §11.161).
  rolled: z.boolean().optional(),
  // Where the mission sits in STORY (§11.163): a whole adventure, or one scene of it (beatId with its adventureId).
  adventureId: z.uuid().nullable().optional(),
  beatId: z.uuid().nullable().optional(),
});
export type Objective = z.infer<typeof Objective>;
export const Objectives = z.array(Objective).max(MAX_OBJECTIVES);

// Glory: max(6, players + 2) (p.164). Ruin: 2 × players (p.320).
export const poolMax = (pool: Pool, players: number) =>
  pool === "glory" ? Math.max(6, players + 2) : Math.max(1, players * 2);

export const Character = z.object({
  id: z.string(),
  name: z.string(),
  stats: CharacterStats,
  overrides: Overrides,
  wounds: z.number().int(),
  shock: z.number().int(),
  wrath: z.number().int(),
  traumatic: z.number().int(), // Traumatic Injuries while Dying (p.193)
  annihilated: z.boolean(), // one hit over 2 × Max Wounds (p.194)
  xp: z.number().int(),
  // Advancement in play (§11.55): what the saved build spends of the XP earned, so `xp - xpSpent` is what's left.
  xpSpent: z.number().int(),
  // `xp` at the group's last Ascension, so 100 XP "in the current Tier" (Core p.147) is `xp - xpAtAscension`.
  xpAtAscension: z.number().int(),
  ascensionPackageWaived: z.boolean(), // the GM waived this Ascension's package (Core p.148 step 2)
  conditions: z.array(z.string()),
  detail: CharacterDetail,
  objectives: z.array(Objective), // blanked for every other player (toPlayerView)
  // The creation choices `stats` was derived from (a CharacterBuild, build.ts), or null for a hand-made sheet. Loose
  // here because build.ts imports this file; the builder parses it with CharacterBuild.
  build: z.record(z.string(), z.unknown()).nullable(),
  // A builder draft sent to the table (`character.draft`), waiting for the GM; cleared when a build is saved.
  draft: z.record(z.string(), z.unknown()).nullable(),
  builtAt: z.number().int().nullable(), // when the build was last saved (ms), so the builder drops older device drafts
  // Derived, not stored: the upgrades this character holds in gear and could fit to a weapon or to the suit they wear
  // (Core p.227, §11.63), so a phone can offer the choice without the 2 MB catalogue. `hosts` is what the entry fits, so
  // a suit's system isn't offered on a rifle; `gmOnly` keeps Matched Pair off a player's picker (§11.64). The server
  // checks the fit again when one is sent.
  ownedUpgrades: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        slot: z.string(),
        hosts: z.array(z.string()).default(["weapon"]),
        gmOnly: z.boolean().optional(),
      }),
    )
    .default([]),
});
export type Character = z.infer<typeof Character>;

// acted: had its Turn this Round. held: had it and held its action to use later in the Round (pp.177, 187); a held
// combatant counts as acted. ambushed: no Turn in Round 1 (p.177). manifested: activated its one psychic power this
// Round (Core p.259, rules-flow §8, §11.181).
const turnFields = { acted: z.boolean(), ambushed: z.boolean(), held: z.boolean(), manifested: z.boolean() };

export const PcCombatant = z.object({
  id: z.string(),
  kind: z.literal(CombatantKind.enum.pc),
  characterId: z.string(),
  ...turnFields,
});

export const ThreatCombatant = z.object({
  id: z.string(),
  kind: z.literal(CombatantKind.enum.threat),
  ...turnFields,
  threatId: z.string(),
  threatClass: ThreatClass,
  label: z.string(),
  marker: Marker.nullable(),
  mobCount: z.number().int().min(0).nullable(), // null = single Threat; every member has 1 Wound (p.325)
  mobStart: z.number().int().nullable(),
  wounds: z.number().int(),
  shock: z.number().int(),
  personalRuin: z.number().int(),
  maxWounds: z.number().int(), // always visible so players can draw wound bars
  maxShock: z.number().int().nullable(), // null = "–", never suffers Shock (p.324)
  conditions: z.array(z.string()),
  visibility: Visibility,
  stats: Threat.nullable(), // null in the player view until visibility is "stats"
  // An ally fights on the Agents' side (issue #350, rules-flow §11.208): the players pick it, Glory pays for it, it stays
  // out of the encounter budget and every phone sees its stat block. `controllerId` is the Agent whose player runs it,
  // null for the GM; `npcId` the Codex NPC it came from, whose FIGHTS AS the server checks on every change.
  ally: z.boolean(),
  controllerId: z.string().nullable(),
  npcId: z.string().nullable(),
});
export type ThreatCombatant = z.infer<typeof ThreatCombatant>;

export const Combatant = z.discriminatedUnion("kind", [PcCombatant, ThreatCombatant]);
export type Combatant = z.infer<typeof Combatant>;
export const sideOfKind = (kind: CombatantKind): Side => (kind === "pc" ? "agents" : "threats");
export const sideOf = (c: Combatant): Side => (c.kind === "threat" && c.ally ? "agents" : sideOfKind(c.kind));
// The ally rows a player runs (issue #350): their follower's Turn takes over that phone.
export const isRunBy = (c: Combatant, characterId: string | null): c is ThreatCombatant =>
  !!characterId && c.kind === "threat" && c.ally && c.controllerId === characterId;

// The kind of game the table wants and what it leaves out (Core p.316, rules-flow §11.79): short lines, players see them.
export const MAX_TABLE_LINES = 12;
export const MAX_TABLE_LINE = 60;
export const TableLines = z.array(z.string().trim().min(1).max(MAX_TABLE_LINE)).max(MAX_TABLE_LINES);
// A campaign's name: NEW CAMPAIGN gives it, SETUP › NAME renames it (issue #175).
export const CampaignName = z.string().trim().min(1).max(100);
// What the GM settles about the campaign itself (Core pp.18–19, 316): NEW CAMPAIGN sends it at creation, PARTY patches it.
export const CampaignSetup = z.object({
  framework: z.string().max(5000),
  frameworkBonus: z.string().max(1000),
  patron: z.string().max(200),
  kind: TableLines,
  limits: TableLines,
});

// The kinds of Test a scene plans or the GM calls (codex.ts TestKind, issue #39). Here so a live call can name one
// without state.ts importing codex.ts, which imports it.
export const TEST_KINDS = ["skill", "attribute", "opposed", "influence", "resolve", "corruption"] as const;

// A Test the GM calls at the table (issue #191): what it rolls and its DN, nothing of the GM's plan for it. The
// action checks it as a BeatTest; this is what is kept.
export const CalledTest = z.object({
  kind: z.enum(TEST_KINDS),
  skill: z.enum(Object.keys(SKILLS) as [Skill, ...Skill[]]).nullable(),
  attribute: z.enum(ATTRIBUTES).nullable(),
  dn: z.number().int().min(1).max(20).nullable(),
});
export type CalledTest = z.infer<typeof CalledTest>;

// One Agent's result, as their phone (or the GM) reported it. The dice stay on the table (rules-flow.md §7); a failed
// Corruption Test also brings its roll, for the gain the GM may then apply (Core p.286).
export const TestReport = z.object({
  passed: z.boolean(),
  icons: z.number().int().min(0).max(MAX_ICONS).optional(),
  complication: z.boolean().optional(),
  wrathCritical: z.boolean().optional(),
  spentWrath: z.boolean().optional(),
});
export type TestReport = z.infer<typeof TestReport>;

// The open call, one per campaign (rules-flow.md §11.143): who is asked, and what each reported. `fear` marks a Resolve
// Test against Fear (Core p.199), whose failure earns the GM 1 Ruin (p.320); `hideDn` keeps the DN off the phones.
export const TestCall = z.object({
  id: z.string(),
  test: CalledTest,
  fear: z.boolean(),
  hideDn: z.boolean(),
  who: z.array(z.string()).min(1),
  reports: z.record(z.string(), TestReport),
  createdAt: z.string(), // ISO
});
export type TestCall = z.infer<typeof TestCall>;

// A GM's private note to some Agents, for the role play (rules-flow.md §11.164), with each one's short reply. Session
// scoped: a session's start or end deletes them.
export const WhisperReply = z.object({ text: z.string(), at: z.string() }); // at: ISO
export const Whisper = z.object({
  id: z.string(),
  to: z.array(z.string()).min(1),
  text: z.string(),
  replies: z.record(z.string(), WhisperReply),
  createdAt: z.string(), // ISO
});
export type Whisper = z.infer<typeof Whisper>;

export const LiveState = z.object({
  campaign: z.object({
    id: z.string(),
    name: z.string(),
    tier: Tier,
    glory: z.number().int(),
    ruin: z.number().int(),
    framework: z.string(),
    frameworkBonus: z.string(),
    patron: z.string(),
    kind: z.array(z.string()),
    limits: z.array(z.string()),
    homebrew: z.boolean(), // the character builder may use the homebrew books (issue #9 decision 1)
    archived: z.boolean(), // read-only: every action but unarchive and delete is refused (campaign.archive)
    // When and where the table meets next (issue #197): set in PARTY › SESSION, shown on INTEL and the lobby card.
    nextSessionAt: z.string().nullable(), // ISO, UTC; session.start clears it
    nextSessionPlace: z.string(),
  }),
  characters: z.array(Character),
  encounter: z
    .object({
      id: z.string(),
      round: z.number().int(), // 0 = before Round 1: Determine Ambushes, Set the Scene (p.176, rules-flow §11.167)
      currentId: z.string().nullable(), // combatant taking its turn
      lastSide: Side.nullable(), // side that acted last; null at the start of a Round
      seizedSide: Side.nullable(), // side that Seized; it can't Seize again until the other side acts
      combatants: z.array(Combatant),
      // What TURN BACK would take back ("Aurelian Tarsus's Turn"); null when there's nothing to go back to. GM view only.
      back: z.string().nullable(),
      // Player view only: sideUpNext before hidden Threats are dropped, so a hidden Threat's Turn still shows as due.
      upNext: Side.nullable().optional(),
    })
    .nullable(),
  // Spends the players have asked for and the GM hasn't answered, oldest first (rules-flow.md §11.123). Every phone
  // sees them all: Glory is the party's pool and p.165 has the group agree on it.
  spendRequests: z.array(SpendRequest),
  // The Test the GM called and the results so far (issue #191). A phone gets it only if its Agent is asked, with only
  // its own result.
  testCall: TestCall.nullable(),
  // This session's whispers, newest first. A phone gets only those to its Agent, without the other recipients or their
  // replies.
  whispers: z.array(Whisper),
  // guests: characters a live guest QR token points at (no account, so not in members).
  access: z.object({ members: z.array(Member), invites: z.array(Invite), guests: z.array(z.string()) }),
});
export type LiveState = z.infer<typeof LiveState>;

// Agents in play: a signed-in player or a live guest QR holds them. The rest wait in reserve (PARTY), and only
// active Agents join a fight.
export const activeCharacterIds = (a: LiveState["access"]): Set<string> =>
  new Set([...a.members.flatMap((m) => (m.role === "player" && m.characterId ? [m.characterId] : [])), ...a.guests]);

// How many Agents a fight is sized for and scaled against: the active ones, which is what `beat.startEncounter` adds
// (`claimedCharacterIds` server-side), falling back to the whole roster before anyone holds a seat, so a budget of 0
// doesn't read OVER against the first threat placed (rules-flow §11.82, §11.106).
export const agentsInFight = (s: Pick<LiveState, "access" | "characters">): number =>
  activeCharacterIds(s.access).size || s.characters.length;
export type Encounter = NonNullable<LiveState["encounter"]>;

// Slain threats and Dead characters are out of the fight: they take no Turns and don't hold up the Round
// (p.176, p.193, p.324). An Adversary over max Wounds stays in until the GM removes it (Dying or dead is their call).
export function isOut(s: LiveState, c: Combatant): boolean {
  if (c.kind === "threat") return threatStatus(c).includes("Slain");
  const ch = s.characters.find((x) => x.id === c.characterId);
  return ch
    ? isGone(pcStatus(ch, deriveStats({ stats: ch.stats, overrides: ch.overrides, tier: s.campaign.tier })))
    : false;
}

// Whether c can take a Turn now. Ambushed characters get no Turn in Round 1 (p.177).
export function canAct(s: LiveState, c: Combatant): boolean {
  const e = s.encounter;
  return !!e && e.round > 0 && !c.acted && c.id !== e.currentId && !(c.ambushed && e.round === 1) && !isOut(s, c);
}

// Alternating Turns (p.176-177): after an Agent a Threat acts and vice versa; if the other side has no one left,
// the same side goes again. Each Round starts with the players choosing. null = no one left this Round.
export function sideUpNext(s: LiveState): Side | null {
  const e = s.encounter;
  if (!e) return null;
  const pending = (side: Side) => e.combatants.some((c) => canAct(s, c) && sideOf(c) === side);
  const preferred: Side = e.lastSide === "agents" ? "threats" : "agents";
  const other: Side = preferred === "agents" ? "threats" : "agents";
  return pending(preferred) ? preferred : pending(other) ? other : null;
}

// Seize the Initiative (p.176-177, p.320): the side that just acted pays 1 Glory/Ruin to act again, once per turn
// (it can't Seize again until the other side acts). At the start of a Round only the GM can Seize, to let a Threat
// go first. Never needed, so never allowed, when that side is up next anyway.
export function canSeize(s: LiveState, side: Side): boolean {
  const e = s.encounter;
  if (!e || e.round === 0 || e.seizedSide === side || sideUpNext(s) === side) return false; // Round 0: no Turns yet
  return e.lastSide === null ? side === "threats" : e.lastSide === side;
}

// A row's turn mark (rules-flow §11.168): what the GM taps to act on it. The order is a suggestion, so a READY row on
// the side that isn't up can still start (JUST GO or SEIZE).
export type TurnMark = "out" | "acting" | "ambushed" | "held" | "done" | "ready";
export function turnMark(s: LiveState, c: Combatant): TurnMark {
  const e = s.encounter;
  if (isOut(s, c)) return "out";
  if (e?.currentId === c.id) return "acting";
  if (c.ambushed && (e?.round ?? 0) <= 1 && !c.acted) return "ambushed";
  if (c.held) return "held";
  return c.acted ? "done" : "ready";
}

const immortal = (c: Character) => hasMutation(c.stats, ENDURING_LIFE);

// Automatic states from damage (pp.193-196, p.324).
export function pcStatus(c: Character, d: DerivedStats): string[] {
  const out: string[] = [];
  // Chaos Spawn: the character is lost and the GM takes it over (Core p.286). It needn't be Dead to be gone.
  if (corruptionLevel(c.stats.corruption).chaosSpawn) out.push("Lost");
  // Enduring Life: "You cannot die" (p.294, §11.185), so neither limit kills; Dying and Wounded read as they do.
  if (!immortal(c) && (c.annihilated || c.traumatic > d.maxTraumatic)) out.push("Dead");
  else if (c.wounds > d.maxWounds) out.push("Dying");
  else if (c.wounds > 0) out.push("Wounded");
  if (c.shock > d.maxShock) out.push("Exhausted");
  return out;
}

// Out of the game for good: Dead, or Lost to Chaos (p.286).
export const isGone = (status: string[]) => status.includes("Dead") || status.includes("Lost");

// The campaign's Tier can't go past the last one (Core p.20).
export const MAX_TIER = TIERS[TIERS.length - 1]!;
// Experience Ascension: 100 XP earned in the current Tier (Core pp.147–148). Milestone Ascension grants the same 100.
export const ASCENSION_XP = 100;

// Who the Ascension rules count (Core p.147, rules-flow.md §11.66): "every character in your group", which a Dead one
// has left (nothing removes its record, so it would hold the party back for ever). `short` is who of them hasn't
// earned ASCENSION_XP in this Tier, `award` XP from now (session.end asks before its award lands). The api refuses
// and PARTY offers from the same answer.
export function ascensionGroup(characters: Character[], tier: number, award = 0) {
  const group = characters.filter(
    (c) => !isGone(pcStatus(c, deriveStats({ stats: c.stats, overrides: c.overrides, tier }))),
  );
  return { group, short: group.filter((c) => c.xp + award - c.xpAtAscension < ASCENSION_XP) };
}

// Exhausted: over Max Shock, or the Condition from another source (p.199).
export const isExhausted = ({
  shock,
  maxShock,
  conditions,
}: {
  shock: number;
  maxShock: number | null;
  conditions: string[];
}) => (maxShock !== null && shock > maxShock) || conditions.includes("Exhausted");

// Shock suffered while Exhausted becomes Mortal Wounds (p.199), which ignore Resilience (p.193). The Shock that makes
// you Exhausted stays Shock (§11.12).
export function exhaustedShock({
  exhausted,
  wounds = 0,
  shock = 0,
}: {
  exhausted: boolean;
  wounds?: number;
  shock?: number;
}) {
  return exhausted && shock > 0 ? { wounds: wounds + shock, shock: 0 } : { wounds, shock };
}

// An Agent's counters after one hit (one tap is one attack, §11.11), pp.193-199. The api writes these; the tracker diffs
// them for its undo.
export function pcHit({ c, d, hit }: { c: Character; d: DerivedStats; hit: { wounds?: number; shock?: number } }) {
  const status = pcStatus(c, d);
  const { wounds: w, shock: s } = exhaustedShock({ exhausted: isExhausted({ ...c, maxShock: d.maxShock }), ...hit });
  // Annihilation (p.194): more than double Max Wounds from one attack, counted after Resilience (§11.7). Dead is dead,
  // unless the Agent cannot die (Enduring Life, p.294): then it is an ordinary hit, Dying at worst (§11.185).
  if (w > 2 * d.maxWounds && !immortal(c))
    return { wounds: c.wounds, shock: c.shock, traumatic: c.traumatic, prone: false, annihilated: true };
  const out = {
    wounds: c.wounds,
    shock: Math.max(0, c.shock + s),
    traumatic: c.traumatic,
    prone: false,
    annihilated: c.annihilated,
  };
  if (status.includes("Dying")) {
    if (w > 0)
      out.traumatic += 1; // a Wound while Dying is a Traumatic Injury instead, one per hit (p.193, §11.11)
    else if (w < 0) out.wounds = Math.max(0, Math.min(d.maxWounds, c.wounds + w)); // recovering any Wounds ends Dying (p.193)
  } else {
    out.wounds = Math.max(0, c.wounds + w);
    out.prone = c.wounds <= d.maxWounds && out.wounds > d.maxWounds; // becoming Dying: fall Prone (p.193)
  }
  return out;
}

// Half or more of a Mob slain: a DN 3 Resolve Test at the end of the Round (p.325).
const halfSlain = (c: ThreatCombatant) =>
  c.mobCount !== null && c.mobCount > 0 && c.mobStart !== null && c.mobCount * 2 <= c.mobStart;

export function threatStatus(c: ThreatCombatant): string[] {
  if (c.mobCount !== null) return c.mobCount === 0 ? ["Slain"] : halfSlain(c) ? ["Resolve DN 3 at Round end"] : [];
  const overShock = c.maxShock !== null && c.shock > c.maxShock;
  if (c.wounds > c.maxWounds) return [c.threatClass === "A" ? "Dying or dead (GM)" : "Slain"];
  if (overShock) return [c.threatClass === "T" ? "Slain" : "Exhausted"];
  return c.wounds > 0 ? ["Wounded"] : [];
}

// The player view's currentId while a hidden threat takes its Turn (§11.56).
export const UNSEEN_ID = "unseen";
// An ally is never hidden nor cut to bars: every phone sees its stat block (§11.208).
const isHidden = (c: Combatant) => c.kind === "threat" && !c.ally && c.visibility === "hidden";

// Another Agent's mutation as a phone gets it: what it does to the numbers, so its bars match the GM's, but not which
// mutation it is.
const unseen = (m: SheetMutation, i: number): SheetMutation => ({
  // Enduring Life keeps its id: the phone works out Dead from it (pcStatus), and would show an immortal Agent as Dead.
  id: m.id === ENDURING_LIFE ? m.id : `unseen-${i}`,
  name: "Unseen",
  page: 1,
  effect: "",
  mods: m.mods,
  weapons: [],
});

// One key of a record, or none.
const pick = <T>(r: Record<string, T>, key: string): Record<string, T> => (key in r ? { [key]: r[key]! } : {});

const lostAt = (points: number) => (corruptionLevel(points).chaosSpawn ? CHAOS_SPAWN_AT : 0);

// What one player's phone gets (null: a player without a character). Players see who's at the table but not the GM's
// invite links (each one is a way in), nor another Agent's objectives, Corruption or mutations, nor the GM's Ruin (docs/rules-flow.md
// §11.58).
export const toPlayerView = (s: LiveState, characterId: string | null): LiveState => ({
  ...s,
  campaign: { ...s.campaign, ruin: 0 },
  characters: s.characters.map((c) =>
    c.id === characterId
      ? // A mission's STORY link names adventures and scenes the phone may never be shown.
        { ...c, objectives: c.objectives.map(({ adventureId, beatId, ...o }) => o) }
      : {
          ...c,
          objectives: [],
          // The points stay the GM's; being Lost (p.286) is plain to the table, so it still shows.
          stats: { ...c.stats, corruption: lostAt(c.stats.corruption), mutations: c.stats.mutations.map(unseen) },
        },
  ),
  access: { members: s.access.members, invites: [], guests: [] },
  testCall:
    s.testCall && characterId && s.testCall.who.includes(characterId)
      ? {
          ...s.testCall,
          // HIDE DN keeps it off the wire, not only off the screen (§11.147).
          test: s.testCall.hideDn ? { ...s.testCall.test, dn: null } : s.testCall.test,
          reports: pick(s.testCall.reports, characterId),
        }
      : null,
  whispers: characterId
    ? s.whispers
        .filter((w) => w.to.includes(characterId))
        .map((w) => ({ ...w, to: [characterId], replies: pick(w.replies, characterId) }))
    : [],
  encounter: s.encounter && {
    ...s.encounter,
    back: null, // the GM's undo trail stays off the phones
    upNext: sideUpNext(s),
    // A hidden threat's real id would let players count them, and match it once it shows.
    currentId: s.encounter.combatants.some((c) => c.id === s.encounter?.currentId && isHidden(c))
      ? UNSEEN_ID
      : s.encounter.currentId,
    // Hidden: not sent at all, so the phones can't even count it. Bars: bars, label and Conditions only. The threat
    // id would name the stat block, and personal Ruin is the GM's.
    combatants: s.encounter.combatants
      .filter((c) => !isHidden(c))
      // A phone needs `npcId` only on an ally (its runner's Turn); on a Threat it would tie the row to a Codex NPC.
      .map((c) =>
        c.kind === "threat" && !c.ally
          ? c.visibility === "bars"
            ? { ...c, stats: null, threatId: "", personalRuin: 0, npcId: null }
            : { ...c, npcId: null }
          : c,
      ),
  },
});

// Conditions, pp.197-200.
export const CONDITIONS = [
  "Bleeding",
  "Blinded",
  "Exhausted",
  "Fear",
  "Frenzied",
  "Hindered",
  "On Fire",
  "Pinned",
  "Poisoned",
  "Prone",
  "Restrained",
  "Staggered",
  "Terror",
  "Vulnerable",
] as const;

// Reminders when a Turn starts/ends for a combatant with these Conditions (pp.198-200).
export const TURN_START_REMINDERS: Record<string, string> = {
  "On Fire": "On Fire: suffer 1d3 Mortal Wounds (put out: Action, go Prone + DN 3 Athletics)",
  Poisoned: "Poisoned: Toughness Test to shake it off",
  Frenzied: "Frenzied: DN 3 Willpower to resist",
};
export const TURN_END_REMINDERS: Record<string, string> = {
  Bleeding: "Bleeding: suffer 1 Mortal Wound per stack (DN 4 Toughness to stop)",
};

// Conditions that last "until the end of your next Turn" (Hindered p.199, Staggered and Vulnerable p.200), counted in the
// affected character's own Turns (§11.8). The api arms the ones held at the start of a Turn and removes them at its end.
// A stacked value such as "Hindered (2)" counts too.
export const TIMED_CONDITIONS = ["Hindered", "Staggered", "Vulnerable"] as const;
export const isTimed = (k: string) => TIMED_CONDITIONS.some((t) => k === t || k.startsWith(`${t} (`));

// Reminders when a Round ends: each Mob with half or more slain tests Resolve (p.325); unused held actions are lost (p.187);
// ambushed combatants act from Round 2 (p.177). `name` labels a combatant (the GM's tracker names Agents).
export const roundEndReminders = (
  e: Encounter,
  name: (c: Combatant) => string = (c) => (c.kind === "threat" ? c.label : ""),
): string[] => [
  ...e.combatants.flatMap((c) =>
    c.kind === "threat" && halfSlain(c)
      ? [
          `${c.label}: half slain, DN 3 Resolve Test; fail = the Mob flees as if in Terror, a Complication slays 1d3 more (p.325)`,
        ]
      : [],
  ),
  ...e.combatants.filter((c) => c.held).map((c) => `${name(c)}: the held action is lost (p.187)`),
  ...(e.round === 1
    ? e.combatants.filter((c) => c.ambushed).map((c) => `${name(c)}: no longer ambushed, acts in Round 2 (p.177)`)
    : []),
];
