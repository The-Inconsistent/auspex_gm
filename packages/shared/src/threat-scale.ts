import { z } from "zod";
import { ATTRIBUTE_NAMES, type Attribute } from "./state.ts";
import { type Threat, threatClassAt } from "./threat.ts";

// Two ways the books change a stat block before a Threat joins a fight (GitHub issue #42):
// the Tier 5 Threat Profiles (Vow of Absolution p.126) and Scaling Threats (Core Rulebook p.326).
// Both are the GM's to tick on a prepared entry; neither touches the printed files, so every function here returns a
// copy. `threats` in @wg/data is one process-wide Map: mutating a stat block would change the bestiary for every
// campaign and every fight.

export const ProfileId = z.enum(["heretical-strength", "xenos-cunning", "enemy-within"]);
export type ProfileId = z.infer<typeof ProfileId>;

// The Skills a profile raises. They are Skills, which a stat block prints as dice pools in its SKILLS line, not
// Attributes (Core p.323).
export type ProfileSkill = "Weapon Skill" | "Ballistic Skill";
// Three stat blocks print a Skill as "Weapons Skill" or "Ballistics Skill", copied as printed (dh-plaguebearer,
// litanies-kataphron-battle-servitor, rr1-psychneuein): the same Skill, so a profile has to find it either way.
const PROFILE_SKILL_NAME: Record<ProfileSkill, RegExp> = {
  "Weapon Skill": /^weapons? skill$/i,
  "Ballistic Skill": /^ballistics? skill$/i,
};

export type ProfileMods = {
  attributes?: Partial<Record<Attribute, number>>;
  skills?: Partial<Record<ProfileSkill, number>>;
  resilience?: number;
  resolve?: number;
};

// The three profiles as printed (VoA p.126). They "can be applied to any enemy Threat", at any Tier and on any class
// (rules-flow §11.103, §11.108), and the increase "does not affect related statistics or abilities": nothing is
// re-derived, so a raised Strength leaves melee damage alone and a raised pool leaves its printed Passive alone
// (§11.104). `effect` is a paraphrase, never the book's prose.
export const THREAT_PROFILES: readonly {
  id: ProfileId;
  name: string;
  cite: string;
  effect: string;
  mods: ProfileMods;
}[] = [
  {
    id: "heretical-strength",
    name: "Heretical Strength",
    cite: "VoA p.126",
    effect: "Strength +2, Weapon Skill +2, Resilience +2",
    mods: { attributes: { S: 2 }, skills: { "Weapon Skill": 2 }, resilience: 2 },
  },
  {
    id: "xenos-cunning",
    name: "Xenos Cunning",
    cite: "VoA p.126",
    effect: "Intellect +2, Willpower +2, Resolve +1",
    mods: { attributes: { Int: 2, Wil: 2 }, resolve: 1 },
  },
  {
    id: "enemy-within",
    name: "The Enemy Within",
    cite: "VoA p.126",
    effect: "Intellect +1, Ballistic Skill +1, Resolve +2",
    mods: { attributes: { Int: 1 }, skills: { "Ballistic Skill": 1 }, resolve: 2 },
  },
];

// At most one of each profile: they are toggles, and the same one twice would raise a stat twice and write two
// BONUSES lines with one name (§11.84). The server decides, so the schema drops the repeat whatever a client sends.
export const Profiles = z
  .array(ProfileId)
  .max(THREAT_PROFILES.length)
  .transform((ids) => [...new Set(ids)])
  .default([]);

export const threatProfile = (id: ProfileId) => THREAT_PROFILES.find((p) => p.id === id)!;

const bonus = (name: string, parts: string[]) => ({ name, text: `${parts.join(". ")}.` });

