import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import {
  ATTRIBUTE_XP,
  CharacterBuild,
  CharacterStats,
  SKILL_XP,
  buildReady,
  slotOf,
  creationKey,
  deriveStats,
  keepPlay,
  meets,
  keepSheetWeapons,
  outOfReach,
  resolveBuild,
  applyUpgrades,
  sheetWeapon,
  upgradeRefusal,
  wargearMatches,
  withUpgrades,
  withWeaponEffects,
  ruleKey,
  type SheetArmourLike,
  type Wargear,
  type Weapon,
  type WargearWeapon,
  type CharacterBuildInput,
} from "@wg/shared";
import { creationCatalogue, rulesList, wargear } from "./index.ts";

// Issue #9 step 1 and #18 acceptance: every pregen fixture (fixtures/pregens), rebuilt from its build, comes out at
// the XP of its ledger and with the sheet its stats print. The GM's part of each build holds the rulings that make it so.
const dir = new URL("./fixtures/pregens/", import.meta.url);
const fixtures = readdirSync(dir)
  .filter((f) => f.endsWith(".json"))
  .sort()
  .map((f) => JSON.parse(readFileSync(new URL(f, dir), "utf8")));
const catalogue = { creation: creationCatalogue(), wargear, homebrew: false };
const PREGENS = fixtures.map((c, i) => ({
  n: i + 1,
  name: c.name as string,
  want: c.stats as CharacterStats,
  build: CharacterBuild.parse(c.build),
  ledger: c.ledger as number[],
  homebrew: c.homebrew as boolean,
}));
const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/\s*\(.*?\)\s*/g, "")
    .replace(/[^a-z0-9]/g, "");

// A weapon line as the table compares it: the numbers, the Traits the rules reference knows (with their ratings), and
// the upgrades fitted, whether printed as a Trait ("Duelling Grip (+1 bonus die)") or fitted (`upgradeNames`).
const TRAITS = new Set(
  rulesList()
    .filter((r) => r.kind === "weapon-trait")
    .map((r) => ruleKey(r.name)),
);
const UPGRADES = new Set([...wargear.values()].filter((w) => w.kind === "upgrade").map((w) => ruleKey(w.name)));
const profile = (w: Weapon) => ({
  damage: w.damage,
  ed: w.ed,
  ap: w.ap ?? 0,
  range: w.range,
  salvo: w.salvo ?? null,
  traits: w.traits.filter((t) => TRAITS.has(ruleKey(t))).sort(),
  upgrades: [...w.traits, ...(w.upgradeNames ?? [])]
    .map(ruleKey)
    .filter((k) => UPGRADES.has(k))
    .sort(),
});

test("every pregen fixture carries a build", () => {
  assert.equal(PREGENS.length, 11);
  for (const p of PREGENS) assert.ok(p.build, p.name);
});

for (const { want, ...p } of PREGENS) {
  test(`${p.name}: the build resolves to the pregen's ledger and sheet`, () => {
    const r = resolveBuild({ catalogue: { ...catalogue, homebrew: p.homebrew }, build: p.build });
    assert.deepEqual(r.pending, [], "nothing left to choose");
    assert.deepEqual(
      r.problems.map((x) => x.what),
      [],
      "no problems",
    );
    assert.ok(buildReady(r));

    assert.equal(
      r.spent,
      p.ledger.reduce((a, b) => a + b, 0),
    );
    assert.deepEqual(
      r.ledger.map((l) => l.xp).sort((a, b) => a - b),
      p.ledger.sort((a, b) => a - b),
    );

    const s = r.sheet;
    assert.equal(s.species, want.species);
    assert.equal(s.archetype, want.archetype);
    assert.deepEqual(s.attributes, want.attributes);
    assert.deepEqual(s.skills, want.skills);
    assert.deepEqual([...s.keywords].sort(), [...want.keywords].sort());
    assert.equal(s.speed, want.speed);
    assert.equal(s.wealth, want.wealth);
    assert.equal(s.armour.ar, want.armour.ar);
    assert.equal(s.armour.powered, want.armour.powered);
    // With their picks: Trademark Weapon (Bolt Sniper Rifle), Acute Sense (smell).
    const named = (ts: { name: string }[]) => ts.map((t) => t.name.toLowerCase()).sort();
    assert.deepEqual(named(s.talents), named(want.talents));
    const abilities = s.abilities.map((a) => norm(a.name));
    // A package's prose effect (Heavy Intercessor Doctrine's +Rank AP) sits on the pregen as an ability; the build has
    // it as the package.
    const packages = (p.build.packages ?? []).map(norm);
    for (const a of want.abilities.filter((x) => !packages.includes(norm(x.name))))
      assert.ok(abilities.includes(norm(a.name)), a.name);

    assert.deepEqual(s.mods, want.mods); // the extra Background bonuses are the GM's (the GM grants all three Background bonuses)

    // Since #27 the weapons are the build's, with their Talents applied on read (rules-flow.md §11.68), and they must
    // come out as the pregen prints them: the numbers, every real Trait with its rating, and the fitted upgrades.
    // `keepSheet` keeps the printed armour and gear lines, and a printed weapon the build has none of by name (the GM's
    // own Haywire Mine and deployed smoke, a GM choice). Printed prose ("ED includes +1 Explosive Fury") is
    // the effect's own name now, so it isn't compared.
    const weapons = keepSheetWeapons(want.weapons, s.weapons); // what `keepSheet` stores (character.actions.ts)
    const live = withWeaponEffects(withUpgrades({ ...s, weapons }, wargear), { rank: 1, catalogue: wargear });
    assert.equal(live.weapons.length, want.weapons.length, "no weapon the pregen doesn't print");
    for (const p of want.weapons) {
      const w = live.weapons.find((x) => x.name === p.name);
      assert.ok(w, `${p.name} is on the sheet`);
      assert.deepEqual(profile(w), profile(p), p.name);
    }
    const kept = keepPlay({ previous: want, next: s, before: s });
    // The rebuild may tag the printed suit with its catalogue entry, so an upgrade can be fitted to it (§11.65).
    const { wargearId: _suit, ...keptArmour } = kept.armour;
    assert.deepEqual(keptArmour, want.armour);
    assert.deepEqual(kept.gear, want.gear);
  });
}

// ── the rules, one at a time ──

const incursor = PREGENS[1]!.build;
const run = (build: CharacterBuildInput, homebrew = false) =>
  resolveBuild({ catalogue: { ...catalogue, homebrew }, build });

test("every archetype resolves without throwing, and says what is left to choose", () => {
  for (const a of catalogue.creation.archetypes) {
    const r = run({ tier: a.tier, archetypeId: a.id }, true);
    assert.equal(r.ledger[0]!.xp, a.xp, a.id);
    assert.ok(r.pending.length > 0, `${a.id}: a bare build has choices left`);
  }
});

test("the Tree of Learning applies to Skills raised with XP (Core p.26, §11.52)", () => {
  const r = run({ ...incursor, skills: { ...incursor.skills, Stealth: 8 } }); // 7 Skills have points
  assert.ok(r.problems.some((p) => p.what === "Stealth 8 needs 8 Skills with points (the Tree of Learning)"));
});

test("species maximums cap every Attribute (Core p.25)", () => {
  const r = run({ ...incursor, attributes: { A: 10 } });
  assert.ok(r.problems.some((p) => p.what.startsWith("Agility 10 is over the Primaris Astartes maximum of 9")));
});

test("one Background bonus: the build asks which (§11.22)", () => {
  const r = run({ ...incursor, background: { ...incursor.background!, bonus: undefined } });
  assert.ok(r.pending.some((p) => p.what === "Choose which one Background bonus applies"));
});

test("a Chapter is asked for, and a Primaris ignores (Gene-seed) traits (Core p.71)", () => {
  const r = run({ ...incursor, fills: {} });
  assert.ok(r.pending.some((p) => p.what === "Choose your [CHAPTER]"));
  const names = run({ ...incursor, fills: { "[CHAPTER]": { id: "raven-guard" } } }).sheet.abilities.map((a) => a.name);
  assert.ok(names.includes("Master Of Shadows") && !names.includes("Dark Heritage (Gene-seed)"));
});

test("a Successor with no traits takes its founder's, flaw included (Absolvers, §11.23)", () => {
  const names = run({ ...incursor, fills: { "[CHAPTER]": { id: "absolvers" } }, talents: [] }).sheet.abilities.map(
    (a) => a.name,
  );
  assert.ok(names.includes("Savage Echoes") && names.includes("The Red Thirst (Gene-seed)"));
});

test("Creation Ascension: a lower-Tier archetype needs one Ascension Package (Core p.148)", () => {
  const { packages: _, ...sergeant } = PREGENS[0]!.build;
  const r = run(sergeant);
  assert.ok(r.pending.some((p) => p.step === "ascension"));
});

