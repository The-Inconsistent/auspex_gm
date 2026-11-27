// The Threat pack for InconsisTable (its P3): every transcribed stat block as a Threat entry, every printed weapon line
// as a Weapon entry, against the ruleset of ruleset.ts. Nothing is retyped: each value comes from packages/data/threats
// through the zod schema (`threats`). Written with `bun packages/data/port/write.ts <ruleset> <pack>`; the pack is
// private content and is never committed.
//
// What it leaves out on purpose (docs of the port, the product owner's decisions of 2026-11-20): the text of every
// Ability, Bonus, Option and Determination, and the transcription `note`. A Mob's abilities and options come by name
// and their weapons as entries, as a single Threat's do (#325, rules-flow §11.199). Anything the fields cannot hold
// comes back in `leftOut`, with its Threat id and why.
//
// `buildCustomThreatPack` turns a campaign export's own Threats into a pack of the same shape (`--custom-threats`).
import {
  isMeleeProfile,
  SKILLS,
  threatCite,
  threatClassAt,
  type CampaignExport,
  type Skill,
  type Threat,
  type Weapon,
} from "@wg/shared";
import { threats } from "../index.ts";
import { TRAIT_TEXT_MAX } from "./creation-packs.ts";
import { idOf, THREAT_CLASSES } from "./ruleset.ts";

export type FieldValue = number | string | boolean | string[];
export interface Entry {
  key: string;
  type: "threat" | "weapon";
  name: string;
  tags?: string[];
  /** Absent on the GM's own Threats: an `original` pack needs no printed page. */
  cite?: string;
  visibility: "gm";
  body: Record<string, FieldValue>;
}
export interface Pack<E = Entry> {
  id: string;
  version: string;
  ruleset: { id: string; range: string };
  /** `private`: copied from a book; `original`: the owner's own writing (the pack analogue of a homebrew ruleset). */
  license: "private" | "original";
  entries: E[];
}
/** Something the pack does not carry: the Threat it belongs to and why (grouped by `reason` in the report). */
export interface LeftOut {
  reason: string;
  id: string;
}

// The Skill names the books misprint, mapped to the Skill they plainly mean (rules-flow: "Weapons Skill", "Psychic
// Master"). "Psyniscience" and "Agility" name no Skill and are not guessed.
export const SKILL_VARIANTS: Record<string, Skill> = {
  Intimidate: "Intimidation",
  Intimitation: "Intimidation",
  "Weapons Skill": "Weapon Skill",
  "Ballistics Skill": "Ballistic Skill",
  "Psychic Master": "Psychic Mastery",
};

// Keys are `<threat id>.<slug>`: a Pack key allows one separator between runs of letters and digits, so `--` is not one.
const MAX_KEY = 80;
const slugOf = (name: string, fallback = "weapon") =>
  name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/\p{M}+/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || fallback;

// "Spend 1 Ruin to roll 3d6." and nothing else; the case and the closing full stop are not content.
const PLAIN_DETERMINATION = /^Spend (\d+) (Ruin|Glory) to roll (\d+)d6\.?$/i;
const ABILITY_NAME_MAX = 1000;

