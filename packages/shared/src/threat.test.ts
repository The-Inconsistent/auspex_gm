import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_SLUG,
  MOB_MIN,
  Threat,
  encounterBudget,
  rosterTally,
  tallyByClass,
  threatCite,
  threatClassAt,
  threatLabel,
  threatSlug,
  customThreatId,
  isCustomThreatId,
  type ThreatClass,
} from "./index.ts";

// A stat block with only the fields these rules read; the numbers are filler, not a printed profile.
const threatOf = (id: string, tiers: (ThreatClass | null)[]): Threat =>
  Threat.parse({
    id,
    name: id,
    page: 1,
    faction: "ork",
    threat: tiers,
    keywords: ["Ork"],
    attributes: { S: 3, T: 3, A: 3, I: 3, Wil: 3, Int: 3, Fel: 3 },
    resilience: { value: 5 },
    defence: 2,
    wounds: 6,
    shock: 2,
    skills: { default: 2, list: [] },
    conviction: 3,
    resolve: 2,
    speed: 6,
    size: "Avg",
  });

const troop = threatOf("troop", ["T", "T", "T", "T"]);
const elite = threatOf("elite", ["E", "E", "E", "E"]);
const adversary = threatOf("adversary", ["A", "A", "A", "A"]);
const monstrous = threatOf("monstrous", ["M", "M", "M", "M"]);
const bestiary = [troop, elite, adversary, monstrous];

test("encounterBudget is two Troops per Agent, half in a Mob, plus one Elite or Adversary (TA p.8)", () => {
  assert.deepEqual(
    encounterBudget({ agents: 5 }),
    { troops: 10, inMobs: 5, elites: 1, enemies: 10 },
    "the book's own five-Agent example",
  );
  assert.deepEqual(encounterBudget({ agents: 3 }), { troops: 6, inMobs: 3, elites: 1, enemies: 10 });
  assert.deepEqual(encounterBudget({ agents: 1 }), { troops: 2, inMobs: 1, elites: 1, enemies: 10 });
  assert.deepEqual(
    encounterBudget({ agents: 0 }),
    { troops: 0, inMobs: 0, elites: 1, enemies: 10 },
    "no Agents seated yet",
  );
});

test("fortified ground doubles every target (TA p.8, rules-flow §11.82)", () => {
  assert.deepEqual(encounterBudget({ agents: 5, fortified: true }), { troops: 20, inMobs: 10, elites: 2, enemies: 20 });
  assert.deepEqual(encounterBudget({ agents: 1, fortified: true }), { troops: 4, inMobs: 2, elites: 2, enemies: 20 });
  assert.deepEqual(
    encounterBudget({ agents: 3, fortified: false }),
    encounterBudget({ agents: 3 }),
    "default is open ground",
  );
});

test("a target Mob of one still needs two Troops (Core p.324)", () => {
  assert.equal(MOB_MIN, 2);
  assert.equal(encounterBudget({ agents: 1 }).inMobs, 1, "the UI reads this as 'needs 2'");
});

test("rosterTally counts a Mob as one tracked combatant and as its models (TA pp.6, 8)", () => {
  const t = rosterTally([{ threatId: "troop", count: 10, asMob: true }], { bestiary, tier: 4 });
  assert.deepEqual(t, { troops: 10, inMobs: 10, elites: 0, monstrous: 0, models: 10, tracked: 1, unclassed: 0 });
});

test("rosterTally over a mixed roster, by class at the Tier (Core p.323)", () => {
  const entries = [
    { threatId: "troop", count: 6, asMob: true },
    { threatId: "troop", count: 4 },
    { threatId: "elite", count: 1 },
    { threatId: "adversary", count: 1 },
  ];
  assert.deepEqual(rosterTally(entries, { bestiary, tier: 4 }), {
    troops: 10,
    inMobs: 6,
    elites: 2,
    monstrous: 0,
    models: 12,
    tracked: 7, // the Mob is one, the four loose Troops, the Elite and the Adversary
    unclassed: 0,
  });
});

test("a Monstrous Creature tallies on its own, with no Elite or Adversary target (TA p.8)", () => {
  const t = rosterTally([{ threatId: "monstrous", count: 1 }], { bestiary, tier: 4 });
  assert.deepEqual(t, { troops: 0, inMobs: 0, elites: 0, monstrous: 1, models: 1, tracked: 1, unclassed: 0 });
});

test("a single Troop marked as a Mob is not one, and an unknown id is unclassed", () => {
  const t = rosterTally(
    [
      { threatId: "troop", count: 1, asMob: true },
      { threatId: "gone", count: 2 },
    ],
    { bestiary, tier: 4 },
  );
  assert.deepEqual(t, { troops: 1, inMobs: 0, elites: 0, monstrous: 0, models: 3, tracked: 3, unclassed: 2 });
});