test("Change of Kinship at Creation Ascension only joins the Ynnari (IoE pp.20, 58, rules-flow.md §11.61)", () => {
  // Guardian (Tier 2) in a Tier 3 campaign; the first grant is the kindred joined (4: YNNARI, 2: DRUKHARI), the
  // second the kindred left (0: ASURYANI).
  const kinship = (join: number) =>
    run({
      tier: 3,
      archetypeId: "guardian",
      packages: ["change-of-kinship"],
      choices: { "package/change-of-kinship/0": [join], "package/change-of-kinship/1": [0] },
    });
  const barred = (r: ReturnType<typeof run>) =>
    r.problems.some((p) => p.what.startsWith("Change of Kinship can't be taken at creation"));
  const ynnari = kinship(4);
  assert.ok(!barred(ynnari));
  assert.ok(ynnari.sheet.keywords.includes("YNNARI") && !ynnari.sheet.keywords.includes("ASURYANI"));
  assert.ok(barred(kinship(2)));
});

test("the talent list hides what XP can't buy: species, archetype, keyword", () => {
  const talent = (id: string) => catalogue.creation.talents.find((t) => t.id === id)!.requires;
  const guardsman = run({ tier: 1, archetypeId: "imperial-guardsman" }).who;
  const corsair = run({ tier: 1, archetypeId: "corsair" }).who;
  assert.ok(outOfReach(talent("legacy-of-sorrow"), guardsman)); // Aeldari only (Core p.135)
  assert.ok(!outOfReach(talent("legacy-of-sorrow"), corsair));
  assert.ok(!outOfReach(talent("brutalist"), guardsman)); // Strength 3 can still be bought
  // Favoured by the Warp (Core p.133) needs PSYKER, which Latent Psyker gives a Human (Apocrypha p.238).
  assert.ok(!outOfReach(talent("favoured-by-the-warp"), run({ tier: 1, archetypeId: "imperial-guardsman" }, true).who));
  // A Terminator picks Adeptus Astartes or Primaris: before the pick, Angel of Death (Core p.129) is still open.
  assert.ok(!outOfReach(talent("angel-of-death"), run({ tier: 3, archetypeId: "terminator" }).who));
  // A keyword is only buyable from a record this character can take: Lost on the Warrior Path's EXARCH needs an
  // ASPECT WARRIOR (IoE p.59), so a Dire Avenger can buy it and a Corsair can't.
  assert.ok(run({ tier: 3, archetypeId: "dire-avenger" }).who.buyable.includes("EXARCH"));
  assert.ok(!run({ tier: 3, archetypeId: "corsair" }).who.buyable.includes("EXARCH"));
});

test("a granted Talent whose requirements aren't met waits for the GM, and the tick clears it", () => {
  const { Survival: _, ...skills } = PREGENS[0]!.build.skills!;
  const sergeant = { ...PREGENS[0]!.build, skills }; // Survival stays 1; Built Tough needs 2 (VoA p.46)
  const r = run(sergeant);
  const p = r.problems.find((x) => x.what.startsWith("Built Tough (granted)"));
  assert.equal(p?.severity, "gm");
  const ticked = run({ ...sergeant, gm: { ...sergeant.gm, approved: [p!.path!] } });
  assert.ok(!ticked.problems.some((x) => x.what.startsWith("Built Tough")));
});

test("a Chaos god's Keyword gives a Psyker its Discipline outside the limit; the other gods are barred (D&H pp.116, 118)", () => {
  const psyker = (god: string) =>
    run({ tier: 2, archetypeId: "sanctioned-psyker", gm: { keywords: ["CHAOS", god] }, powers: ["bolt-of-change"] });
  const barred = (r: ReturnType<typeof run>) =>
    r.problems.some((p) => p.what.startsWith("Bolt of Change is from a Discipline you can't learn"));
  const tzeentch = psyker("TZEENTCH");
  assert.ok(!barred(tzeentch));
  assert.ok(
    tzeentch.pending.some((p) => p.pick?.kind === "discipline"),
    "the species' one Discipline is still to choose",
  );
  assert.ok(barred(psyker("KHORNE")));
});

test("an archetype's own discipline is the Species' one choice under onlyDisciplines (rules-flow.md §11.62)", () => {
  const disciplinePicks = (r: ReturnType<typeof run>) => r.pending.filter((p) => p.pick?.kind === "discipline");
  assert.deepEqual(disciplinePicks(run({ tier: 3, archetypeId: "weirdboy" }, true)), []);
  const astropath = disciplinePicks(run({ tier: 2, archetypeId: "astropath" }, true));
  assert.deepEqual(
    astropath.map((p) => p.pick),
    [{ kind: "discipline", from: ["divination", "theosophamy"] }],
  );
  const navigator = run({ tier: 2, archetypeId: "navigator", powers: ["smite"] }, true);
  assert.ok(navigator.problems.some((p) => p.what.startsWith("Smite is from a Discipline you can't learn")));
});

test("homebrew records are refused unless the campaign allows them", () => {
  const apoc = catalogue.creation.archetypes.find((a) => a.source === "apocrypha")!;
  assert.ok(run({ tier: apoc.tier, archetypeId: apoc.id }).problems.some((p) => p.what.includes("is homebrew")));
  assert.ok(!run({ tier: apoc.tier, archetypeId: apoc.id }, true).problems.some((p) => p.what.includes("is homebrew")));
});

test("over budget is a problem (Core p.20)", () => {
  const r = run({ ...incursor, talents: [...incursor.talents!, { id: "furious-charge" }] });
  assert.ok(r.problems.some((p) => p.what === "19 XP over the budget of 400"));
});

// ── advancement: XP earned in play (issue #9 step 5) ──

const inPlay = (build: CharacterBuildInput, play: { tier: number; xpEarned: number; packageWaived?: boolean }) =>
  resolveBuild({ catalogue, build, play });

test("in play, purchases spend the XP earned, priced from where creation left the ratings (Core pp.24–25, 146)", () => {
  const r = inPlay(
    { ...incursor, advancement: { skills: { Stealth: 6 }, talents: [{ id: "furious-charge" }] } },
    { tier: 4, xpEarned: 40 },
  );
  assert.deepEqual(r.problems, []);
  assert.equal(r.spent, 399, "the creation budget is untouched");
  assert.deepEqual(r.advancement, { budget: 40, spent: 12 + 20, rank: 2, tier: 4 });
  assert.equal(r.sheet.skills.Stealth, 6);
});

// ── the purchase history (issue #32, §11.69) ──

test("the history dates the ledger and prices nothing (§11.69)", () => {
  const advancement = { skills: { Stealth: 6 }, talents: [{ id: "furious-charge" }], languages: ["glossia"] };
  const play = { tier: 4, xpEarned: 60 };
  const plain = inPlay({ ...incursor, advancement }, play);
  const keys = plain.ledger.filter((l) => l.pool).map((l) => l.key);
  assert.deepEqual(keys, ["advance/talent/furious-charge", "advance/skill/Stealth/6", "advance/language/glossia"]);
  // The same build with every purchase dated resolves to the same XP, the same rows and the same problems.
  const boughtIn = Object.fromEntries(keys.map((k, i) => [k, i + 1]));
  const dated = inPlay({ ...incursor, advancement: { ...advancement, boughtIn } }, play);
  assert.deepEqual(dated.advancement, plain.advancement);
  assert.deepEqual(dated.problems, plain.problems);
  assert.deepEqual(
    dated.ledger.map((l) => [l.what, l.xp]),
    plain.ledger.map((l) => [l.what, l.xp]),
  );
  assert.deepEqual(
    dated.ledger.filter((l) => l.pool).map((l) => l.session),
    [1, 2, 3],
  );
  // A date is not a creation choice, so a player may still save a build that gains one.
  assert.equal(
    creationKey(CharacterBuild.parse({ ...incursor, advancement })),
    creationKey(CharacterBuild.parse({ ...incursor, advancement: { ...advancement, boughtIn } })),
  );
});

test("a rating is one purchase per rating point, so a later raise keeps the earlier dates (§11.69)", () => {
  const six = inPlay({ ...incursor, advancement: { attributes: { S: 6 } } }, { tier: 4, xpEarned: 200 });
  const rows = six.ledger.filter((l) => l.pool);
  assert.deepEqual(
    rows.map((l) => [l.what, l.xp, l.key]),
    [["Strength 5 → 6", ATTRIBUTE_XP[6]! - ATTRIBUTE_XP[5]!, "advance/attribute/S/6"]],
  );
  const seven = inPlay({ ...incursor, advancement: { attributes: { S: 7 } } }, { tier: 4, xpEarned: 200 });
  const later = seven.ledger.filter((l) => l.pool);
  assert.deepEqual(
    later.map((l) => l.key),
    ["advance/attribute/S/6", "advance/attribute/S/7"],
  );
  // Split rows cost what the one row cost: the tables are cumulative.
  assert.equal(
    later.reduce((n, l) => n + l.xp, 0),
    ATTRIBUTE_XP[7]! - ATTRIBUTE_XP[5]!,
  );
  const skill = inPlay({ ...incursor, advancement: { skills: { Stealth: 7 } } }, { tier: 4, xpEarned: 200 });
  const skills = skill.ledger.filter((l) => l.pool);
  assert.deepEqual(
    skills.map((l) => l.key),
    ["advance/skill/Stealth/6", "advance/skill/Stealth/7"],
  );
  assert.equal(
    skills.reduce((n, l) => n + l.xp, 0),
    SKILL_XP[7]! - SKILL_XP[5]!,
  );
});

