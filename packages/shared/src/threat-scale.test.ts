import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyProfile,
  prepareThreat,
  scaleBy,
  scaleThreat,
  THREAT_PROFILES,
  Threat,
  type ProfileId,
  type ThreatClass,
} from "./index.ts";

// A placeholder stat block, not a printed profile: the numbers are filler so the arithmetic is readable.
const threatOf = (over: Partial<Threat> & { threat?: (ThreatClass | null)[] } = {}): Threat =>
  Threat.parse({
    id: "placeholder",
    name: "Placeholder",
    page: 1,
    faction: "ork",
    threat: ["E", "E", "E", "E"],
    keywords: ["Ork"],
    attributes: { S: 3, T: 4, A: 3, I: 3, Wil: 2, Int: 2, Fel: 1 },
    resilience: { value: 5, note: "Flak Armour (2)" },
    defence: 2,
    wounds: 6,
    shock: 2,
    skills: { default: 2, list: [{ name: "Weapon Skill", dice: 5, passive: 3 }] },
    conviction: 3,
    resolve: 2,
    speed: 6,
    size: "Avg",
    ...over,
  });

const profiled = (t: Threat, id: ProfileId) => applyProfile(t, id);
const bonusNames = (t: Threat) => t.bonuses.map((b) => b.name);
const bonusText = (t: Threat, startsWith: string) => t.bonuses.find((b) => b.name.startsWith(startsWith))!.text;

test("THREAT_PROFILES prints the three Tier 5 profiles, each cited (VoA p.126)", () => {
  assert.deepEqual(
    THREAT_PROFILES.map((p) => p.id),
    ["heretical-strength", "xenos-cunning", "enemy-within"],
  );
  for (const p of THREAT_PROFILES) assert.equal(p.cite, "VoA p.126");
});

test("Heretical Strength raises Strength, Weapon Skill and Resilience, and nothing else (VoA p.126)", () => {
  const t = threatOf();
  const r = profiled(t, "heretical-strength");
  assert.equal(r.attributes.S, 5);
  assert.equal(r.skills.list[0]!.dice, 7);
  assert.equal(r.resilience.value, 7);
  // "The increase does not affect related statistics or abilities": the armour note, the Passive, and every other
  // number stay as printed (rules-flow §11.104).
  assert.equal(r.resilience.note, "Flak Armour (2)");
  assert.equal(r.skills.list[0]!.passive, 3);
  assert.deepEqual({ ...r.attributes, S: t.attributes.S }, t.attributes);
  assert.deepEqual(
    { wounds: r.wounds, shock: r.shock, defence: r.defence, resolve: r.resolve, conviction: r.conviction },
    { wounds: 6, shock: 2, defence: 2, resolve: 2, conviction: 3 },
  );
  assert.deepEqual(bonusNames(r), ["Heretical Strength (VoA p.126)"]);
});

test("Xenos Cunning raises Intellect, Willpower and Resolve (VoA p.126)", () => {
  const r = profiled(threatOf(), "xenos-cunning");
  assert.equal(r.attributes.Int, 4);
  assert.equal(r.attributes.Wil, 4);
  assert.equal(r.resolve, 3);
  assert.equal(r.attributes.S, 3);
  assert.deepEqual(r.skills.list, threatOf().skills.list); // it raises no Skill
});

test("The Enemy Within raises Intellect, Ballistic Skill and Resolve (VoA p.126)", () => {
  const r = profiled(threatOf(), "enemy-within");
  assert.equal(r.attributes.Int, 3);
  assert.equal(r.resolve, 4);
  // Ballistic Skill is unlisted, so it lands on Default + 1 (Core p.323, §11.105).
  assert.deepEqual(r.skills.list.at(-1), { name: "Ballistic Skill", dice: 3 });
});

test("a printed – stays –: Attributes, Resolve and Shock have no score to raise", () => {
  const t = threatOf({ attributes: { S: 3, T: null, A: 3, I: 3, Wil: null, Int: 2, Fel: null }, resolve: null });
  const r = profiled(t, "xenos-cunning");
  assert.equal(r.attributes.Wil, null);
  assert.equal(r.resolve, null);
  assert.equal(r.attributes.Int, 4); // the score it does have still rises
  const text = bonusText(r, "Xenos Cunning");
  assert.match(text, /Willpower is – and stays –/);
  assert.match(text, /Resolve is – and stays –/);
});

test("a Skill with neither a listing nor a Default is left alone, and the bonus says so (Core p.323, §11.105)", () => {
  const t = threatOf({ skills: { default: null, list: [] } });
  const r = profiled(t, "enemy-within");
  assert.deepEqual(r.skills.list, []);
  assert.match(bonusText(r, "The Enemy Within"), /Ballistic Skill is unlisted with no Default pool/);
});