// One profile applied to a copy of the stat block, with a BONUSES line saying what moved and what couldn't.
export function applyProfile(t: Threat, id: ProfileId): Threat {
  const p = threatProfile(id);
  const held: string[] = []; // what the stat block has no score for, so the raise had nowhere to land

  const attributes = { ...t.attributes };
  for (const [a, d] of Object.entries(p.mods.attributes ?? {}) as [Attribute, number][]) {
    // A printed "–" is no score at all: the Threat auto-passes those Tests, so there is nothing to raise (docs/data.md §2).
    if (attributes[a] === null) held.push(`${ATTRIBUTE_NAMES[a]} is – and stays –`);
    else attributes[a] = attributes[a] + d;
  }

  // An unlisted Skill rolls the Default pool (Core p.323), so the raise lands on Default + the bonus. With no Default
  // either, the SKILLS line is left as printed and the bonus says the raise had nowhere to go (§11.105).
  let list = t.skills.list;
  for (const [name, d] of Object.entries(p.mods.skills ?? {}) as [ProfileSkill, number][]) {
    const printed = list.find((s) => PROFILE_SKILL_NAME[name].test(s.name));
    if (printed) list = list.map((s) => (s === printed ? { ...s, dice: s.dice + d } : s));
    // Appended, not sorted in: 26 of the printed blocks list their Skills out of alphabetical order, and a profile
    // has no business reordering what the book prints.
    else if (t.skills.default !== null) list = [...list, { name, dice: t.skills.default + d }];
    else held.push(`${name} is unlisted with no Default pool, so its +${d} has nowhere to land`);
  }

  // Resolve is printed "–" on a Threat with no score, as the Attributes are.
  let resolve = t.resolve;
  if (p.mods.resolve !== undefined) {
    if (resolve === null) held.push("Resolve is – and stays –");
    else resolve = resolve + p.mods.resolve;
  }

  return {
    ...t,
    attributes,
    skills: { ...t.skills, list },
    resilience:
      p.mods.resilience === undefined
        ? t.resilience
        : { ...t.resilience, value: t.resilience.value + p.mods.resilience },
    resolve,
    bonuses: [...t.bonuses, bonus(`${p.name} (${p.cite})`, [p.effect, ...held])],
  };
}

export type ScaleInput = { tier: number; agents: number; asMob?: boolean };

// How many Wounds and Shock Scaling Threats adds, or 0 when the class takes none (Core p.326). Troops are left as
// simply as the book asks, and a Mob's members have 1 Wound each, so there is nowhere to put them (p.325, §11.107).
// "The number of players" is the Agents in the fight (§11.106).
export function scaleBy(t: Threat, { tier, agents, asMob = false }: ScaleInput): number {
  const cls = threatClassAt(t, tier); // the class printed for this campaign's Tier, on the unmodified block (p.323)
  if (asMob || cls === "T") return 0;
  return cls === "E" ? tier : agents + tier;
}

// Scaling applied to a copy: Wounds and Shock up by `scaleBy`, with a BONUSES line showing the arithmetic. A printed
// Shock of "–" stays "–": the Threat never suffers Shock.
export function scaleThreat(t: Threat, input: ScaleInput): Threat {
  const n = scaleBy(t, input);
  if (n === 0) return { ...t };
  const cls = threatClassAt(t, input.tier);
  const how = cls === "E" ? `Tier ${input.tier}` : `${input.agents} Agents + Tier ${input.tier}`;
  return {
    ...t,
    wounds: t.wounds + n,
    shock: t.shock === null ? null : t.shock + n,
    bonuses: [
      ...t.bonuses,
      bonus("Scaled (Core p.326)", [
        `+${n} Wounds${t.shock === null ? "" : " and Shock"} (${how})`,
        ...(t.shock === null ? ["Shock is – and stays –"] : []),
      ]),
    ],
  };
}

export type PrepareInput = ScaleInput & { profiles?: readonly ProfileId[]; scale?: boolean };

// The stat block as it goes into a combatant's snapshot: profiles first, then scaling, which reads the printed class
// either way (`threatClassAt` on the block, which no profile changes). Profiles stack additively (§11.104).
export function prepareThreat(t: Threat, { profiles = [], scale = false, ...input }: PrepareInput): Threat {
  // Each profile at most once, as `Profiles` parses them: a caller holding an unparsed list can't double a stat.
  const profiled = [...new Set(profiles)].reduce<Threat>((acc, id) => applyProfile(acc, id), t);
  return scale ? scaleThreat(profiled, input) : { ...profiled };
}