/** A Threat as its entry and its weapons' entries, each with `cite` (none for the GM's own); the rest goes to `leftOut`. */
function threatEntries(
  t: Threat,
  cite: string | undefined,
  leftOut: LeftOut[],
  normalised: Record<string, number>,
): Entry[] {
  const skip = (reason: string, id: string, n = 1) => {
    for (let i = 0; i < n; i++) leftOut.push({ reason, id });
  };
  const at = cite === undefined ? {} : { cite };
  const body: Record<string, FieldValue> = { faction: t.faction, size: idOf(t.size), keywords: t.keywords };
  const put = (field: string, value: number | null | undefined, why: string) => {
    if (value === null || value === undefined) skip(`null value: ${why}`, t.id);
    else body[field] = value;
  };

  // The class at every Tier, as this repo reads the printed row (threatClassAt): below its first printed Tier a
  // threat takes that Tier's class, and past its last column it keeps the last. So no column is ever missing.
  for (let tier = 1; tier <= 5; tier++) body[`class.t${tier}`] = THREAT_CLASSES[threatClassAt(t, tier)];
  for (const [a, v] of Object.entries(t.attributes)) put(`attr.${idOf(a)}`, v, `attr.${idOf(a)}`);
  body["stat.defence"] = t.defence;
  body["stat.resilience"] = t.resilience.value;
  body["stat.wounds"] = t.wounds;
  body["stat.speed"] = t.speed;
  put("stat.shock", t.shock, "stat.shock");
  put("stat.conviction", t.conviction, "stat.conviction");
  put("stat.resolve", t.resolve, "stat.resolve");
  if (t.personalRuin !== undefined) body["stat.personalRuin"] = t.personalRuin;
  if (t.resilience.note !== undefined) body["stat.armourNote"] = t.resilience.note;

  if (t.skills.default !== null) body["skill.default"] = t.skills.default;
  else skip("null value: skill.default", t.id);
  for (const s of t.skills.list) {
    const proper = s.name in SKILLS ? (s.name as Skill) : SKILL_VARIANTS[s.name];
    if (proper === undefined) {
      skip(`skill name not recognised: ${s.name}`, t.id);
      continue;
    }
    if (proper !== s.name) normalised[`${s.name} → ${proper}`] = (normalised[`${s.name} → ${proper}`] ?? 0) + 1;
    if (`skill.${idOf(proper)}` in body) skip(`Skill listed twice: ${proper}`, t.id);
    else body[`skill.${idOf(proper)}`] = s.dice;
    // A Skill's passive rating (the block's "Passive N") has no field of its own, except Awareness' own.
    if (s.passive !== undefined && proper === "Awareness") body["stat.passiveAwareness"] = s.passive;
    else if (s.passive !== undefined) skip(`passive rating of ${proper} (no field)`, t.id);
  }

  if (t.determination !== undefined) {
    const m = PLAIN_DETERMINATION.exec(t.determination);
    if (m === null) skip("Determination not the plain pattern", t.id);
    else {
      body["determination.cost"] = Number(m[1]);
      body["determination.pool"] = Number(m[3]);
      body["determination.currency"] = m[2]!.toLowerCase();
    }
  }

  // Names only. An Ability with no name has nothing to carry but its text, which is not copied.
  const named = (list: typeof t.abilities, what = "ability") => {
    const names: string[] = [];
    for (const a of list) {
      if (a.name === undefined) skip(`${what} without a name (text not copied)`, t.id);
      else if (a.name.length > ABILITY_NAME_MAX) skip(`${what} name over the list item limit`, t.id);
      else names.push(a.type === undefined ? a.name : `${a.type}: ${a.name}`);
    }
    return names;
  };
  body.abilities = named(t.abilities);
  body.bonuses = t.bonuses.map((b) => b.name);
  body.options = t.options.filter((o) => o.kind === "variant").map((o) => o.name);

  // Weapons: one entry per printed line, keys unique within the Threat.
  const used = new Set<string>();
  const weaponEntries: Entry[] = [];
  const addWeapon = (w: Weapon, fromOption?: string) => {
    const room = MAX_KEY - t.id.length - 1;
    let slug = slugOf(w.name);
    let n = 1;
    for (;;) {
      const suffix = n === 1 ? "" : `-${n}`;
      const candidate = `${slug.slice(0, Math.max(1, room - suffix.length)).replace(/-+$/, "")}${suffix}`;
      if (!used.has(candidate)) {
        slug = candidate;
        break;
      }
      n++;
    }
    used.add(slug);
    const key = `${t.id}.${slug}`;
    const wb: Record<string, FieldValue> = { damage: w.damage };
    if (typeof w.ed === "number") wb.ed = w.ed;
    else wb.edDice = w.ed;
    if (w.ap !== undefined) wb.ap = w.ap;
    (["s", "m", "l"] as const).forEach((r, i) => {
      if (w.range[i] !== undefined) wb[`range.${r}`] = w.range[i]!;
    });
    if (w.salvo !== null && w.salvo !== undefined) wb.salvo = w.salvo;
    if (w.count !== undefined) wb.count = w.count;
    wb.traits = w.traits;
    // What a strike reads (house decision #99): melee rolls Weapon Skill (threatAttackPool), the Traits as one text.
    wb.melee = w.melee ?? isMeleeProfile(w);
    const traitText = w.traits.join(", ");
    if (traitText.length > TRAIT_TEXT_MAX) skip("weapon Traits over a text's length", t.id);
    else if (traitText) wb.traitText = traitText;
    if (fromOption !== undefined) wb.fromOption = fromOption;
    weaponEntries.push({ key, type: "weapon", name: w.name, ...at, visibility: "gm", body: wb });
    return key;
  };
  body.weapons = t.abilities.flatMap((a) => a.weapons.map((w) => addWeapon(w)));
  body.variantWeapons = t.options
    .filter((o) => o.kind === "variant")
    .flatMap((o) => [...o.weapons, ...o.abilities.flatMap((a) => a.weapons)].map((w) => addWeapon(w, o.name)));

  // A Mob's own abilities and options (p.324), as a single Threat's: names, and their weapons as entries (#325).
  const mob = t.options.filter((o) => o.kind === "mob");
  body.mobAbilities = named(t.mobAbilities, "Mob ability");
  body.mobOptions = mob.map((o) => o.name);
  body.mobWeapons = [
    ...t.mobAbilities.flatMap((a) => a.weapons.map((w) => addWeapon(w, "Mob"))),
    ...mob.flatMap((o) => [...o.weapons, ...o.abilities.flatMap((a) => a.weapons)].map((w) => addWeapon(w, o.name))),
  ];

  const tags =
    t.keywords.length <= 20 && t.keywords.every((k) => k.length >= 1 && k.length <= 40) ? t.keywords : undefined;
  if (tags === undefined) skip("keywords do not fit tags", t.id);
  return [
    { key: t.id, type: "threat", name: t.name, ...(tags && { tags }), ...at, visibility: "gm", body },
    ...weaponEntries,
  ];
}

