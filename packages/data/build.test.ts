import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { buildReady, keepPlay, resolveBuild, type CharacterBuildInput, type CharacterStats } from "@wg/shared";
import { creationCatalogue, loadPack, wargear } from "./index.ts";

// Issue #9 step 1 acceptance: every volkus pregen (docs/pregens.md), rebuilt from the choices its sheet records, comes
// out at the XP of its ledger and with its sheet. One difference is pinned, because a GM ruling moved the catalogue away
// from what the pregens were built on: one Background bonus (rules-flow.md §11.22).
const catalogue = { creation: creationCatalogue(), wargear, homebrew: false };
const pack = new Map(loadPack("volkus").characters.map((c) => [c.name, c.stats]));
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

const ASTARTES_BG = "adeptus-astartes";
const HIGH_GOTHIC = { picks: ["high-gothic"] }; // free with ADEPTUS ASTARTES (Core p.31)
const DEATHWATCH = { keywords: ["DEATHWATCH"] }; // docs/kill-team.md decision 3

type Pregen = {
  n: number;
  name: string;
  build: CharacterBuildInput;
  // The Background bonuses the pregen applies beyond the one the build keeps (§11.22).
  extraBonuses: Partial<Record<keyof CharacterStats["mods"], number>>;
  homebrew?: boolean; // the pregen uses homebrew (Apocrypha) records, which the user allows for pregens
  problems?: string[]; // problems a GM ruling pins on purpose (the Red Scorpions write-in, kill-team.md ruling 13)
};