test("tallyByClass takes the class the tracker stored on the combatant", () => {
  const t = tallyByClass([
    { cls: "T", count: 8, asMob: true },
    { cls: "E", count: 1 },
    { cls: null, count: 1 },
  ]);
  assert.deepEqual(t, { troops: 8, inMobs: 8, elites: 1, monstrous: 0, models: 10, tracked: 3, unclassed: 1 });
});

test("threatClassAt reads the letter printed for the Tier (Core p.323; TA p.5)", () => {
  const mixed = threatOf("mixed", [null, "E", "E", "T"]);
  assert.equal(threatClassAt(mixed, 2), "E");
  assert.equal(threatClassAt(mixed, 4), "T");
  assert.equal(threatClassAt(mixed, 1), "E", "a printed '–' takes the next Tier's class, so the GM can still field it");
  assert.equal(threatClassAt(mixed, 5), "T", "a four-letter entry in a Tier 5 game uses its Tier 4 class");
});

test("a custom threat cites no page: its page is a placeholder (issue #43)", () => {
  assert.equal(threatCite({ source: "core", page: 339 }), "Core p.339");
  assert.equal(threatCite({ source: "custom", page: 1 }), "Custom");
  assert.equal(threatLabel({ name: "Warped Ogryn", source: "custom", page: 1 }), "Warped Ogryn · Custom");
});

// ── custom threats (issue #43) ───────────────────────────────────────────────────────────────────────────────────────

test("threatSlug makes a slug once, and a clash takes a suffix", () => {
  assert.equal(threatSlug("Warped Ogryn"), "warped-ogryn");
  assert.equal(threatSlug("Khârn the Betrayer!"), "kharn-the-betrayer");
  assert.equal(threatSlug("???"), "threat", "a name with nothing a slug can keep still gets one");
  assert.equal(threatSlug("Warped Ogryn", ["warped-ogryn"]), "warped-ogryn-2");
  assert.equal(threatSlug("Warped Ogryn", ["warped-ogryn", "warped-ogryn-2"]), "warped-ogryn-3");
  // At most MAX_SLUG characters, and never left ending in the separator.
  const long = threatSlug("x".repeat(80));
  assert.equal(long.length, MAX_SLUG);
  assert.equal(threatSlug("x".repeat(80), [long]), `${"x".repeat(MAX_SLUG - 2)}-2`);
});

test("a slug is the id, so a rename keeps every pointer at it", () => {
  const slug = threatSlug("Warped Ogryn");
  assert.equal(customThreatId(slug), "custom-warped-ogryn");
  assert.ok(isCustomThreatId("custom-warped-ogryn"));
  assert.ok(!isCustomThreatId("ork-boy"));
  // The GM renames the threat; the slug it was saved under doesn't move.
  assert.equal(customThreatId(slug), "custom-warped-ogryn");
});

test("a custom threat's label carries no page, a book threat's does", () => {
  assert.equal(threatLabel({ name: "Warped Ogryn", source: "custom", page: 1 }), "Warped Ogryn · Custom");
  assert.equal(threatLabel({ name: "Ork Boy", source: "core", page: 354 }), "Ork Boy · Core p.354");
});

test("a class row must print a class at the last Tier (Core p.323, §11.109)", () => {
  // "-" before the last Tier is a printed thing (a follower not yet available); on the last it never is.
  assert.ok(Threat.safeParse({ ...threatOf("ok", ["T", "T", "T", "T"]), threat: [null, "E", "E", "A"] }).success);
  assert.ok(!Threat.safeParse({ ...threatOf("bad", ["T", "T", "T", "T"]), threat: ["T", "T", "T", null] }).success);
  assert.ok(!Threat.safeParse({ ...threatOf("short", ["T", "T", "T", "T"]), threat: ["T", "T", "T"] }).success);
});

test("a class row the editor writes is refused unless it is 4 or 5 classes with the last Tier printed (Core p.323)", () => {
  const row = (threat: unknown[]) => Threat.safeParse({ ...troop, threat }).success;
  assert.ok(row(["T", "T", "E", "E"]));
  assert.ok(row([null, "E", "E", "A", "A"]), "a '–' before the last Tier is how the books print it");
  assert.ok(!row(["T", "T", "E", null]), "the last Tier is printed");
  assert.ok(!row(["T", "T", "E"]), "too short");
  assert.ok(!row(["T", "T", "E", "E", "A", "A"]), "too long");
  assert.ok(!row(["T", "T", "X", "E"]), "not a class");
});
