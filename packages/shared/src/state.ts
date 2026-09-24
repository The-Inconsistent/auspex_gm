import { z } from "zod";
import { Threat, ThreatClass, Weapon } from "./threat.ts";

// Page refs: docs/rules-flow.md (Core rulebook, printed pages).

export const Tier = z.number().int().min(1).max(5);
export const Role = z.enum(["gm", "player"]);
export type Role = z.infer<typeof Role>;

export const Side = z.enum(["agents", "threats"]);
export type Side = z.infer<typeof Side>;

// Colour of the tag/base on the physical mini, so the screen maps to the table.
export const Marker = z.enum(["red", "amber", "green", "blue", "purple", "white"]);
export type Marker = z.infer<typeof Marker>;

export const ATTRIBUTES = ["S", "T", "A", "I", "Wil", "Int", "Fel"] as const;
export type Attribute = (typeof ATTRIBUTES)[number];

// Skill → linked Attribute, as printed on the character sheet (p.372).
export const SKILLS = {
  Athletics: "S", Awareness: "Int", "Ballistic Skill": "A", Cunning: "Fel", Deception: "Fel", Insight: "Fel",
  Intimidation: "Wil", Investigation: "Int", Leadership: "Wil", Medicae: "Int", Persuasion: "Fel", Pilot: "A",
  "Psychic Mastery": "Wil", Scholar: "Int", Stealth: "A", Survival: "Wil", Tech: "Int", "Weapon Skill": "I",
} as const satisfies Record<string, Attribute>;
export type Skill = keyof typeof SKILLS;

const attr = z.number().int().min(1).max(12);
const rule = z.object({ name: z.string().max(100), text: z.string().max(2000), page: z.string().max(40).optional() });

// Additive modifiers from species, talents, archetypes (e.g. Primaris +3 Wounds, Honour the Chapter +1 Resolve).
const Mods = z
  .object({ maxWounds: z.number().int(), maxShock: z.number().int(), defence: z.number().int(), resilience: z.number().int(),
    resolve: z.number().int(), conviction: z.number().int(), influence: z.number().int(), speed: z.number().int(),
    determination: z.number().int() })
  .partial();

export const CharacterStats = z.object({
  species: z.string().max(60).default(""),
  archetype: z.string().max(100).default(""),
  keywords: z.array(z.string().max(60)).max(20).default([]),
  attributes: z
    .object({ S: attr, T: attr, A: attr, I: attr, Wil: attr, Int: attr, Fel: attr })
    .default({ S: 1, T: 1, A: 1, I: 1, Wil: 1, Int: 1, Fel: 1 }),
  skills: z.partialRecord(z.enum(Object.keys(SKILLS) as [Skill, ...Skill[]]), z.number().int().min(0).max(8)).default({}),
  armour: z
    .object({ name: z.string().max(100), ar: z.number().int().min(0).max(20), invulnerable: z.boolean().default(false),
      powered: z.number().int().min(0).max(10).default(0), traits: z.array(z.string().max(60)).default([]) })
    .default({ name: "", ar: 0, invulnerable: false, powered: 0, traits: [] }),
  speed: z.number().int().min(0).max(20).default(6), // by Species (p.29)
  mods: Mods.default({}),
  abilities: z.array(rule).max(30).default([]), // archetype, species, chapter traits
  talents: z.array(rule).max(30).default([]),
  weapons: z.array(Weapon.extend({ addStrength: z.boolean().default(false) })).max(20).default([]), // melee "S+X"
  gear: z.array(z.string().max(200)).max(60).default([]),
  wealth: z.number().int().min(0).default(0),
});
export type CharacterStats = z.infer<typeof CharacterStats>;

// GM overrides win over everything derived.
export const Overrides = Mods.partial();
export type Overrides = z.infer<typeof Overrides>;

export const skillTotal = (s: CharacterStats, skill: Skill) => (s.skills[skill] ?? 0) + s.attributes[SKILLS[skill]];
export const effectiveStrength = (s: CharacterStats) => s.attributes.S + s.armour.powered; // Powered (X), p.232

