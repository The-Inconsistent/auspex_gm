// The Threat pack for InconsisTable (its P3): every transcribed stat block as a Threat entry, every printed weapon line
// as a Weapon entry, against the ruleset of ruleset.ts. Nothing is retyped: each value comes from packages/data/threats
// through the zod schema (`threats`). Written with `bun packages/data/port/write.ts <ruleset> <pack>`; the pack is
// private content and is never committed.
//
// What it leaves out on purpose (docs of the port, the product owner's decisions of 2026-11-20): the text of every
// Ability, Bonus, Option and Determination, the transcription `note`, and all Mob content. Anything the fields cannot
// hold comes back in `leftOut`, with its Threat id and why.
import { SKILLS, threatCite, threatClassAt, type Skill, type Weapon } from "@wg/shared";
import { threats } from "../index.ts";
import { idOf, THREAT_CLASSES } from "./ruleset.ts";

export type FieldValue = number | string | boolean | string[];
export interface Entry {
  key: string;
  type: "threat" | "weapon";
  name: string;
  tags?: string[];
  cite: string;
  visibility: "gm";
  body: Record<string, FieldValue>;
}
export interface Pack {
  id: string;
  version: string;
  ruleset: { id: string; range: string };
  license: "private";
  entries: Entry[];
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
const slugOf = (name: string) =>
  name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/\p{M}+/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "weapon";

// "Spend 1 Ruin to roll 3d6." and nothing else; the case and the closing full stop are not content.
const PLAIN_DETERMINATION = /^Spend (\d+) (Ruin|Glory) to roll (\d+)d6\.?$/i;
const ABILITY_NAME_MAX = 1000;

export function buildPack(): { pack: Pack; leftOut: LeftOut[]; normalised: Record<string, number> } {
  const leftOut: LeftOut[] = [];
  const normalised: Record<string, number> = {};
  const entries: Entry[] = [];
  const skip = (reason: string, id: string, n = 1) => {
    for (let i = 0; i < n; i++) leftOut.push({ reason, id });
  };

  for (const t of threats.values()) {
    const cite = threatCite(t);
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
    const abilities: string[] = [];
    for (const a of t.abilities) {
      if (a.name === undefined) skip("ability without a name (text not copied)", t.id);
      else if (a.name.length > ABILITY_NAME_MAX) skip("ability name over the list item limit", t.id);
      else abilities.push(a.type === undefined ? a.name : `${a.type}: ${a.name}`);
    }
    body.abilities = abilities;
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
      if (fromOption !== undefined) wb.fromOption = fromOption;
      weaponEntries.push({ key, type: "weapon", name: w.name, cite, visibility: "gm", body: wb });
      return key;
    };
    body.weapons = t.abilities.flatMap((a) => a.weapons.map((w) => addWeapon(w)));
    body.variantWeapons = t.options
      .filter((o) => o.kind === "variant")
      .flatMap((o) => [...o.weapons, ...o.abilities.flatMap((a) => a.weapons)].map((w) => addWeapon(w, o.name)));

    // Mob content is not ported.
    for (const a of t.mobAbilities) {
      skip("Mob ability (mobAbilities)", t.id);
      skip("weapon of a Mob ability", t.id, a.weapons.length);
    }
    for (const o of t.options.filter((o) => o.kind === "mob")) {
      skip("Mob option", t.id);
      skip("weapon of a Mob option", t.id, o.weapons.length + o.abilities.reduce((n, a) => n + a.weapons.length, 0));
      skip("ability of a Mob option", t.id, o.abilities.length);
    }

    const tags =
      t.keywords.length <= 20 && t.keywords.every((k) => k.length >= 1 && k.length <= 40) ? t.keywords : undefined;
    if (tags === undefined) skip("keywords do not fit tags", t.id);
    entries.push({ key: t.id, type: "threat", name: t.name, ...(tags && { tags }), cite, visibility: "gm", body });
    entries.push(...weaponEntries);
  }

  const pack: Pack = {
    id: "wrath-and-glory-threats",
    version: "0.1.0",
    ruleset: { id: "wrath-and-glory", range: "^0.1.0" },
    license: "private",
    entries,
  };
  return { pack, leftOut, normalised };
}
