import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  buildReady,
  deriveStats,
  keepPlay,
  resolveBuild,
  applyUpgrades,
  sheetWeapon,
  upgradeRefusal,
  wargearMatches,
  withUpgrades,
  type WargearWeapon,
  type CharacterBuildInput,
} from "@wg/shared";
import { creationCatalogue, loadPack, wargear } from "./index.ts";

// Issue #9 step 1 and #18 acceptance: every volkus pregen (docs/pregens.md), rebuilt from the build its pack file
// carries, comes out at the XP of its ledger and with the sheet the pack prints. The GM's part of each build holds
// the rulings that make it so (pregens.md "Every [GM] choice").
const volkus = loadPack("volkus");
const catalogue = { creation: creationCatalogue(), wargear, homebrew: false };
const PREGENS = volkus.characters.map((c, i) => ({ n: i + 1, name: c.name, want: c.stats, build: c.build! }));
const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/\s*\(.*?\)\s*/g, "")
    .replace(/[^a-z0-9]/g, "");

// Each pregen's ledger costs, from its "### XP ledger" table.
const doc = readFileSync(new URL("../../docs/pregens.md", import.meta.url), "utf8");
const ledgerOf = (n: number) => {
  const section = doc.split(/^## /m).find((s) => s.startsWith(`${n}. `))!;
  return [
    ...section.matchAll(/^\| (?:Archetype|Ascension|Package|Attribute|Skill|Talent) \|.*?\| (\d+) \| \**\d+\** \|$/gm),
  ].map((m) => Number(m[1]));
};

test("every volkus pregen carries a build", () => {
  assert.equal(PREGENS.length, 11);
  for (const p of PREGENS) assert.ok(p.build, p.name);
});

for (const { want, ...p } of PREGENS) {
  test(`${p.name}: the build resolves to the pregen's ledger and sheet`, () => {
    const r = resolveBuild({ catalogue: { ...catalogue, homebrew: volkus.campaign.homebrew }, build: p.build });
    assert.deepEqual(r.pending, [], "nothing left to choose");
    assert.deepEqual(
      r.problems.map((x) => x.what),
      [],
      "no problems",
    );
    assert.ok(buildReady(r));

    assert.equal(
      r.spent,
      ledgerOf(p.n).reduce((a, b) => a + b, 0),
    );
    assert.deepEqual(
      r.ledger.map((l) => l.xp).sort((a, b) => a - b),
      ledgerOf(p.n).sort((a, b) => a - b),
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

    assert.deepEqual(s.mods, want.mods); // the extra Background bonuses are the GM's (pregens.md GM choice 23)

    // The live sheet keeps the printed weapon, armour and gear lines, which work Talents and upgrades into the profiles
    // (Bolter Discipline's Rapid Fire); a rebuild with no changes adds no catalogue lines beside them (issue #18).
    // The rebuild may tag a printed line with its catalogue entry (`wargearId`), so an upgrade can be fitted to it.
    const kept = keepPlay({ previous: want, next: s, before: s });
    assert.deepEqual(
      kept.weapons.map(({ wargearId: _, ...w }) => w),
      want.weapons,
    );
    assert.deepEqual(kept.armour, want.armour);
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
  const wolf = PREGENS.find((p) => p.name === "Brother Hjalmar Grimsson")!.build;
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