const PREGENS: Pregen[] = [
  {
    n: 1,
    name: "Watch Sergeant Qaan Toghril",
    build: {
      tier: 4,
      archetypeId: "tactical-space-marine",
      packages: ["rubicon-primaris"],
      fills: { "[CHAPTER]": { id: "white-scars" } },
      background: {
        tableId: ASTARTES_BG,
        origin: "Courage",
        accomplishment: "Badge of Honour",
        goal: "Honour the Chapter",
        bonus: "origin",
      },
      attributes: { S: 5, Wil: 4 },
      skills: { Leadership: 3, Survival: 2, Scholar: 2 },
      languages: HIGH_GOTHIC,
      choices: { "package/rubicon-primaris/3": ["duelling-grip"] }, // Rubicon's Uncommon item (pregens GM choice 11)
      gm: {
        ...DEATHWATCH,
        species: "primaris-astartes", // pregens GM choice 2
        gear: {
          // pregens GM choices 3 and 4
          remove: ["Aquila Mk VII Power Armour", "Bolt Pistol", "Astartes Combat Knife"],
          add: [
            { name: "Mk X Tacticus", wargearId: "voa-mk-x-tacticus-armour" },
            { name: "Plasma Pistol", wargearId: "plasma-pistol" },
            { name: "Power Sword", wargearId: "voa-power-sword" },
          ],
        },
      },
    },
    extraBonuses: { influence: 1, conviction: 1 },
  },
  {
    n: 2,
    name: "Brother Octavius Serren",
    build: {
      tier: 4,
      archetypeId: "primaris-incursor",
      fills: { "[CHAPTER]": { id: "ultramarines" } },
      background: {
        tableId: ASTARTES_BG,
        origin: "Cunning",
        accomplishment: "Cleanse and Purge",
        goal: "Vengeance",
        bonus: "origin",
      },
      attributes: { A: 5, Int: 5 },
      skills: { Tech: 5, Stealth: 5, Awareness: 4 },
      talents: [{ id: "codex-innovator" }, { id: "bolter-discipline" }, { id: "silent" }],
      languages: HIGH_GOTHIC,
      gm: { ...DEATHWATCH, gear: { add: [{ name: "Omni-Scrambler", wargearId: "voa-omni-scrambler" }] } },
    },
    extraBonuses: { maxShock: 1, determination: 1 },
  },
  {
    n: 3,
    name: "Brother Hesh Tu'var",
    homebrew: true, // Master Artisan (Apocrypha p.239)
    build: {
      tier: 4,
      archetypeId: "primaris-intercessor", // Core p.117 (§11.34)
      packages: ["heavy-intercessor-doctrine"], // at creation: pregens GM choice 5
      fills: { "[CHAPTER]": { id: "salamanders" } },
      background: {
        tableId: ASTARTES_BG,
        origin: "Cunning",
        accomplishment: "Badge of Honour",
        goal: "Honour the Chapter",
        bonus: "origin",
      },
      attributes: { Wil: 4 },
      skills: { Awareness: 4, Tech: 2 },
      talents: [{ id: "master-artisan" }],
      languages: HIGH_GOTHIC,
      choices: { "package/heavy-intercessor-doctrine/1": [1] }, // the Heavy Bolter
      gm: DEATHWATCH,
    },
    extraBonuses: { influence: 1, conviction: 1 },
  },
  {
    n: 4,
    name: "Brother Aurelian Tarsus",
    // Red Scorpions: no catalogue record and no Chapter Traits (kill-team.md ruling 13). [CHAPTER] isn't a write-in
    // keyword (rules-flow.md §11.25), so the build pins that one problem.
    problems: ["[CHAPTER] can't be written in; choose one the books print"],
    build: {
      tier: 4,
      archetypeId: "primaris-eliminator",
      fills: { "[CHAPTER]": { writeIn: "RED SCORPIONS" } },
      background: {
        tableId: ASTARTES_BG,
        origin: "Cunning",
        accomplishment: "Cleanse and Purge",
        goal: "Advancement",
        bonus: "origin",
      },
      attributes: { A: 6, Int: 4 },
      skills: { "Ballistic Skill": 6, Stealth: 5, Awareness: 4, Survival: 1, Athletics: 4 },
      talents: [{ id: "trademark-weapon", choice: "Bolt Sniper Rifle" }],
      languages: HIGH_GOTHIC,
      gm: DEATHWATCH,
    },
    extraBonuses: { maxShock: 1, influence: 1 },
  },
  {
    n: 5,
    name: "Brother Sariel Voss",
    build: {
      tier: 4,
      archetypeId: "tactical-space-marine",
      packages: ["rubicon-primaris"],
      fills: { "[CHAPTER]": { id: "dark-angels" } },
      background: {
        tableId: ASTARTES_BG,
        origin: "Killer Instinct",
        accomplishment: "Crusader",
        goal: "Honour the Chapter",
        bonus: "origin",
      },
      attributes: { S: 5 },
      skills: { "Weapon Skill": 6, Survival: 2, Intimidation: 1 },
      languages: HIGH_GOTHIC,
      choices: { "package/rubicon-primaris/3": ["duelling-grip"] }, // Rubicon's Uncommon item
      gm: {
        ...DEATHWATCH,
        species: "primaris-astartes", // pregens GM choice 2
        gear: {
          remove: ["Aquila Mk VII Power Armour", "Astartes Combat Knife"],
          add: [
            { name: "Mk X Tacticus", wargearId: "voa-mk-x-tacticus-armour" },
            { name: "Xenophase blade", wargearId: "voa-power-sword" },
          ],
        },
      },
    },
    extraBonuses: { determination: 1, conviction: 1 },
  },
  {
    n: 6,
    name: "Brother Hjalmar Grimsson",
    build: {
      tier: 4,
      archetypeId: "tactical-space-marine",
      packages: ["rubicon-primaris"],
      fills: { "[CHAPTER]": { id: "space-wolves" } },
      background: {
        tableId: ASTARTES_BG,
        origin: "Courage",
        accomplishment: "Crusader",
        goal: "Honour the Chapter",
        bonus: "accomplishment",
      },
      attributes: { S: 5, Wil: 4 },
      skills: { "Weapon Skill": 5, Survival: 2, Scholar: 2 },
      languages: HIGH_GOTHIC,
      choices: { "package/rubicon-primaris/3": ["duelling-grip"] }, // Rubicon's Uncommon item, on the Power Maul
      gm: {
        ...DEATHWATCH,
        species: "primaris-astartes", // pregens GM choice 2
        gear: {
          remove: ["Aquila Mk VII Power Armour", "Astartes Combat Knife"],
          add: [
            { name: "Mk X Tacticus", wargearId: "voa-mk-x-tacticus-armour" },
            { name: "Power Maul", wargearId: "fspg-power-maul" },
            { name: "Storm Shield", wargearId: "storm-shield" },
          ],
        },
      },
    },
    // speed −1 isn't a Background bonus: the Storm Shield's Bulk (1) (Core p.232), which the build doesn't apply
    extraBonuses: { resolve: 1, conviction: 1, speed: -1 },
  },
  {
    n: 7,
    name: "Brother Idrian Kostas",
    homebrew: true, // Flesh Tearers (Apocrypha p.28) and the Deathwatch Frag Cannon (Apocrypha p.356)
    build: {
      tier: 4,
      archetypeId: "primaris-intercessor", // Core p.117 (§11.34)
      packages: ["heavy-intercessor-doctrine"], // at creation: pregens GM choice 5
      fills: { "[CHAPTER]": { id: "flesh-tearers" } },
      background: {
        tableId: ASTARTES_BG,
        origin: "Courage",
        accomplishment: "Crusader",
        goal: "Vengeance",
        bonus: "origin",
      },
      attributes: { Wil: 4 },
      talents: [{ id: "fearless" }],
      languages: HIGH_GOTHIC,
      choices: { "package/heavy-intercessor-doctrine/1": [1] }, // the Heavy Bolter, swapped out below
      gm: {
        ...DEATHWATCH,
        gear: {
          // pregens Bombard GM choice: the Heavy Bolter becomes the Frag Cannon
          remove: ["Heavy Bolter"],
          add: [
            { name: "Deathwatch Frag Cannon (Shrapnel)", wargearId: "apoc-deathwatch-frag-cannon-shrapnel" },
            { name: "Deathwatch Frag Cannon (Shell)", wargearId: "apoc-deathwatch-frag-cannon-shell" },
          ],
        },
      },
    },
    extraBonuses: { determination: 2 },
  },
  {
    n: 8,
    name: "Brother Tancred Varn",
    build: {
      tier: 4,
      archetypeId: "primaris-intercessor", // Core p.117 (§11.34)
      packages: ["heavy-intercessor-doctrine"], // at creation: pregens GM choice 5
      fills: { "[CHAPTER]": { id: "imperial-fists" } },
      background: {
        tableId: ASTARTES_BG,
        origin: "Killer Instinct",
        accomplishment: "Crusader",
        goal: "Vengeance",
        bonus: "origin",
      },
      skills: { Tech: 3, Athletics: 4 },
      talents: [{ id: "legacy-of-the-primarch" }],
      languages: HIGH_GOTHIC,
      choices: { "package/heavy-intercessor-doctrine/1": [1] }, // the Heavy Bolter, swapped out below
      gm: {
        ...DEATHWATCH,
        gear: {
          // pregens Breacher GM choice: the Heavy Bolter becomes the Hellstorm Bolt Rifle, the grenade launcher and a
          // Melta Bomb; the Intercessor already carries the 3 Frag and 3 Krak Grenades the launcher fires
          remove: ["Heavy Bolter"],
          add: [
            { name: "Hellstorm Bolt Rifle", wargearId: "voa-hellstorm-bolt-rifle" },
            { name: "Astartes Grenade Launcher", wargearId: "voa-astartes-grenade-launcher" },
            { name: "Melta Bomb", wargearId: "fspg-melta-bomb" },
          ],
        },
      },
    },
    extraBonuses: { determination: 2 },
  },
  {
    n: 9,
    name: "Brother Sigurd Hrafnsson",
    homebrew: true,
    build: {
      tier: 4,
      archetypeId: "assault-space-marine",
      packages: ["rubicon-primaris"],
      fills: { "[CHAPTER]": { id: "space-wolves" } },
      background: {
        tableId: ASTARTES_BG,
        origin: "Courage",
        accomplishment: "Crusader",
        goal: "Honour the Chapter",
        bonus: "origin",
      },
      attributes: { Wil: 4 },
      skills: { "Weapon Skill": 5, Survival: 2, Scholar: 2 },
      talents: [{ id: "hammer-of-wrath" }],
      languages: HIGH_GOTHIC,
      choices: { "package/rubicon-primaris/3": ["chaplet-ecclesiasticus"] }, // Rubicon's Uncommon item
      gm: {
        ...DEATHWATCH,
        species: "primaris-astartes", // as pregens GM choice 2
        gear: {
          remove: ["Aquila Power Armour", "Astartes Chainsword"],
          add: [
            { name: "Mk X Tacticus", wargearId: "voa-mk-x-tacticus-armour" },
            { name: "Heavy Thunder Hammer", wargearId: "voa-heavy-thunder-hammer" },
          ],
        },
      },
    },
    extraBonuses: { determination: 1, conviction: 1 },
  },
  {
    n: 10,
    name: "Brother Kael Tirrow",
    homebrew: true,
    build: {
      tier: 4,
      archetypeId: "primaris-hellblaster",
      fills: { "[CHAPTER]": { id: "ultramarines" } }, // Emperor's Spears, an Ultramarines Successor (kill-team.md ruling 13)
      background: {
        tableId: ASTARTES_BG,
        origin: "Cunning",
        accomplishment: "Cleanse and Purge",
        goal: "Advancement",
        bonus: "origin",
      },
      attributes: { A: 6, T: 6, I: 5, Wil: 4 },
      skills: { "Ballistic Skill": 6, Awareness: 4, Tech: 4, Scholar: 1 },
      talents: [{ id: "deadshot" }, { id: "duty-until-death" }],
      languages: HIGH_GOTHIC,
      gm: {
        ...DEATHWATCH,
        gear: {
          remove: ["Plasma Incinerator"],
          add: [{ name: "Heavy Plasma Incinerator", wargearId: "apoc-heavy-plasma-incinerator" }],
        },
      },
    },
    extraBonuses: { maxShock: 1, influence: 1 },
  },
  {
    n: 11,
    name: "Brother Lucan Sarrius",
    build: {
      tier: 4,
      archetypeId: "primaris-reiver",
      fills: { "[CHAPTER]": { id: "blood-angels" } },
      background: {
        tableId: ASTARTES_BG,
        origin: "Killer Instinct",
        accomplishment: "Crusader",
        goal: "Advancement",
        bonus: "origin",
      },
      attributes: { A: 5 },
      skills: { "Weapon Skill": 6, Stealth: 5, Survival: 2 },
      talents: [{ id: "eliminator" }, { id: "dual-wield" }, { id: "echo-of-sanguinius" }],
      languages: HIGH_GOTHIC,
      gm: {
        ...DEATHWATCH,
        gear: {
          add: [
            { name: "Astartes Combat Knife (off hand)", wargearId: "voa-astartes-combat-knife" },
            { name: "Grapnel Launcher", wargearId: "voa-grapnel-launcher" },
          ],
        },
      },
    },
    extraBonuses: { determination: 1, influence: 1 },
  },
];