// Traits, pp.36-37 and the sheet (p.372). All Traits have a minimum of 1 (p.36).
export function deriveStats(s: CharacterStats, o: Overrides, tier: number) {
  const a = s.attributes, m = s.mods;
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
export const poolMax = (pool: "glory" | "ruin", players: number) =>
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
  xp: z.number().int(),
  conditions: z.array(z.string()),
});
export type Character = z.infer<typeof Character>;

const turnFields = { acted: z.boolean(), ambushed: z.boolean() };

export const PcCombatant = z.object({ id: z.string(), kind: z.literal("pc"), characterId: z.string(), ...turnFields });

export const ThreatCombatant = z.object({
  id: z.string(),
  kind: z.literal("threat"),
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
export const sideOf = (c: Combatant): Side => (c.kind === "pc" ? "agents" : "threats");

export const LiveState = z.object({
  campaign: z.object({
    id: z.string(), name: z.string(), tier: Tier, glory: z.number().int(), ruin: z.number().int(),
    framework: z.string(), patron: z.string(),
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
});
export type LiveState = z.infer<typeof LiveState>;
export type Encounter = NonNullable<LiveState["encounter"]>;

// Ambushed characters get no Turn in Round 1 (p.177).
export const canAct = (e: Encounter, c: Combatant) => !c.acted && c.id !== e.currentId && !(c.ambushed && e.round === 1);

// Alternating Turns (p.176-177): after an Agent a Threat acts and vice versa; if the other side has no one left,
// the same side goes again. Each Round starts with the players choosing.
export function sideUpNext(e: Encounter): Side | null {
  const pending = (side: Side) => e.combatants.some((c) => canAct(e, c) && sideOf(c) === side);
  const preferred: Side = e.lastSide === "agents" ? "threats" : "agents";
  const other: Side = preferred === "agents" ? "threats" : "agents";
  return pending(preferred) ? preferred : pending(other) ? other : null;
}

// Seize the Initiative (p.176-177, p.320): the side that just acted pays 1 Glory/Ruin to act again, once before the
// other side acts. At the start of a Round only the GM can Seize, to let a Threat go first.
export function canSeize(e: Pick<Encounter, "lastSide" | "seizedSide">, side: Side): boolean {
  if (e.seizedSide === side) return false;
  return e.lastSide === null ? side === "threats" : e.lastSide === side;
}

// Automatic states from damage (pp.193-196, p.324).
export function pcStatus(c: Character, d: DerivedStats): string[] {
  const out: string[] = [];
  if (c.traumatic > d.maxTraumatic) out.push("Dead");
  else if (c.wounds > d.maxWounds) out.push("Dying");
  else if (c.wounds > 0) out.push("Wounded");
  if (c.shock > d.maxShock) out.push("Exhausted");
  return out;
}

export function threatStatus(c: ThreatCombatant): string[] {
  if (c.mobCount !== null) {
    if (c.mobCount === 0) return ["Slain"];
    return c.mobStart !== null && c.mobCount * 2 <= c.mobStart ? ["Resolve DN 3 at Round end"] : [];
  }
  const overShock = c.maxShock !== null && c.shock > c.maxShock;
  if (c.wounds > c.maxWounds) return [c.threatClass === "A" ? "Dying or dead (GM)" : "Slain"];
  if (overShock) return [c.threatClass === "T" ? "Slain" : "Exhausted"];
  return c.wounds > 0 ? ["Wounded"] : [];
}

export const toPlayerView = (s: LiveState): LiveState =>
  !s.encounter
    ? s
    : {
        ...s,
        encounter: {
          ...s.encounter,
          combatants: s.encounter.combatants.map((c) =>
            c.kind === "threat" && !c.revealed ? { ...c, stats: null } : c,
          ),
        },
      };

// Conditions, pp.197-200.
export const CONDITIONS = [
  "Bleeding", "Blinded", "Exhausted", "Fear", "Frenzied", "Hindered", "On Fire",
  "Pinned", "Poisoned", "Prone", "Restrained", "Staggered", "Terror", "Vulnerable",
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
