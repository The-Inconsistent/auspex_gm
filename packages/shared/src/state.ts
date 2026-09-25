import { z } from "zod";
import { RequisitionSlot } from "./requisition.ts";
import { Threat, ThreatClass, Weapon } from "./threat.ts";

// Page refs: docs/rules-flow.md (Core rulebook, printed pages).

export const TIERS = [1, 2, 3, 4, 5] as const; // the campaign Tiers that Tier accepts
export const Tier = z.number().int().min(1).max(5);
export const Role = z.enum(["gm", "player"]);
export type Role = z.infer<typeof Role>;

// Who the caller is at one table (GET /api/campaigns/:id/me). userId is the Clerk user; null for a guest (QR token).
export const Me = z.object({
  campaignId: z.string(),
  role: Role,
  characterId: z.string().nullable(),
  userId: z.string().nullable(),
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

export const ATTRIBUTES = ["S", "T", "A", "I", "Wil", "Int", "Fel"] as const;
export type Attribute = (typeof ATTRIBUTES)[number];

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
  })
  .partial();

// The Ammo table, Core p.229. Special rounds (Kraken Bolt, Dragonfire Bolt…) are typed in by name.
export const AMMO_TYPES = ["Projectile", "Las", "Flame", "Bolt", "Plasma", "Melta", "Shuriken"] as const;
export const MAX_AMMO_TYPES = 12;

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
    })
    .default({ name: "", ar: 0, invulnerable: false, powered: 0, traits: [] }),
  speed: z.number().int().min(0).max(20).default(6), // by Species (p.29)
  mods: Mods.default({}),
  abilities: z.array(rule).max(30).default([]), // archetype, species, chapter traits
  talents: z.array(rule).max(30).default([]),
  weapons: z
    .array(Weapon.extend({ addStrength: z.boolean().default(false) }))
    .max(20)
    .default([]), // melee "S+X"
  gear: z.array(z.string().max(200)).max(60).default([]),
  // Live counters, changed by `character.supply`. Wealth starts at Tier (p.206). Ammo counts per type, because each
  // type only reloads its own weapons (p.229), e.g. { "Bolt": 2, "Kraken Bolt": 1 }.
  wealth: z.number().int().min(0).default(0),
  ammo: z
    .record(z.string().min(1).max(60), z.number().int().min(0).max(99))
    .refine((a) => Object.keys(a).length <= MAX_AMMO_TYPES, `At most ${MAX_AMMO_TYPES} ammo types`)
    .default({}),
  // The session id of the last requisition Test per slot: one of each per session (p.205).
  requisitioned: z.partialRecord(RequisitionSlot, z.string()).default({}),
});
export type CharacterStats = z.infer<typeof CharacterStats>;

// GM overrides win over everything derived.
export const Overrides = Mods.partial();
export type Overrides = z.infer<typeof Overrides>;

// −1 on an empty type removes it from the list; otherwise clamped at 0.
export function adjustAmmo(ammo: Record<string, number>, { kind, delta }: { kind: string; delta: number }) {
  const have = ammo[kind] ?? 0;
  if (have === 0 && delta < 0) return Object.fromEntries(Object.entries(ammo).filter(([k]) => k !== kind));
  return { ...ammo, [kind]: Math.max(0, have + delta) };
}

export const skillTotal = (s: CharacterStats, skill: Skill) => (s.skills[skill] ?? 0) + s.attributes[SKILLS[skill]];
export const effectiveStrength = (s: CharacterStats) => s.attributes.S + s.armour.powered; // Powered (X), p.232

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
    passiveAwareness: Math.max(1, Math.ceil(skillTotal(s, "Awareness") / 2)),
    maxTraumatic: tier + 1,
  };
}
export type DerivedStats = ReturnType<typeof deriveStats>;

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
  conditions: z.array(z.string()),
  // The creation choices `stats` was derived from (a CharacterBuild, build.ts), or null for a hand-made sheet. Loose
  // here because build.ts imports this file; the builder parses it with CharacterBuild.
  build: z.record(z.string(), z.unknown()).nullable(),
});
export type Character = z.infer<typeof Character>;

