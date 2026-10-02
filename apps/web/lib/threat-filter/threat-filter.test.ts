import assert from "node:assert/strict";
import { test } from "node:test";

import { Threat, type ThreatClass } from "@wg/shared";

import { filterThreats } from "./threat-filter.ts";

// A stat block with only the fields the filter reads; the numbers are filler, not a printed profile.
const threatOf = (o: {
  id: string;
  name: string;
  threat: (ThreatClass | null)[];
  faction?: string;
  keywords?: string[];
  source?: string;
}): Threat =>
  Threat.parse({
    page: 1,
    faction: "ork",
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
    ...o,
  });

const kommando = threatOf({
  id: "ork-kommando",
  name: "Ork Kommando",
  threat: ["E", "E", "T", "T"],
  keywords: ["Ork", "Kommando"],
});
const fireWarrior = threatOf({
  id: "fire-warrior",
  name: "T'au Fire Warrior",
  threat: ["T", "T", "T", "T"],
  faction: "tau",
  keywords: ["T'au", "Fire Caste"],
  source: "threat-assessment",
});
const follower = threatOf({ id: "late-follower", name: "Late Follower", threat: [null, null, "A", "A"] });
const bestiary = [kommando, fireWarrior, follower];
const ids = (ts: Threat[]) => ts.map((t) => t.id);

test("class filters on the letter printed for the campaign's Tier (Core p.323)", () => {
  assert.deepEqual(ids(filterThreats(bestiary, { cls: "E" }, 2)), ["ork-kommando"]);
  assert.deepEqual(ids(filterThreats(bestiary, { cls: "E" }, 4)), [], "at Tier 4 the same threat is a Troop");
  assert.deepEqual(ids(filterThreats(bestiary, { cls: "T" }, 4)), ["ork-kommando", "fire-warrior"]);
});

test("a four-letter entry in a Tier 5 game uses its Tier 4 class", () => {
  assert.deepEqual(ids(filterThreats(bestiary, { cls: "T" }, 5)), ["ork-kommando", "fire-warrior"]);
});

test("a printed '–' at this Tier doesn't crash the class filter", () => {
  assert.deepEqual(ids(filterThreats(bestiary, { cls: "A" }, 1)), ["late-follower"], "it takes its next printed class");
  assert.deepEqual(ids(filterThreats(bestiary, { cls: "A" }, 4)), ["late-follower"]);
});

test("search matches the name or a keyword, ignoring case and punctuation", () => {
  assert.deepEqual(ids(filterThreats(bestiary, { query: "tau" }, 4)), ["fire-warrior"], "typed 'tau' finds \"T'au\"");
  assert.deepEqual(ids(filterThreats(bestiary, { query: "FIRE CASTE" }, 4)), ["fire-warrior"], "a keyword, any case");
  assert.deepEqual(ids(filterThreats(bestiary, { query: "kommando" }, 4)), ["ork-kommando"]);
  assert.deepEqual(ids(filterThreats(bestiary, { query: "  " }, 4)), ids(bestiary), "a blank search filters nothing");
  assert.deepEqual(ids(filterThreats(bestiary, { query: "necron" }, 4)), []);
});

test("faction and book narrow the list, and facets combine", () => {
  assert.deepEqual(ids(filterThreats(bestiary, { faction: "tau" }, 4)), ["fire-warrior"]);
  assert.deepEqual(ids(filterThreats(bestiary, { source: "threat-assessment" }, 4)), ["fire-warrior"]);
  assert.deepEqual(ids(filterThreats(bestiary, { source: "core", cls: "T" }, 4)), ["ork-kommando"]);
  assert.deepEqual(ids(filterThreats(bestiary, { faction: "ork", query: "tau" }, 4)), [], "both must hold");
});

test("a non-ASCII query narrows rather than matching everything", () => {
  const sister = threatOf({ id: "celestian", name: "Céléstian", threat: ["E", "E", "E", "E"], faction: "imperial" });
  const list = [...bestiary, sister];
  assert.deepEqual(ids(filterThreats(list, { query: "célé" }, 4)), ["celestian"], "the accents fold away");
  assert.deepEqual(ids(filterThreats(list, { query: "cele" }, 4)), ["celestian"], "and typing it plain finds it too");
  const toLetter = ids(filterThreats(list, { query: "é" }, 4));
  assert.ok(toLetter.includes("celestian"), "an accent alone folds to its letter");
  assert.ok(!toLetter.includes("ork-kommando"), "and still narrows, instead of matching the whole bestiary");
  assert.deepEqual(ids(filterThreats(list, { query: "'" }, 4)), ids(list), "punctuation alone is not a search");
});