test("every volkus pregen has a build here", () => {
  assert.deepEqual([...pack.keys()].sort(), PREGENS.map((p) => p.name).sort());
});

for (const p of PREGENS) {
  test(`${p.name}: the build resolves to the pregen's ledger and sheet`, () => {
    const r = resolveBuild({ catalogue: { ...catalogue, homebrew: p.homebrew ?? false }, build: p.build });
    const want = pack.get(p.name)!;
    assert.deepEqual(r.pending, [], "nothing left to choose");
    assert.deepEqual(
      r.problems.map((x) => x.what),
      p.problems ?? [],
      "no problems",
    );
    assert.equal(buildReady(r), !p.problems);

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
    assert.deepEqual(s.talents.map((t) => norm(t.name)).sort(), want.talents.map((t) => norm(t.name)).sort());
    const abilities = s.abilities.map((a) => norm(a.name));
    // A package's prose effect (Heavy Intercessor Doctrine's +Rank AP) sits on the pregen as an ability; the build has
    // it as the package.
    const packages = (p.build.packages ?? []).map(norm);
    for (const a of want.abilities.filter((x) => !packages.includes(norm(x.name))))
      assert.ok(abilities.includes(norm(a.name)), a.name);

    // §11.22: the pregens apply all three Background bonuses; the build keeps one.
    const mods = { ...s.mods };
    for (const [k, v] of Object.entries(p.extraBonuses))
      mods[k as keyof typeof mods] = (mods[k as keyof typeof mods] ?? 0) + v;
    // The pregens put Mk X Phobos's "+1 Movement" (VoA p.72) in mods; the Wargear catalogue has it only as the armour
    // trait "+1 M", which the sheet shows but no rule reads yet.
    if (s.armour.traits.includes("+1 M")) mods.speed = (mods.speed ?? 0) + 1;
    assert.deepEqual(mods, want.mods);
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

test("a granted Talent whose requirements aren't met waits for the GM, and the tick clears it", () => {
  const { Survival: _, ...skills } = PREGENS[0]!.build.skills!;
  const sergeant = { ...PREGENS[0]!.build, skills }; // Survival stays 1; Built Tough needs 2 (VoA p.46)
  const r = run(sergeant);
  const p = r.problems.find((x) => x.what.startsWith("Built Tough (granted)"));
  assert.equal(p?.severity, "gm");
  const ticked = run({ ...sergeant, gm: { ...sergeant.gm, approved: [p!.path!] } });
  assert.ok(!ticked.problems.some((x) => x.what.startsWith("Built Tough")));
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