// Both rulesets this repo generates: 0.1.x (copied in by hand) and 0.2.x (the ledger builder), from the versions whose
// Threat carries a Mob's abilities, options and weapons (0.1.16, 0.2.16).
const THREAT_RULESET = { id: "wrath-and-glory", range: "^0.1.16 || ^0.2.16" };

export function buildPack(): { pack: Pack; leftOut: LeftOut[]; normalised: Record<string, number> } {
  const leftOut: LeftOut[] = [];
  const normalised: Record<string, number> = {};
  const entries = [...threats.values()].flatMap((t) => threatEntries(t, threatCite(t), leftOut, normalised));
  const pack: Pack = {
    id: "wrath-and-glory-threats",
    // 0.1.2: a weapon's melee and Traits as text, which a strike reads (#325). 0.1.3: Mob content (#325).
    version: "0.1.3",
    ruleset: THREAT_RULESET,
    license: "private",
    entries,
  };
  return { pack, leftOut, normalised };
}

// A pack id is kebab-case, at most 64 characters (InconsisTable's RulesetId).
const CUSTOM_SUFFIX = "-custom-threats";
const PACK_KEY = /^[a-z0-9]+([-_.][a-z0-9]+)*$/;

/**
 * The Threats a campaign's GM wrote (`codex.customThreats` of an export), as entries of the Threat pack's shape, keyed
 * by their `custom-<slug>` id so a scene's roster and an NPC's stat source still find them. They are the GM's own work,
 * so the pack is `original` and carries no cite; the platform's entries have no text field, so the GM's ability,
 * bonus and option text is left out as the book pack leaves the book's.
 */
export function buildCustomThreatPack(exported: CampaignExport): {
  pack: Pack;
  leftOut: LeftOut[];
  normalised: Record<string, number>;
} {
  const leftOut: LeftOut[] = [];
  const normalised: Record<string, number> = {};
  const entries = exported.codex.customThreats.flatMap((t) => {
    if (t.id.length <= MAX_KEY && PACK_KEY.test(t.id)) return threatEntries(t, undefined, leftOut, normalised);
    leftOut.push({ reason: "id is not a pack entry key", id: t.id });
    return [];
  });
  const slug = slugOf(exported.campaign.name, "campaign")
    .slice(0, 64 - CUSTOM_SUFFIX.length)
    .replace(/-+$/, "");
  const pack: Pack = {
    id: `${slug}${CUSTOM_SUFFIX}`,
    // 0.1.2: Mob content, as the Threat pack's (#325).
    version: "0.1.2",
    ruleset: THREAT_RULESET,
    license: "original",
    entries,
  };
  return { pack, leftOut, normalised };
}