test('a Skill printed as "Weapons Skill" or "Ballistics Skill" is the same Skill, raised in place', () => {
  const t = threatOf({
    skills: {
      default: 2,
      list: [
        { name: "Weapons Skill", dice: 5 },
        { name: "Ballistics Skill", dice: 4 },
      ],
    },
  });
  assert.deepEqual(profiled(t, "heretical-strength").skills.list, [
    { name: "Weapons Skill", dice: 7 },
    { name: "Ballistics Skill", dice: 4 },
  ]);
  assert.deepEqual(profiled(t, "enemy-within").skills.list, [
    { name: "Weapons Skill", dice: 5 },
    { name: "Ballistics Skill", dice: 5 },
  ]);
});

test("profiles stack additively (§11.104)", () => {
  const r = prepareThreat(threatOf(), {
    tier: 4,
    agents: 4,
    profiles: ["heretical-strength", "xenos-cunning"],
  });
  assert.equal(r.attributes.S, 5);
  assert.equal(r.attributes.Int, 4);
  assert.equal(r.attributes.Wil, 4);
  assert.equal(r.skills.list[0]!.dice, 7);
  assert.equal(r.resilience.value, 7);
  assert.equal(r.resolve, 3);
  assert.deepEqual(bonusNames(r), ["Heretical Strength (VoA p.126)", "Xenos Cunning (VoA p.126)"]);
});

test("scaleBy: an Elite adds the Tier, an Adversary or Monstrous Creature the Agents plus the Tier (Core p.326)", () => {
  for (const tier of [1, 2, 3, 4, 5]) {
    const classes: ThreatClass[] = ["E", "E", "E", "E", "E"];
    assert.equal(scaleBy(threatOf({ threat: classes.slice(0, 5) }), { tier, agents: 3 }), tier);
    for (const cls of ["A", "M"] as ThreatClass[])
      for (const agents of [1, 3, 5])
        assert.equal(scaleBy(threatOf({ threat: [cls, cls, cls, cls, cls] }), { tier, agents }), agents + tier);
  }
});

test("scaleBy: a Troop and a Mob entry take no scaling (Core pp.325-326, §11.107)", () => {
  assert.equal(scaleBy(threatOf({ threat: ["T", "T", "T", "T"] }), { tier: 3, agents: 4 }), 0);
  assert.equal(scaleBy(threatOf({ threat: ["A", "A", "A", "A"] }), { tier: 3, agents: 4, asMob: true }), 0);
});

test("scaleBy reads the class printed for the campaign's Tier (Core p.323)", () => {
  const t = threatOf({ threat: ["E", "E", "T", "T"] });
  assert.equal(scaleBy(t, { tier: 2, agents: 3 }), 2); // Elite at Tier 2
  assert.equal(scaleBy(t, { tier: 4, agents: 3 }), 0); // a Troop at Tier 4
});

test("scaleThreat moves Wounds and Shock together, and leaves a printed – alone", () => {
  const r = scaleThreat(threatOf({ threat: ["A", "A", "A", "A"] }), { tier: 3, agents: 4 });
  assert.equal(r.wounds, 13);
  assert.equal(r.shock, 9);
  assert.equal(bonusText(r, "Scaled"), "+7 Wounds and Shock (4 Agents + Tier 3).");

  const noShock = scaleThreat(threatOf({ threat: ["E", "E", "E", "E"], shock: null }), { tier: 2, agents: 4 });
  assert.equal(noShock.wounds, 8);
  assert.equal(noShock.shock, null);
  assert.equal(bonusText(noShock, "Scaled"), "+2 Wounds (Tier 2). Shock is – and stays –.");
});

test("a Troop scaled gains nothing and no BONUSES line", () => {
  const t = threatOf({ threat: ["T", "T", "T", "T"] });
  const r = scaleThreat(t, { tier: 4, agents: 5 });
  assert.deepEqual(r, t);
});

test("nothing mutates the input, and the same input gives the same result twice", () => {
  const t = threatOf();
  const before = structuredClone(t);
  const input = { tier: 3, agents: 4, profiles: ["heretical-strength", "enemy-within"] as ProfileId[], scale: true };
  const a = prepareThreat(t, input);
  const b = prepareThreat(t, input);
  assert.deepEqual(t, before);
  assert.deepEqual(a, b);
  assert.notEqual(a.skills.list, t.skills.list);
});

test("prepareThreat with nothing ticked returns the stat block as printed", () => {
  const t = threatOf();
  assert.deepEqual(prepareThreat(t, { tier: 3, agents: 4 }), t);
});

test("prepareThreat scales the printed class, not a profiled one", () => {
  // A profile raises no Tier row, so the Elite stays an Elite and adds the Tier only (Core p.326).
  const r = prepareThreat(threatOf(), { tier: 2, agents: 5, profiles: ["heretical-strength"], scale: true });
  assert.equal(r.wounds, 8);
  assert.deepEqual(bonusNames(r), ["Heretical Strength (VoA p.126)", "Scaled (Core p.326)"]);
});