test("a Talent's bracket pick is part of its key, and an Archetype Ascension has a row to date (§11.69)", () => {
  const hatred = inPlay(
    { ...incursor, advancement: { talents: [{ id: "hatred", choice: "Orks" }] } },
    { tier: 4, xpEarned: 40 },
  );
  assert.equal(hatred.ledger.find((l) => l.pool)?.key, "advance/talent/hatred:Orks");
  const ascended = inPlay({ ...scout, advancement: toTactical }, { tier: 3, xpEarned: 200 });
  const row = ascended.ledger.find((l) => l.key === "advance/ascension/tactical-space-marine");
  assert.ok(row, "the Ascension is on the ledger, so the history can date it");
  assert.equal(row.xp, 0, "what it costs is the ratings bought to match (Core p.155)");
});

test("in play, spending more than was earned is a problem", () => {
  const r = inPlay({ ...incursor, advancement: { attributes: { S: 6 } } }, { tier: 4, xpEarned: 10 });
  assert.ok(r.problems.some((p) => p.what === "10 XP more than the 10 earned in play"));
});

test("Rank comes from the XP earned: +1 per 40, at most 3 (Core pp.146–147)", () => {
  const withAngel = { ...incursor, advancement: { talents: [{ id: "angel-of-death" }] } }; // Rank 2+ (Core p.129)
  assert.ok(inPlay(withAngel, { tier: 4, xpEarned: 39 }).problems.some((p) => p.what.includes("Rank 2")));
  assert.ok(!inPlay(withAngel, { tier: 4, xpEarned: 40 }).problems.some((p) => p.what.includes("Rank")));
});

test("an Ascension Package in play needs the group to have Ascended (rules-flow.md §11.55)", () => {
  const b = { ...incursor, advancement: { packages: ["back-from-the-brink"] } };
  assert.ok(inPlay(b, { tier: 4, xpEarned: 100 }).problems.some((p) => p.what.includes("there has been no Ascension")));
  const up = inPlay(b, { tier: 5, xpEarned: 100 });
  assert.ok(!up.problems.some((p) => p.what.includes("Ascension")));
  assert.equal(up.ledger.find((l) => l.pool && l.what.startsWith("Back From The Brink"))?.xp, 50, "10 × the new Tier");
});

test("each Ascension is asked for its own package, oldest first (Core p.148, §11.55)", () => {
  // A Tier-3 Tactical Space Marine whose group has Ascended twice, to Tier 5: `campaign.ascend` is one Tier a time.
  const marine: CharacterBuildInput = { ...PREGENS[0]!.build, tier: 3, packages: [] };
  const play = { tier: 5, xpEarned: 200 };
  const none = inPlay(marine, play);
  const asked = none.pending.find((p) => p.what.startsWith("Buy one Ascension Package"));
  assert.equal(asked?.what, "Buy one Ascension Package (Tier 3 → 4)", "the first Ascension's second step (Core p.148)");
  // It belongs to the ASCENSION screen, which is where the builder offers the choice; the path stays under `advance/`
  // because what a character buys in play is still theirs to change (creationKey).
  assert.deepEqual([asked?.step, asked?.path], ["ascension", "advance/ascension"]);

  const price = (r: ReturnType<typeof inPlay>, name: string) =>
    r.ledger.find((l) => l.pool && l.what.startsWith(name))?.xp;
  const one = inPlay({ ...marine, advancement: { packages: ["back-from-the-brink"] } }, play);
  assert.equal(price(one, "Back From The Brink"), 40, "10 × the Tier its Ascension reached, not the Tier now");
  assert.ok(
    one.pending.some((p) => p.what === "Buy one Ascension Package (Tier 4 → 5)"),
    "then the second",
  );

  const both = ["back-from-the-brink", "stay-the-course"];
  const two = inPlay({ ...marine, advancement: { packages: both } }, play);
  assert.equal(price(two, "Back From The Brink"), 40, "a later Ascension doesn't reprice an earlier package");
  assert.ok(!two.pending.some((p) => p.what.startsWith("Buy one Ascension Package")));
  assert.ok(!two.problems.some((p) => p.what.includes("each Ascension takes one")));

  const three = inPlay({ ...marine, advancement: { packages: [...both, "dauntless-reputation"] } }, play);
  assert.ok(
    three.problems.some((p) => p.what.includes("the group has Ascended 2 times since Tier 3")),
    "a third package for two Ascensions is refused",
  );
});

test("the GM may waive the Ascension Package on a Milestone Ascension (Core p.148 step 2)", () => {
  const marine: CharacterBuildInput = { ...PREGENS[0]!.build, tier: 3, packages: [] };
  const waived = inPlay(marine, { tier: 4, xpEarned: 100, packageWaived: true });
  assert.ok(!waived.pending.some((p) => p.what.startsWith("Buy one Ascension Package")));
  // The waive is the latest Ascension's: an earlier one still wants its package.
  const twice = inPlay(marine, { tier: 5, xpEarned: 200, packageWaived: true });
  assert.ok(twice.pending.some((p) => p.what === "Buy one Ascension Package (Tier 3 → 4)"));
  const paid = inPlay(
    { ...marine, advancement: { packages: ["back-from-the-brink"] } },
    {
      tier: 5,
      xpEarned: 200,
      packageWaived: true,
    },
  );
  assert.ok(!paid.pending.some((p) => p.what.startsWith("Buy one Ascension Package")));
});

// ── Archetype Ascension (Core p.155, rules-flow.md §11.67) ──

// The book's own example: a Space Marine Scout (Tier 2) becomes a Tactical Space Marine (Tier 3), both ADEPTUS ASTARTES.
const scout: CharacterBuildInput = {
  tier: 2,
  archetypeId: "space-marine-scout",
  fills: { "[CHAPTER]": { id: "ultramarines" } },
  background: {
    tableId: "adeptus-astartes",
    origin: "Courage",
    accomplishment: "Badge of Honour",
    goal: "Honour the Chapter",
    bonus: "origin",
  },
  languages: { picks: ["high-gothic"] }, // free with ADEPTUS ASTARTES (Core p.31)
  choices: {
    "species/adeptus-astartes/0": [0], // IMPERIUM, not CHAOS (Core p.29)
    "archetype/space-marine-scout/wargear/4": [0], // the Boltgun
  },
};
// What the Tactical Space Marine's ratings need over the Scout's, bought with the XP earned (Core p.155).
const toTactical = {
  archetypeAscension: { archetypeId: "tactical-space-marine" },
  attributes: { T: 5, A: 5, I: 5 },
  skills: { "Ballistic Skill": 5, "Weapon Skill": 4, Leadership: 1, Scholar: 1, Survival: 1 },
};

test("Archetype Ascension: the new Archetype's ratings must be bought, its abilities are granted (Core p.155)", () => {
  const r = inPlay({ ...scout, advancement: toTactical }, { tier: 3, xpEarned: 200 });
  const errors = r.problems.filter((p) => p.severity === "error").map((p) => p.what);
  assert.deepEqual(errors, [], "nothing short");
  assert.deepEqual(r.pending, []);
  // The GM's agreement is the one thing left, and the tick clears it.
  const gm = r.problems.find((p) => p.severity === "gm" && p.what.includes("Archetype Ascension"));
  assert.ok(gm, "the GM agrees to the new Archetype");
  const ticked = inPlay(
    { ...scout, advancement: toTactical, gm: { approved: [gm!.path!] } },
    { tier: 3, xpEarned: 200 },
  );
  assert.deepEqual(ticked.problems, []);
  assert.ok(
    ticked.sheet.abilities.some((a) => a.name === "Tactical Versatility"),
    "the new Archetype's ability",
  );
  assert.ok(
    ticked.sheet.abilities.some((a) => a.name === "Use the Terrain"),
    "and the old one's, which it keeps",
  );
  assert.equal(ticked.sheet.mods.influence, 1 + 2, "the Scout's Influence plus the Tactical Marine's (Core p.155)");
  assert.ok(
    ticked.sheet.weapons.some((w) => w.name === "Krak Grenade"),
    "the new Archetype's Wargear",
  );
  // Its Power Armour is the better suit, so it is the one worn and the Scout Armour falls to gear (Core p.231).
  assert.equal(ticked.sheet.armour.name, "Aquila Mk VII Power Armour");
  assert.equal(ticked.sheet.archetype, "Space Marine Scout + Tactical Space Marine");
  assert.equal(ticked.advancement?.tier, 3);
});

test("Archetype Ascension: ratings the character is short of are named (Core p.155)", () => {
  const r = inPlay(
    { ...scout, advancement: { ...toTactical, attributes: { T: 5, A: 5 }, skills: {} } },
    { tier: 3, xpEarned: 200 },
  );
  const short = r.problems.find((p) => p.what.startsWith("Tactical Space Marine needs"));
  assert.ok(short, "the shortfall is a problem");
  for (const want of ["Initiative 4 of 5", "Ballistic Skill 3 of 5", "Survival 0 of 1"])
    assert.ok(short!.what.includes(want), `${want} in "${short!.what}"`);
  // It has to reach the screen that offers the Ascension, or the player is refused with the reason on another tab.
  assert.equal(short!.step, "ascension");
  assert.ok(
    r.problems.filter((p) => p.what.includes("Tactical Space Marine")).every((p) => p.step === "ascension"),
    "every Archetype Ascension problem is the ASCENSION screen's",
  );
});

