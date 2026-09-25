import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { buildReady, resolveBuild, type CharacterBuildInput, type CharacterStats } from "@wg/shared";
import { creationCatalogue, loadPack, wargear } from "./index.ts";

// Issue #9 step 1 acceptance: the five volkus pregens (docs/pregens.md), rebuilt from the choices their sheets record,
// come out at the XP of their ledgers and with their sheets. Two differences are pinned, because GM rulings moved the
// catalogue away from what the pregens were built on: one Background bonus (rules-flow.md §11.22) and VoA's Primaris
// Intercessor (§11.34).
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
};

const PREGENS: Pregen[] = [
  {
    n: 1,
    name: "Watch Sergeant Ulfgar Kaldsson",
    build: {
      tier: 4,
      archetypeId: "tactical-space-marine",
      packages: ["rubicon-primaris"],
      fills: { "[CHAPTER]": { id: "space-wolves" } },
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
    name: "Brother Veyl Corsa",
    build: {
      tier: 4,
      archetypeId: "primaris-incursor",
      fills: { "[CHAPTER]": { id: "raven-guard" } },
      background: {
        tableId: ASTARTES_BG,
        origin: "Cunning",
        accomplishment: "Cleanse and Purge",
        goal: "Vengeance",
        bonus: "origin",
      },
      attributes: { A: 5, Int: 5 },
      skills: { Tech: 5, Stealth: 5, "Ballistic Skill": 5, Awareness: 4 },
      talents: [{ id: "wraith-slipping" }, { id: "bolter-discipline" }, { id: "silent" }],
      languages: HIGH_GOTHIC,
      gm: { ...DEATHWATCH, gear: { add: [{ name: "Omni-Scrambler", wargearId: "voa-omni-scrambler" }] } },
    },
    extraBonuses: { maxShock: 1, determination: 1 },
  },
  {
    n: 4,
    name: "Brother Zadkiel Morn",
    build: {
      tier: 4,
      archetypeId: "primaris-eliminator",
      fills: { "[CHAPTER]": { id: "dark-angels" } },
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
    name: "Brother Castiel Varro",
    build: {
      tier: 4,
      archetypeId: "primaris-reiver",
      fills: { "[CHAPTER]": { id: "blood-angels" } },
      background: {
        tableId: ASTARTES_BG,
        origin: "Killer Instinct",
        accomplishment: "Crusader",
        goal: "Honour the Chapter",
        bonus: "origin",
      },
      attributes: { I: 6, S: 6 },
      skills: { "Weapon Skill": 6 },
      talents: [{ id: "trademark-weapon", choice: "xenophase blade" }, { id: "furious-charge" }],
      languages: HIGH_GOTHIC,
      gm: {
        ...DEATHWATCH,
        gear: { remove: ["Astartes Combat Knife"], add: [{ name: "Xenophase blade", wargearId: "voa-relic-blade" }] },
      },
    },
    extraBonuses: { determination: 1, conviction: 1 },
  },
];

for (const p of PREGENS) {
  test(`${p.name}: the build resolves to the pregen's ledger and sheet`, () => {
    const r = resolveBuild({ catalogue, build: p.build });
    const want = pack.get(p.name)!;
    assert.deepEqual(r.pending, [], "nothing left to choose");
    assert.deepEqual(r.problems, [], "no problems");
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
    assert.deepEqual(s.talents.map((t) => norm(t.name)).sort(), want.talents.map((t) => norm(t.name)).sort());
    const abilities = s.abilities.map((a) => norm(a.name));
    for (const a of want.abilities) assert.ok(abilities.includes(norm(a.name)), a.name);

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

test("Brother Tancred Varn: VoA's Intercessor (§11.34) puts the pregen's purchases 39 XP over", () => {
  const augmetics = [...wargear.values()]
    .filter((w) => w.kind === "augmetic")
    .slice(0, 3)
    .map((w) => w.id);
  const r = resolveBuild({
    catalogue,
    build: {
      tier: 4,
      archetypeId: "primaris-intercessor",
      packages: ["heavy-intercessor-doctrine"],
      fills: { "[CHAPTER]": { id: "imperial-fists" } },
      background: {
        tableId: ASTARTES_BG,
        origin: "Killer Instinct",
        accomplishment: "Crusader",
        goal: "Vengeance",
        bonus: "origin",
      },
      attributes: { Wil: 4 },
      skills: { Awareness: 4, "Weapon Skill": 4, Intimidation: 2, Athletics: 4 },
      languages: HIGH_GOTHIC,
      choices: {
        "archetype/primaris-intercessor/wargear/1": [0],
        "archetype/primaris-intercessor/wargear/8": augmetics,
        "package/heavy-intercessor-doctrine/1": [1], // the Heavy Bolter
      },
      gm: DEATHWATCH,
    },
  });
  assert.deepEqual(r.pending, []);
  // The pregen was built on Core p.117 (300 XP): the catalogue's 357, plus the Doctrine and what is still a raise.
  assert.deepEqual(
    r.ledger.map((l) => l.xp),
    [357, 60, 8, 6, 8],
  );
  assert.deepEqual(
    r.problems.map((p) => p.what),
    ["39 XP over the budget of 400"],
  );
});

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
  const names = run(incursor).sheet.abilities.map((a) => a.name);
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