const turnFields = { acted: z.boolean(), ambushed: z.boolean() };

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
  revealed: z.boolean(),
  stats: Threat.nullable(), // null in the player view until revealed
});
export type ThreatCombatant = z.infer<typeof ThreatCombatant>;

export const Combatant = z.discriminatedUnion("kind", [PcCombatant, ThreatCombatant]);
export type Combatant = z.infer<typeof Combatant>;
export const sideOfKind = (kind: CombatantKind): Side => (kind === "pc" ? "agents" : "threats");
export const sideOf = (c: Combatant): Side => sideOfKind(c.kind);

export const LiveState = z.object({
  campaign: z.object({
    id: z.string(),
    name: z.string(),
    tier: Tier,
    glory: z.number().int(),
    ruin: z.number().int(),
    framework: z.string(),
    patron: z.string(),
    homebrew: z.boolean(), // the character builder may use the homebrew books (issue #9 decision 1)
  }),
  characters: z.array(Character),
  encounter: z
    .object({
      id: z.string(),
      round: z.number().int(),
      currentId: z.string().nullable(), // combatant taking its turn
      lastSide: Side.nullable(), // side that acted last; null at the start of a Round
      seizedSide: Side.nullable(), // side that Seized; it can't Seize again until the other side acts
      combatants: z.array(Combatant),
    })
    .nullable(),
  access: z.object({ members: z.array(Member), invites: z.array(Invite) }),
});
export type LiveState = z.infer<typeof LiveState>;
export type Encounter = NonNullable<LiveState["encounter"]>;

// Slain threats and Dead characters are out of the fight: they take no Turns and don't hold up the Round
// (p.176, p.193, p.324). An Adversary over max Wounds stays in until the GM removes it (Dying or dead is their call).
export function isOut(s: LiveState, c: Combatant): boolean {
  if (c.kind === "threat") return threatStatus(c).includes("Slain");
  const ch = s.characters.find((x) => x.id === c.characterId);
  return ch
    ? pcStatus(ch, deriveStats({ stats: ch.stats, overrides: ch.overrides, tier: s.campaign.tier })).includes("Dead")
    : false;
}

// Whether c can take a Turn now. Ambushed characters get no Turn in Round 1 (p.177).
export function canAct(s: LiveState, c: Combatant): boolean {
  const e = s.encounter;
  return !!e && !c.acted && c.id !== e.currentId && !(c.ambushed && e.round === 1) && !isOut(s, c);
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
  if (!e || e.seizedSide === side || sideUpNext(s) === side) return false;
  return e.lastSide === null ? side === "threats" : e.lastSide === side;
}

// Automatic states from damage (pp.193-196, p.324).
export function pcStatus(c: Character, d: DerivedStats): string[] {
  const out: string[] = [];
  if (c.annihilated || c.traumatic > d.maxTraumatic) out.push("Dead");
  else if (c.wounds > d.maxWounds) out.push("Dying");
  else if (c.wounds > 0) out.push("Wounded");
  if (c.shock > d.maxShock) out.push("Exhausted");
  return out;
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
  // Annihilation (p.194): more than double Max Wounds from one attack, counted after Resilience (§11.7). Dead is dead.
  if (w > 2 * d.maxWounds)
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

// Players see who's at the table but not the GM's invite links (each one is a way in).
export const toPlayerView = (s: LiveState): LiveState => ({
  ...s,
  access: { members: s.access.members, invites: [] },
  encounter: s.encounter && {
    ...s.encounter,
    // Unrevealed: bars, label and Conditions only. The threat id would name the stat block, and personal Ruin is
    // the GM's.
    combatants: s.encounter.combatants.map((c) =>
      c.kind === "threat" && !c.revealed ? { ...c, stats: null, threatId: "", personalRuin: 0 } : c,
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

// Reminders when a Round ends: each Mob with half or more slain tests Resolve (p.325).
export const roundEndReminders = (e: Encounter): string[] =>
  e.combatants.flatMap((c) =>
    c.kind === "threat" && halfSlain(c)
      ? [
          `${c.label}: half slain, DN 3 Resolve Test; fail = the Mob flees as if in Terror, a Complication slays 1d3 more (p.325)`,
        ]
      : [],
  );