test("Archetype Ascension: Rank 3, the same Faction, the new Tier, and not both ways at once", () => {
  const at = { tier: 3, xpEarned: 200 };
  assert.ok(
    inPlay({ ...scout, advancement: toTactical }, { ...at, xpEarned: 79 }).problems.some((p) =>
      p.what.startsWith("Archetype Ascension needs Rank 3"),
    ),
    "Rank 3 is 80 XP earned (Core p.146)",
  );
  assert.ok(
    inPlay(
      { ...scout, advancement: { ...toTactical, archetypeAscension: { archetypeId: "ork-nob" } } },
      at,
    ).problems.some((p) => p.what.includes("is not an Archetype of Space Marine Scout's Faction")),
    "the same factionId (§11.67)",
  );
  // The Archetype is a Tier the group Ascended to, not past it.
  assert.ok(
    inPlay(
      { ...scout, advancement: { ...toTactical, archetypeAscension: { archetypeId: "primaris-intercessor" } } },
      at,
    ).problems.some((p) => p.what.includes("is Tier 4, not a Tier the group Ascended to (3–3)")),
  );
  // One Ascension takes a package or an Archetype Ascension, not both.
  assert.ok(
    inPlay({ ...scout, advancement: { ...toTactical, packages: ["back-from-the-brink"] } }, at).problems.some((p) =>
      p.what.includes("each Ascension takes one Ascension Package or an Archetype Ascension"),
    ),
  );
  assert.ok(
    !inPlay({ ...scout, advancement: toTactical }, at).pending.some((p) =>
      p.what.startsWith("Buy one Ascension Package"),
    ),
    "an Archetype Ascension is the Ascension's second step (Core p.148)",
  );
});

test("Archetype Ascension: the next group Ascension keeps it, and asks for that Ascension's package", () => {
  // Taken at Tier 3; the group then Ascends to Tier 4 (Core pp.148, 155).
  const later = inPlay({ ...scout, advancement: toTactical }, { tier: 4, xpEarned: 300 });
  assert.ok(!later.problems.some((p) => p.severity === "error" && p.what.includes("Tactical Space Marine is Tier")));
  assert.ok(later.pending.some((p) => p.what === "Buy one Ascension Package (Tier 3 → 4)"));
  const paid = inPlay(
    { ...scout, advancement: { ...toTactical, packages: ["back-from-the-brink"] } },
    { tier: 4, xpEarned: 300 },
  );
  assert.ok(!paid.problems.some((p) => p.what.includes("each Ascension takes one")));
  assert.ok(!paid.pending.some((p) => p.what.startsWith("Buy one Ascension Package")));
});

test("keepPlay: a rebuild in play keeps Wealth, Ammo and what play added; the new build's items join", () => {
  const previous = { ...PREGENS[1]!.build };
  const before = resolveBuild({ catalogue, build: previous }).sheet;
  const played = {
    ...before,
    wealth: 1,
    ammo: { Bolt: 2 },
    weapons: [
      ...before.weapons,
      { name: "Looted Choppa", damage: 4, ed: 1, range: [1], traits: [], addStrength: true },
    ],
  };
  const next = inPlay({ ...previous, advancement: { packages: [] } }, { tier: 4, xpEarned: 0 }).sheet;
  const kept = keepPlay({ previous: played, next });
  assert.equal(kept.wealth, 1);
  assert.deepEqual(kept.ammo, { Bolt: 2 });
  assert.ok(kept.weapons.some((w) => w.name === "Looted Choppa"));
  assert.equal(kept.weapons.length, played.weapons.length, "nothing doubled");
});

test("a write-in where the keyword allows none waits for the GM's tick (rules-flow.md §11.25)", () => {
  const b = { ...incursor, fills: { "[CHAPTER]": { writeIn: "RED SCORPIONS" } } };
  const asked = run(b).problems.find((p) => p.path === "fill/chapter");
  assert.equal(asked?.severity, "gm");
  const ticked = run({ ...b, gm: { ...b.gm, approved: ["fill/chapter"] } });
  assert.ok(!ticked.problems.some((p) => p.path === "fill/chapter"));
  assert.ok(ticked.sheet.keywords.includes("RED SCORPIONS"));
});

test("the GM's bonuses add to the build's (gm.mods, rules-flow.md §11.22)", () => {
  const base = run(incursor).sheet.mods;
  const more = run({ ...incursor, gm: { ...incursor.gm, mods: { resolve: 2, defence: 1 } } }).sheet.mods;
  assert.equal(more.resolve, (base.resolve ?? 0) + 2);
  assert.equal(more.defence, (base.defence ?? 0) + 1);
});

test("Ever Vigilant's Passive Awareness reaches the sheet's number, scaled by Rank (Core p.133)", () => {
  const vigilant = { ...incursor, advancement: { talents: [{ id: "ever-vigilant" }] } };
  const base = inPlay(incursor, { tier: 4, xpEarned: 80 }).sheet;
  const sheet = inPlay(vigilant, { tier: 4, xpEarned: 80 }).sheet; // Rank 3
  assert.equal(sheet.mods.passiveAwareness, 6);
  const pa = (s: typeof sheet) => deriveStats({ stats: s, overrides: {}, tier: 4 }).passiveAwareness;
  assert.equal(pa(sheet), pa(base) + 6);
});

test("a granted Talent with options asks for one; a bought one must be one of them (Acute Sense, Core p.129)", () => {
  const wolf = PREGENS.find((p) => p.name === "Aegis")!.build;
  const path = "subfaction/space-wolves/huntersunleashed/0/choice";
  const { [path]: _, ...unpicked } = wolf.choices;
  const asked = run({ ...wolf, choices: unpicked }, true);
  assert.deepEqual(
    asked.pending.map((p) => p.what),
    ["Acute Sense: choose one"],
  );
  assert.ok(run(wolf, true).sheet.talents.some((t) => t.name === "Acute Sense (smell)"));
  const bought = (choice?: string) =>
    run({ ...incursor, talents: [...(incursor.talents ?? []), { id: "acute-sense", choice }] }).problems.map(
      (p) => p.what,
    );
  assert.ok(bought("smell").every((w) => !w.startsWith("Acute Sense")));
  assert.ok(bought("smel").includes("Acute Sense: choose one of sight, hearing, smell, taste, touch"));
  assert.ok(bought().includes("Acute Sense: choose what it applies to"));
});

test("keepPlay with before: printed lines stay, and only what the new build adds over the stored one joins them", () => {
  const stored = resolveBuild({ catalogue, build: incursor }).sheet;
  const printed = { ...stored, weapons: stored.weapons.map((w) => ({ ...w, name: `${w.name} (printed)` })) };
  const knife = { name: "Looted Choppa", damage: 4, ed: 1, range: [1], traits: [], addStrength: true };
  const next = { ...stored, weapons: [...stored.weapons, knife], gear: [...stored.gear, "Grav-Chute"] };
  const kept = keepPlay({ previous: printed, next, before: stored });
  assert.deepEqual(
    kept.weapons.map((w) => w.name),
    [...printed.weapons.map((w) => w.name), "Looted Choppa"],
  );
  assert.ok(kept.gear.includes("Grav-Chute"));
});

test("Mk X Phobos's +1 Speed follows the suit worn (VoA p.72)", () => {
  const phobos = resolveBuild({ catalogue, build: incursor }).sheet; // the Disruptor wears Mk X Phobos
  assert.ok(phobos.armour.traits.includes("+1 M"));
  const tacticus = { name: "Mk X Tacticus", ar: 5, invulnerable: false, powered: 4, traits: [] };
  const kept = keepPlay({ previous: { ...phobos, armour: tacticus }, next: phobos, before: phobos });
  assert.equal(kept.armour.name, "Mk X Tacticus");
  assert.equal(kept.mods.speed ?? 0, (phobos.mods.speed ?? 0) - 1);
});

// Issue #15 step 2: an upgrade's `fits` is the printed compatibility line, so the filter has to say what the book says.
// These three fields exist because a keyword list alone read every printed "and" as an "or" (rules-flow.md §11.64).
test("wargearMatches: an upgrade's fit is as narrow as the book prints it", () => {
  const at = { tier: 4, newTier: 4 };
  // The M40 fits "any weapon with the BOLT and ADEPTUS ASTARTES Keywords" (VoA p.68): both, not either.
  const m40 = wargear.get("voa-m40-targeting-system")!.upgrade!.fits;
  const carbine = wargear.get("apoc-bolt-carbine")!;
  assert.ok(wargearMatches(carbine, m40, at), "BOLT and ADEPTUS ASTARTES");
  assert.ok(!wargearMatches({ ...carbine, keywords: ["BOLT"] }, m40, at), "BOLT alone");
  assert.ok(!wargearMatches({ ...carbine, keywords: ["ADEPTUS ASTARTES"] }, m40, at), "ADEPTUS ASTARTES alone");
  // Core's own Boltgun is BOLT, IMPERIUM: an Astartes weapon by use, not by Keyword, so the M40 doesn't fit it.
  assert.ok(!wargearMatches(wargear.get("boltgun")!, m40, at));

  // "a weapon that does not have the Heavy Trait" (Core p.228). The rating is printed; the filter names the Trait.
  const brake = wargear.get("percussive-muzzle-brake")!.upgrade!.fits;
  const heavy = { ...carbine, weapon: { ...carbine.weapon!, traits: ["Heavy (5)"] } };
  assert.ok(wargearMatches(carbine, brake, at));
  assert.ok(!wargearMatches(heavy, brake, at), "Heavy (5) is the Heavy Trait");

  // The Anti-Grav Platform is the other way round: it fits only what has Heavy (IoE p.95).
  const platform = wargear.get("ioe-anti-grav-platform")!.upgrade!.fits;
  assert.ok(wargearMatches(heavy, platform, at));
  assert.ok(!wargearMatches(carbine, platform, at));
});

