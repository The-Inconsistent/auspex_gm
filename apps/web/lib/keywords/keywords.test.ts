import assert from "node:assert/strict";
import { test } from "node:test";

import type { FactionKeyword } from "@wg/shared";

import { MIXING_HINTS, matchKeywords, mixingHint } from "./keywords.ts";

const kw = (name: string): FactionKeyword => ({ name, text: "", source: "core", page: 375 });
const suggestions = [
  "ADEPTUS ASTARTES",
  "ASTRA MILITARUM",
  "ORK",
  "T'AU EMPIRE",
  "T'AU",
  "KABALITE",
  "[KABAL]",
  "[CHAPTER]",
].map(kw);
const names = (r: ReturnType<typeof matchKeywords>) => r.matches.map((k) => k.name);

test("matchKeywords is case- and punctuation-insensitive, prefix matches first", () => {
  assert.deepEqual(names(matchKeywords({ query: "ast", suggestions, chosen: [] })), [
    "ASTRA MILITARUM",
    "ADEPTUS ASTARTES",
  ]);
  assert.deepEqual(names(matchKeywords({ query: "tau", suggestions, chosen: [] })), ["T'AU", "T'AU EMPIRE"]);
  assert.deepEqual(names(matchKeywords({ query: "chapter", suggestions, chosen: [] })), ["[CHAPTER]"]);
});

test("matchKeywords hides chosen Keywords and offers nothing for an empty query", () => {
  assert.deepEqual(names(matchKeywords({ query: "ast", suggestions, chosen: ["astra militarum"] })), [
    "ADEPTUS ASTARTES",
  ]);
  assert.deepEqual(matchKeywords({ query: "  ", suggestions, chosen: [] }), {
    matches: [],
    writeIn: null,
    enter: null,
  });
});

test("matchKeywords offers a write-in unless the query is already a Keyword", () => {
  assert.equal(matchKeywords({ query: " kommando ", suggestions, chosen: [] }).writeIn, "KOMMANDO");
  assert.equal(matchKeywords({ query: "ork", suggestions, chosen: [] }).writeIn, null);
  assert.equal(matchKeywords({ query: "Kommando", suggestions, chosen: ["KOMMANDO"] }).writeIn, null);
  assert.equal(matchKeywords({ query: "or", suggestions, chosen: [] }).writeIn, "OR");
});

test("Enter adds exactly what was typed: the books' spelling, else the write-in", () => {
  const enter = (query: string, chosen: string[] = []) => matchKeywords({ query, suggestions, chosen }).enter;
  assert.equal(enter("tau"), "T'AU", "not the longer T'AU EMPIRE listed first");
  assert.equal(enter("[KABAL]"), "[KABAL]", "not KABALITE, though brackets fold away");
  assert.equal(enter("ast"), "AST", "a partial query is a write-in; the rows add the books' Keywords");
  assert.equal(enter("ork", ["ORK"]), null, "already chosen");
});

test("mixingHint warns on an ally with a non-Imperial Keyword only", () => {
  assert.equal(mixingHint({ stance: "ally", keywords: ["ORK", "KOMMANDO"] })?.text, MIXING_HINTS.ork);
  assert.equal(mixingHint({ stance: "ally", keywords: ["drukhari"] })?.text, MIXING_HINTS.aeldari);
  assert.equal(mixingHint({ stance: "ally", keywords: ["T'AU"] })?.text, MIXING_HINTS.other);
  assert.equal(mixingHint({ stance: "ally", keywords: ["ADEPTUS MECHANICUS", "IMPERIUM"] }), null);
  assert.equal(mixingHint({ stance: "ally", keywords: [] }), null);
  assert.equal(mixingHint({ stance: "rival", keywords: ["ORK"] }), null);
  assert.equal(mixingHint({ stance: "enemy", keywords: ["AELDARI"] }), null);
});
