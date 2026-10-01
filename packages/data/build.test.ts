import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { buildReady, keepPlay, resolveBuild, type CharacterBuildInput } from "@wg/shared";
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
    const kept = keepPlay({ previous: want, next: s, before: s });
    assert.deepEqual(kept.weapons, want.weapons);
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

const inPlay = (build: CharacterBuildInput, play: { tier: number; xpEarned: number }) =>
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
  assert.ok(inPlay(b, { tier: 4, xpEarned: 100 }).problems.some((p) => p.what.includes("no Ascension to Tier 5")));
  const up = inPlay(b, { tier: 5, xpEarned: 100 });
  assert.ok(!up.problems.some((p) => p.what.includes("Ascension")));
  assert.equal(up.ledger.find((l) => l.pool && l.what.startsWith("Back From The Brink"))?.xp, 50, "10 × the new Tier");
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