// Issue #15 step 3: a fitted upgrade changes the profile the sheet shows (Core pp.227–228), and the base stays stored.
test("applyUpgrades: the fitted profile, with what only the GM can apply printed under it", () => {
  const carbine = wargear.get("apoc-bolt-carbine")!;
  const base = sheetWeapon(carbine as { name: string; weapon: WargearWeapon }, 4);
  assert.ok(
    base.traits.some((t) => t.startsWith("Rapid Fire")),
    "the carbine is Rapid Fire (2)",
  );

  // Mastercrafted: "gains the Reliable Trait. You gain +2 bonus dice to any Attack Test" (Core p.228).
  const was = [...base.traits];
  const mc = applyUpgrades(base, [wargear.get("mastercrafted")!]);
  assert.ok(mc.weapon.traits.includes("Reliable"));
  assert.ok(mc.notes.some((n) => n.includes("2 bonus dice")));
  assert.deepEqual(base.traits, was, "the base weapon is untouched: the sheet derives, it doesn't rewrite");
  // The carbine prints Reliable already, so the Trait isn't carried twice.
  assert.equal(mc.weapon.traits.filter((t) => t === "Reliable").length, 1);

  // The M40 moves a rating the weapon already has, rather than removing the Trait (VoA p.68).
  const m40 = applyUpgrades(base, [wargear.get("voa-m40-targeting-system")!]);
  assert.ok(m40.weapon.traits.includes("Sniper (2)"));
  // The carbine is Rapid Fire (1); −1 leaves an inert Trait, so it comes off rather than printing "Rapid Fire (0)".
  assert.ok(!m40.weapon.traits.some((t) => t.startsWith("Rapid Fire")));
  assert.equal(m40.weapon.salvo, (base.salvo ?? 0) - 1);

  // Folding Stock: the Pistol Trait goes, and each range band moves by its own amount (Apocrypha p.388).
  const pistol = wargear.get("bolt-pistol")!;
  const stock = applyUpgrades(sheetWeapon(pistol as { name: string; weapon: WargearWeapon }, 4), [
    wargear.get("apoc-folding-stock")!,
  ]);
  assert.ok(!stock.weapon.traits.some((t) => t.startsWith("Pistol")));
  assert.deepEqual(
    stock.weapon.range,
    pistol.weapon!.range!.map((r, i) => r + [3, 6, 9][i]!),
  );
});

test("upgradeRefusal: three at most, one of each slot, Distinction exempt (Core pp.227–228)", () => {
  const at = { tier: 4, newTier: 4 };
  const matches = (w: Parameters<typeof wargearMatches>[0], f: Parameters<typeof wargearMatches>[1]) =>
    wargearMatches(w, f, at);
  const carbine = wargear.get("apoc-bolt-carbine")!;
  const sight = wargear.get("magnocular-scope")!;
  const scope2 = wargear.get("red-dot-sight")!;
  const brake = wargear.get("percussive-muzzle-brake")!;
  const drum = wargear.get("ammo-drum")!;
  const distinction = wargear.get("distinction")!;
  const fit = (upgrade: typeof sight, fitted: (typeof sight)[]) =>
    upgradeRefusal({ upgrade, item: carbine, fitted, matches });

  assert.equal(fit(sight, []), null);
  assert.match(fit(sight, [sight])!, /already has/, "the same upgrade twice");
  assert.match(fit(scope2, [sight])!, /already has a sight/, "two scopes (Core p.227)");
  assert.equal(fit(brake, [sight, drum]), null, "different slots");
  assert.match(fit(brake, [sight, drum, wargear.get("bayonet-lug")!])!, /3 upgrades/, "the maximum");
  // Distinction doesn't count toward the maximum (Core p.228), so it still goes on a full weapon.
  assert.equal(fit(distinction, [sight, drum, wargear.get("bayonet-lug")!]), null);
  // An armour upgrade doesn't fit a weapon.
  assert.match(fit(wargear.get("voa-adamantine-cuirass")!, [])!, /doesn't fit/);
});

test("keepPlay: a rebuild keeps what was fitted in play and takes the build's own upgrades again", () => {
  const previous = { ...PREGENS[1]!.build };
  const before = resolveBuild({ catalogue, build: previous }).sheet;
  const gun = before.weapons[0]!;
  const played = {
    ...before,
    weapons: before.weapons.with(0, {
      ...gun,
      wargearId: gun.wargearId ?? "x",
      fitted: ["magnocular-scope"], // fitted at the table
      upgrades: ["mastercrafted"], // pretend the old build gave it one, and the new build doesn't
    }),
  };
  const next = inPlay({ ...previous, advancement: { packages: [] } }, { tier: 4, xpEarned: 0 }).sheet;
  const kept = keepPlay({ previous: played, next });
  assert.deepEqual(kept.weapons[0]!.fitted, ["magnocular-scope"], "fitted in play, kept through a rebuild");
  assert.deepEqual(
    kept.weapons[0]!.upgrades,
    next.weapons[0]!.upgrades,
    "the build's upgrades come from the new build, so dropping one in the builder drops it here",
  );

  // A weapon the build no longer gives keeps its build upgrades as the build's: moved to `fitted`, removeUpgrade could
  // turn one into a gear line, and a rebuild that gives the weapon back would apply it twice.
  const looted = {
    name: "Looted Choppa",
    damage: 4,
    ed: 1,
    range: [1],
    traits: [],
    addStrength: true,
    upgrades: ["mastercrafted"],
  };
  const withLoot = keepPlay({ previous: { ...played, weapons: [...played.weapons, looted] }, next });
  const back = withLoot.weapons.find((w) => w.name === "Looted Choppa")!;
  assert.deepEqual([back.upgrades, back.fitted], [["mastercrafted"], undefined]);

  // Toggled back on, the build's id isn't also counted as fitted.
  const twice = keepPlay({
    previous: { ...played, weapons: played.weapons.with(0, { ...played.weapons[0]!, fitted: ["mastercrafted"] }) },
    next: { ...next, weapons: next.weapons.with(0, { ...next.weapons[0]!, upgrades: ["mastercrafted"] }) },
  });
  assert.deepEqual([twice.weapons[0]!.upgrades, twice.weapons[0]!.fitted], [["mastercrafted"], undefined]);

  // A requisitioned copy of a build weapon is its own: the build's upgrades stay on the build's one.
  const copy = { ...next.weapons[0]!, name: `${next.weapons[0]!.name} (requisitioned)`, upgrades: undefined };
  const built = { ...next.weapons[0]!, upgrades: ["mastercrafted"] };
  const pair = keepPlay({
    previous: { ...played, weapons: [built, copy] },
    next: { ...next, weapons: [built] },
  });
  assert.deepEqual(
    pair.weapons.map((w) => w.upgrades),
    [["mastercrafted"], undefined],
  );
});

test("withUpgrades: derives the shown sheet, and applying it twice changes nothing more (#15 step 3)", () => {
  const carbine = wargear.get("apoc-bolt-carbine")!;
  const stored = {
    weapons: [
      {
        ...sheetWeapon(carbine as { name: string; weapon: WargearWeapon }, 4),
        wargearId: "apoc-bolt-carbine",
        fitted: ["apoc-darkstar-weapon"], // damage +2, ED +1: a numeric mod, so double-applying would show
      },
    ],
  };
  const shown = withUpgrades(stored, wargear);
  const w = shown.weapons[0]!;
  assert.equal(w.damage, stored.weapons[0]!.damage + 2);
  assert.equal(w.ed, (stored.weapons[0]!.ed as number) + 1);
  assert.deepEqual(w.upgradeNames, ["Darkstar Weapon"]);
  assert.ok(w.notes?.length, "the prose the GM applies");
  // The stored sheet is untouched, so deriving from it again gives the same answer rather than compounding.
  assert.deepEqual(withUpgrades(stored, wargear).weapons[0], w, "derive is idempotent on the stored sheet");
  assert.equal(stored.weapons[0]!.damage, carbine.weapon!.damage, "nothing was written back onto the base");
});

// ── upgrades on armour (issue #32 item 3, §11.65) ──

test("withUpgrades: a suit's upgrades reach its AR and Traits, and Resilience with them (§11.65)", () => {
  const cuirass = wargear.get("voa-adamantine-cuirass")!;
  const suit = wargear.get("voa-mk-vii-aquila-armour")!; // POWERED, ADEPTUS ASTARTES: what the Cuirass fits (VoA p.73)
  const stored: { weapons: []; armour: SheetArmourLike & { name: string } } = {
    weapons: [],
    armour: {
      name: suit.name,
      ...suit.armour!,
      wargearId: suit.id,
      fitted: ["voa-adamantine-cuirass"], // +1 AR and Bulk (1), VoA p.73
    },
  };
  const shown = withUpgrades(stored, wargear).armour!;
  assert.equal(shown.ar, suit.armour!.ar + 1);
  assert.ok(shown.traits.includes("Bulk (1)"));
  assert.deepEqual(shown.upgradeNames, [cuirass.name]);
  assert.ok(
    shown.notes?.some((n) => n.includes("Flight Speed")),
    "the prose the GM applies",
  );
  assert.equal(stored.armour.ar, suit.armour!.ar, "nothing was written back onto the stored suit");
  assert.deepEqual(withUpgrades(stored, wargear).armour, shown, "derive is idempotent on the stored sheet");

  // Resilience counts the AR as worn (Core p.231), so the server's damage math has to read the derived sheet.
  const sheet = resolveBuild({ catalogue, build: PREGENS[1]!.build }).sheet;
  const base = deriveStats({ stats: sheet, overrides: {}, tier: 4 });
  const upgraded = deriveStats({
    stats: withUpgrades({ ...sheet, armour: { ...sheet.armour, fitted: ["voa-adamantine-cuirass"] } }, wargear),
    overrides: {},
    tier: 4,
  });
  assert.equal(upgraded.resilience, base.resilience + 1);
});

test("upgradeRefusal: armour takes the weapon's cap, and a slot may differ by host (§11.64–§11.65)", () => {
  const at = { tier: 4, newTier: 4 };
  const matches = (w: Parameters<typeof wargearMatches>[0], f: Parameters<typeof wargearMatches>[1]) =>
    wargearMatches(w, f, at);
  // A T'au battlesuit: ten SUPPORT SYSTEM entries share `system`, and all are armour's (Apocrypha pp.445–447).
  const suit = [...wargear.values()].find(
    (w) => w.armour && w.keywords.includes("BATTLESUIT") && w.keywords.includes("T'AU EMPIRE"),
  )!;
  const systems = [
    "apoc-target-lock",
    "apoc-multi-tracker",
    "apoc-velocity-tracker",
    "apoc-early-warning-override",
  ].map((id) => wargear.get(id)!);
  const fit = (upgrade: Wargear, fitted: Wargear[]) =>
    upgradeRefusal({ upgrade, item: suit, fitted, matches, host: "armour" });
  // SUPPORT SYSTEM is exempt from one-per-slot (§11.64), so two coexist …
  assert.equal(fit(systems[1]!, [systems[0]!]), null);
  // … and still spend the three the GM's ruling gives a suit (§11.65).
  assert.match(fit(systems[3]!, systems.slice(0, 3))!, /3 upgrades/);

  // One crest, as the Teleport Crest's own rule says (Apocrypha p.444).
  const votann = [...wargear.values()].find((w) => w.armour && w.keywords.includes("LEAGUES OF VOTANN"))!;
  const crest = wargear.get("apoc-teleport-crest")!;
  const other = { ...crest, id: "test-second-crest", name: "Weavefield Crest" };
  assert.match(
    upgradeRefusal({ upgrade: other, item: votann, fitted: [crest], matches, host: "armour" })!,
    /already has a crest/,
  );

  // The Suspensor Crystal is a `mount` on a weapon and a `system` in armour, one entry either way (IoE p.95).
  const crystal = wargear.get("ioe-anti-gravitic-suspensor-crystal")!;
  assert.equal(slotOf(crystal.upgrade!, "weapon"), "mount");
  assert.equal(slotOf(crystal.upgrade!, "armour"), "system");
  // So in armour it takes the `system` slot (the T'au's ten are exempt from one-per-slot, so a second system of its own
  // kind is what collides), and on a weapon it collides with a weapon's mount, not with either host's other slot.
  const otherSystem = { ...crystal, id: "test-other-system", name: "Another System" };
  assert.match(
    upgradeRefusal({ upgrade: crystal, item: suit, fitted: [otherSystem], matches: () => true, host: "armour" })!,
    /already has a system/,
  );
  const heavy = wargear.get("apoc-bolt-carbine")!;
  assert.match(
    upgradeRefusal({
      upgrade: crystal,
      item: heavy,
      fitted: [wargear.get("ioe-anti-grav-platform")!],
      matches: () => true,
    })!,
    /already has a mount/,
  );

  // Chains, Blades and Hooks goes on three times, its own limit beating one-per-`plate` (IoE p.96).
  const chains = wargear.get("ioe-chains-blades-and-hooks")!;
  const kabalite = [...wargear.values()].find((w) => w.armour && w.keywords.includes("DRUKHARI"))!;
  const onChains = (fitted: Wargear[]) =>
    upgradeRefusal({ upgrade: chains, item: kabalite, fitted, matches: () => true, host: "armour" });
  assert.equal(onChains([chains, chains]), null);
  assert.match(onChains([chains, chains, chains])!, /at most 3 times/);
});

test("keepPlay: a suit keeps what was fitted to it in play, and loses it when the suit changes (§11.65)", () => {
  const previous = { ...PREGENS[1]!.build };
  const before = resolveBuild({ catalogue, build: previous }).sheet;
  const played = { ...before, armour: { ...before.armour, fitted: ["voa-adamantine-cuirass"] } };
  const next = inPlay({ ...previous, advancement: { packages: [] } }, { tier: 4, xpEarned: 0 }).sheet;
  assert.deepEqual(keepPlay({ previous: played, next }).armour.fitted, ["voa-adamantine-cuirass"]);
  // A suit printed on a hand-made sheet (issue #18) takes the build's catalogue id, or nothing could be fitted to it.
  const printed = { ...played, armour: { ...played.armour, wargearId: undefined, fitted: undefined } };
  assert.equal(keepPlay({ previous: printed, next }).armour.wargearId, next.armour.wargearId);
  // A better suit from a rebuild is worn instead, and what was bolted to the old one doesn't follow it.
  const heavier = { ...next, armour: { ...next.armour, name: "Mk X Gravis Armour", ar: next.armour.ar + 2 } };
  assert.equal(keepPlay({ previous: played, next: heavier }).armour.fitted, undefined);
});

test("applyUpgrades: a change a profile can't hold is printed, never silently dropped", () => {
  // Percussive Muzzle Brake is +1 Salvo; 68 catalogue weapons print Salvo "–", which has no track to add to (p.207).
  const brake = wargear.get("percussive-muzzle-brake")!;
  const noSalvo = { name: "Test", damage: 5, ed: 1, range: [10], salvo: null, traits: [] };
  const r = applyUpgrades(noSalvo, [brake]);
  assert.equal(r.weapon.salvo, null, "no track is invented");
  assert.ok(
    r.notes.some((n) => n.includes("Salvo +1")),
    "the GM is told instead",
  );

  // AP is a penalty, so it never rises above 0, and a weapon with no AP that gains none keeps none (Weapon.ap).
  const up = { ...brake, upgrade: { ...brake.upgrade!, mods: [{ kind: "ap" as const, delta: 2 }] } };
  assert.equal(applyUpgrades({ ...noSalvo, ap: -1 }, [up]).weapon.ap, 0);
  assert.equal(applyUpgrades(noSalvo, [up]).weapon.ap, undefined, "no AP printed, none gained");
});

// ── standing weapon effects (rules-flow.md §11.68) ──

const shown = (name: string, rank = 1) => {
  const p = PREGENS.find((x) => x.name === name)!;
  const sheet = resolveBuild({ catalogue: { ...catalogue, homebrew: true }, build: p.build }).sheet;
  return withWeaponEffects(withUpgrades(sheet, wargear), { rank, catalogue: wargear });
};
const line = (sheet: ReturnType<typeof shown>, name: string) => sheet.weapons.find((w) => w.name === name)!;

test("Bolter Discipline: BOLT weapons gain Rapid Fire (2), or +Rank on the one they have (VoA p.45)", () => {
  const sergeant = shown("Watch Sergeant");
  assert.ok(line(sergeant, "Boltgun").traits.includes("Rapid Fire (3)"), "Rapid Fire (2) + Rank 1");
  assert.deepEqual(line(sergeant, "Boltgun").effects, ["Bolter Discipline"]);
  assert.ok(!line(sergeant, "Power Sword").effects, "a Power Sword isn't BOLT");
  const disruptor = shown("Disruptor");
  assert.ok(line(disruptor, "Bolt Pistol").traits.includes("Rapid Fire (2)"), "gained, at 2");
  // At Rank 3 the same build's Boltgun shows Rapid Fire (5): the Rank is read, not stored.
  assert.ok(line(shown("Watch Sergeant", 3), "Boltgun").traits.includes("Rapid Fire (5)"));
});

test("Trademark Weapon reaches only the weapon its choice names (Core p.141)", () => {
  const marksman = shown("Marksman");
  assert.equal(line(marksman, "Bolt Sniper Rifle").ed, 3, "1 + Double Rank");
  assert.ok(!line(marksman, "Bolt Pistol").effects);
});

test("a Doctrine's +Rank AP reaches the weapon it granted, and nothing once the GM swaps it out (VoA p.35)", () => {
  const hordeSlayer = shown("Horde Slayer");
  assert.equal(line(hordeSlayer, "Heavy Bolter").ap, -2, "−1 and Rank 1 more");
  assert.equal(line(hordeSlayer, "Bolt Rifle").ap, -1, "not the Doctrine's weapon");
  const bombard = shown("Bombard"); // the Heavy Bolter became the Frag Cannon (a GM choice)
  assert.ok(bombard.weapons.every((w) => !w.effects?.includes("Heavy Intercessor Doctrine")));
});

test("Explosive Fury: +Rank ED on grenades, none on smoke, which deals no damage (VoA p.33)", () => {
  const disruptor = shown("Disruptor");
  assert.equal(line(disruptor, "Frag Grenade").ed, 5);
  assert.equal(line(disruptor, "Krak Grenade").ed, 6);
  // The fixture keeps the GM's deployed smoke as written, so the catalogue's is added here to be sure.
  const entry = wargear.get("apoc-smoke-grenades")!;
  const p = PREGENS.find((x) => x.name === "Disruptor")!;
  const sheet = resolveBuild({ catalogue: { ...catalogue, homebrew: true }, build: p.build }).sheet;
  const withSmoke = {
    ...sheet,
    weapons: [
      ...sheet.weapons,
      { ...sheetWeapon({ name: entry.name, weapon: entry.weapon! }, 5), wargearId: entry.id },
    ],
  };
  const smoke = withWeaponEffects(withSmoke, { rank: 1, catalogue: wargear }).weapons.find((w) => w.damage === 0);
  assert.ok(smoke && !smoke.effects, "a Damage 0 grenade is left alone");
});

test("a weapon not from the catalogue is left as written: it may already count the Talent", () => {
  const sheet = resolveBuild({ catalogue: { ...catalogue, homebrew: true }, build: PREGENS[0]!.build }).sheet;
  const written = { ...sheet, weapons: sheet.weapons.map(({ wargearId: _, ...w }) => w) };
  const out = withWeaponEffects(written, { rank: 1, catalogue: wargear });
  assert.deepEqual(out.weapons, written.weapons);
});

test("a printed line a rebuild tags with its catalogue entry isn't given its Talents again (rules-flow.md §11.68)", () => {
  // A campaign seeded before #27 keeps the printed lines, which count Bolter Discipline already: Rapid Fire (3).
  const p = PREGENS.find((x) => x.name === "Watch Sergeant")!;
  const next = resolveBuild({ catalogue: { ...catalogue, homebrew: true }, build: p.build }).sheet;
  const rebuilt = keepPlay({ previous: p.want, next, before: next }); // a rebuild before the #27 migration ran
  const boltgun = rebuilt.weapons.find((w) => w.name === "Boltgun")!;
  assert.ok(boltgun.wargearId && boltgun.asPrinted, "tagged, and marked as printed");
  const shown = withWeaponEffects(rebuilt, { rank: 1, catalogue: wargear });
  assert.ok(shown.weapons.find((w) => w.name === "Boltgun")!.traits.includes("Rapid Fire (3)"), "not (4)");
});

test("keepSheetWeapons: the build's lines, with play's fitted upgrades and second copies, and the GM's own lines", () => {
  const sheet = resolveBuild({ catalogue: { ...catalogue, homebrew: true }, build: PREGENS[0]!.build }).sheet;
  const boltgun = sheet.weapons.find((w) => w.name === "Boltgun")!;
  const old = [
    { ...boltgun, traits: ["Brutal", "Rapid Fire (3)"], wargearId: undefined, fitted: ["red-dot-sight"] }, // printed
    { ...boltgun, wargearId: undefined }, // a second Boltgun, requisitioned
    { name: "Haywire Mine", damage: 14, ed: 5, ap: -2, range: [1], traits: ["Placed"], addStrength: false },
  ];
  const kept = keepSheetWeapons(old, sheet.weapons);
  const boltguns = kept.filter((w) => w.name === "Boltgun");
  assert.equal(boltguns.length, 2, "the build's and the requisitioned copy");
  assert.equal(boltguns[0]!.wargearId, "boltgun", "the build's line, not the printed one");
  assert.deepEqual(boltguns[0]!.fitted, ["red-dot-sight"], "what was fitted at the table stays");
  assert.ok(
    kept.some((w) => w.name === "Haywire Mine"),
    "a GM's own line stays",
  );
});

test("a melee weapon printed Damage 0 deals Strength, so it takes a Talent's +Damage (rules-flow.md §11.68)", () => {
  const caress = wargear.get("ioe-harlequins-caress")!; // S + 0
  const stats = {
    weapons: [{ ...sheetWeapon({ name: caress.name, weapon: caress.weapon! }, 5), wargearId: caress.id }],
    weaponEffects: [
      {
        source: "Crushing Blow",
        fits: { weapon: "melee" as const },
        mods: [{ kind: "damage" as const, delta: { perRank: 2 } }],
      },
    ],
  };
  assert.equal(withWeaponEffects(stats, { rank: 1, catalogue: wargear }).weapons[0]!.damage, 2);
});

test("withUpgrades: a given relic's Powers apply like an upgrade's, after the fitted ones (rules-flow.md §11.116)", () => {
  const pistol = sheetWeapon(wargear.get("bolt-pistol") as { name: string; weapon: WargearWeapon }, 4);
  const relic = {
    ...pistol,
    wargearId: "bolt-pistol",
    fitted: ["mastercrafted"],
    mods: [
      { kind: "damage" as const, delta: 1 },
      { kind: "gm" as const, what: "[power]" },
    ],
  };
  const [shown] = withUpgrades({ weapons: [relic] }, wargear).weapons;
  assert.equal(shown!.damage, pistol.damage + 1);
  assert.ok(shown!.traits.includes("Reliable"), "the fitted upgrade still applies");
  assert.ok(shown!.notes?.includes("[power]"), "prose is printed for the GM");
  assert.deepEqual(relic.mods.length, 2, "the stored line keeps its Powers, so nothing applies twice");
  const [bare] = withUpgrades({ weapons: [{ ...pistol, mods: [{ kind: "ed" as const, delta: 2 }] }] }, wargear).weapons;
  assert.equal(bare!.ed, (pistol.ed as number) + 2, "Powers apply with nothing fitted too");
});

// ── Advanced Character Creation (Core pp.38–39, rules-flow.md §11.126–133) ──

// The worked example on Core p.39: a Tier 1 Human with no Archetype.
const worked: CharacterBuildInput = {
  tier: 1,
  advanced: {},
  speciesId: "human",
  attributes: { A: 4, Fel: 3, T: 2, I: 2, Int: 2 },
  skills: { Pilot: 2, "Ballistic Skill": 2, Awareness: 1, Cunning: 1, "Weapon Skill": 1 },
  talents: [{ id: "jargon", choice: "Pilot" }, { id: "scum-savvy" }],
};

test("Advanced Creation prices the Core p.39 worked example from scratch, with the Tier × 10 bonus on top", () => {
  const r = run(worked);
  const cost = (what: string) => r.ledger.find((l) => l.what === what)?.xp;
  assert.equal(cost("Agility 1 → 4"), 20);
  assert.equal(cost("Pilot 0 → 2"), 6);
  assert.equal(cost("Fellowship 1 → 3"), 10);
  for (const a of ["Toughness", "Initiative", "Intellect"]) assert.equal(cost(`${a} 1 → 2`), 4, a);
  assert.equal(cost("Ballistic Skill 0 → 2"), 6);
  for (const k of ["Awareness", "Cunning", "Weapon Skill"]) assert.equal(cost(`${k} 0 → 1`), 2, k);
  assert.equal(cost("Human (species)"), 0, "the Human species adds nothing to the printed 100 XP");
  assert.equal(r.spent, 100, "the book's total");
  assert.equal(r.budget, 110, "Tier 1's 100 XP and the Advanced bonus; the book leaves the 10 unspent");
  assert.equal(r.sheet.archetype, "Advanced");
  assert.ok(!r.problems.some((p) => p.severity === "error"), JSON.stringify(r.problems));
});

test("Advanced Creation asks for a species, offering them all, and refuses neither or both of archetype and advanced", () => {
  const r = run({ tier: 1, advanced: {} });
  const ask = r.pending.find((p) => p.what === "Choose a species");
  assert.ok(ask && ask.options.includes("Human") && ask.options.includes("Ork"));
  assert.ok(!CharacterBuild.safeParse({ tier: 1 }).success, "neither");
  assert.ok(!CharacterBuild.safeParse({ tier: 1, archetypeId: "ganger", advanced: {} }).success, "both");
  assert.ok(
    CharacterBuild.safeParse({ tier: 1, archetypeId: "ganger" }).success,
    "a saved archetype build still parses",
  );
});

test("an Advanced Adeptus Astartes has the Species Keywords and is asked IMPERIUM or CHAOS (Core p.38)", () => {
  const r = run({ tier: 4, advanced: {}, speciesId: "adeptus-astartes" });
  assert.ok(r.sheet.keywords.includes("ADEPTUS ASTARTES") && r.sheet.keywords.includes("[CHAPTER]"));
  const choice = r.choices.find((c) => c.options.includes("IMPERIUM") || c.options.some((o) => o.includes("IMPERIUM")));
  assert.ok(choice && choice.options.some((o) => o.includes("CHAOS")), "IMPERIUM or CHAOS");
  assert.ok(r.pending.some((p) => p.path === choice!.path));
  // the species' own ratings stand (§11.126): Agility 4, not 1
  assert.equal(r.sheet.attributes.A, 4);
  assert.equal(r.ledger.find((l) => l.what === "Adeptus Astartes (species)")?.xp, 160);
});

test("a bought Archetype Ability costs its Archetype's Tier × 10 and needs the GM; it brings the ability alone (§11.131)", () => {
  const build = { tier: 4, advanced: { abilityOf: "inquisitor" }, speciesId: "human" };
  const r = run(build);
  const row = r.ledger.find((l) => l.what === "Inquisitor Archetype Ability");
  assert.equal(row?.xp, 40);
  const gm = r.problems.find((p) => p.severity === "gm" && p.path === "advanced/ability/inquisitor");
  assert.ok(gm, "a GM approval item");
  assert.ok(r.sheet.abilities.length > 0);
  assert.ok(!r.sheet.keywords.includes("INQUISITION"), "no keywords from the Archetype");
  const ok = run({ ...build, gm: { approved: ["advanced/ability/inquisitor"] } });
  assert.ok(!ok.problems.some((p) => p.path === "advanced/ability/inquisitor"));
});

test("archetype requirements fail for an Advanced character and notArchetype passes (§11.133)", () => {
  const ctx = (archetypeId: string | null) => ({ archetypeId }) as Parameters<typeof meets>[1];
  assert.notEqual(meets({ kind: "archetype", anyOf: ["ganger"] }, ctx(null)), true);
  assert.equal(meets({ kind: "notArchetype", anyOf: ["ganger"] }, ctx(null)), true);
  assert.ok(
    outOfReach([{ kind: "archetype", anyOf: ["ganger"] }], {
      species: null,
      archetypeId: null,
      keywords: [],
      buyable: [],
    }),
  );
});

test("Advanced Wargear is added to the sheet and checked against the Tier's limits (Core p.39)", () => {
  const ok = run({ ...worked, advanced: { wargear: ["frag-grenade", "frag-missile"] } });
  assert.ok(ok.sheet.weapons.length > 0 || ok.sheet.gear.length > 0);
  assert.ok(!ok.problems.some((p) => p.what.startsWith("Total Value")));
  const over = run({
    ...worked,
    advanced: { wargear: ["krak-missile", "frag-missile", "missile-launcher", "krak-grenade"] },
  });
  assert.ok(
    over.problems.some((p) => p.what.startsWith("Total Value")),
    JSON.stringify(over.problems),
  );
});

test("Advanced Wargear refuses an upgrade: it is fitted, not carried (Core p.39)", () => {
  const r = run({ ...worked, advanced: { wargear: ["ammo-drum"] } });
  assert.ok(r.problems.some((p) => p.severity === "error" && p.what.includes("is an upgrade")));
  assert.ok(!r.sheet.gear.some((g) => g.includes("Ammo Drum")));
});

test("an Ascension Package at Advanced Creation grants its per-Tier bonus once (§11.132)", () => {
  const base = { tier: 2, advanced: {}, speciesId: "human" } as const;
  const without = run(base);
  const with_ = run({ ...base, packages: ["dauntless-reputation"] });
  // Influence +2 per Tier Ascended (Core p.151)
  assert.equal((with_.sheet.mods.influence ?? 0) - (without.sheet.mods.influence ?? 0), 2);
});

// ── Species Keywords belong to Advanced Creation (Core p.38, rules-flow.md §11.133–135, GitHub issue #189) ──

const asked = (r: ReturnType<typeof run>, keyword: string) =>
  r.choices.some((c) => c.options.some((o) => o.split(/ \+ | \/ | and /).includes(keyword)));

test("an archetype build is asked for no Species Keyword: an Imperial Guardsman has no [ANY], a Corsair no ANHRATHE or ASURYANI", () => {
  const guard = run({ tier: 1, archetypeId: "imperial-guardsman" });
  assert.deepEqual(
    guard.sheet.keywords,
    ["IMPERIUM", "ASTRA MILITARUM", "[REGIMENT]"],
    "the Archetype's own, no [ANY]",
  );
  assert.ok(!guard.pending.some((p) => p.path.startsWith("fill/any") || p.path.startsWith("species/human/")));

  const corsair = run({ tier: 1, archetypeId: "corsair" });
  assert.deepEqual(corsair.sheet.keywords, ["AELDARI", "ANHRATHE", "[COTERIE]"]);
  assert.ok(!asked(corsair, "ASURYANI") && !asked(corsair, "ANHRATHE"), JSON.stringify(corsair.choices));

  const scout = run({ tier: 2, archetypeId: "space-marine-scout" });
  assert.ok(!asked(scout, "CHAOS"), "the Scout prints IMPERIUM; no IMPERIUM or CHAOS question");
  assert.ok(scout.sheet.keywords.includes("IMPERIUM"));
});

test("an archetype build keeps its species' other grants: a PSYKER Human still picks a Discipline", () => {
  const r = run({ tier: 1, archetypeId: "imperial-guardsman", gm: { keywords: ["PSYKER"] } });
  assert.ok(
    r.pending.some((p) => p.path.startsWith("species/human/2")),
    JSON.stringify(r.pending),
  );
});

test("a Human's any 2 Keywords are two picks, and they differ (Core p.38, §11.133)", () => {
  const base = { tier: 1, advanced: {}, speciesId: "human" } as const;
  const bare = run(base);
  assert.deepEqual(bare.sheet.keywords, ["[ANY]", "[ANY 2]"]);
  assert.ok(bare.pending.some((p) => p.path === "fill/any") && bare.pending.some((p) => p.path === "fill/any2"));

  const two = run({
    ...base,
    fills: { "[ANY]": { writeIn: "SCUM" }, "[ANY 2]": { writeIn: "INQUISITION" } },
    gm: { approved: ["fill/any", "fill/any2"] },
  });
  assert.deepEqual(two.sheet.keywords, ["SCUM", "INQUISITION"]);
  assert.ok(!two.problems.some((p) => p.severity === "error"), JSON.stringify(two.problems));
  assert.ok(!two.pending.some((p) => p.path.startsWith("fill/")));

  const same = run({ ...base, fills: { "[ANY]": { writeIn: "SCUM" }, "[ANY 2]": { writeIn: "SCUM" } } });
  assert.ok(same.problems.some((p) => p.severity === "error" && p.what.includes("repeats SCUM")));
});

test("an Advanced build with a Faction takes its Keywords and is asked no Species Keyword choice (§11.134, §11.136)", () => {
  // The Human's any 2: not asked, the Faction's Keyword stands.
  const human = run({ tier: 1, advanced: { factionId: "orks" }, speciesId: "human" });
  assert.deepEqual(human.sheet.keywords, ["ORK"]);
  assert.ok(!human.pending.some((p) => p.path.startsWith("fill/any")));
  assert.ok(human.effects.some((e) => e.what === "Orks Faction: ORK"));

  // The Astartes' fixed Species Keywords stand beside a Faction; IMPERIUM or CHAOS is asked only without one.
  const without = run({ tier: 4, advanced: {}, speciesId: "adeptus-astartes" });
  assert.ok(asked(without, "CHAOS"));
  const with_ = run({ tier: 4, advanced: { factionId: "adeptus-astartes" }, speciesId: "adeptus-astartes" });
  assert.ok(!asked(with_, "CHAOS"));
  assert.deepEqual(with_.sheet.keywords, ["ADEPTUS ASTARTES", "[CHAPTER]"]);
  const ork = run({ tier: 1, advanced: { factionId: "adeptus-mechanicus" }, speciesId: "ork" });
  assert.deepEqual(
    ork.sheet.keywords,
    ["ORK", "[CLAN]", "ADEPTUS MECHANICUS"],
    "a Species' fixed Keywords always stand",
  );

  // The Aeldari's ANHRATHE or ASURYANI is a Species choice, so a Faction replaces it.
  assert.ok(asked(run({ tier: 1, advanced: {}, speciesId: "aeldari" }), "ASURYANI"));
  assert.ok(!asked(run({ tier: 1, advanced: { factionId: "asuryani" }, speciesId: "aeldari" }), "ASURYANI"));
});

test("an Advanced Faction must exist, and a homebrew one needs homebrew (§11.134)", () => {
  const unknown = run({ tier: 1, advanced: { factionId: "no-such-faction" }, speciesId: "human" });
  assert.ok(unknown.problems.some((p) => p.severity === "error" && p.what.includes("Unknown faction")));
  const apoc = { tier: 1, advanced: { factionId: "adeptus-arbites" }, speciesId: "human" } as const;
  assert.ok(run(apoc).problems.some((p) => p.severity === "error" && p.what.includes("homebrew")));
  assert.ok(!run(apoc, true).problems.some((p) => p.severity === "error"));
});
