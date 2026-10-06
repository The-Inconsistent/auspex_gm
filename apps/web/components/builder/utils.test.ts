import assert from "node:assert/strict";
import { describe, test } from "node:test";

import type { Draft, Lookups } from "./builder-context.tsx";
import { asBuilderStep, mergeOverrides, pickDraft, stepFromQuery, stepsFor } from "./utils.ts";

// The Disruptor pregen's choices, cut down to what CharacterBuild needs (packages/data/fixtures/pregens has the whole one).
const build = { tier: 1, archetypeId: "primaris-incursor" };
const draft = (savedAt: number, name = "Draft"): Draft => ({ tier: 1, name, savedAt });

describe("pickDraft", () => {
  test("the newer of this device's draft and the one saved away from it wins", () => {
    const local = draft(200, "Local");
    const sent = draft(100, "Sent");
    assert.equal(pickDraft({ local, start: { name: "X", draft: sent }, tier: 1 }).name, "Local");
    assert.equal(pickDraft({ local: draft(50, "Local"), start: { name: "X", draft: sent }, tier: 1 }).name, "Sent");
  });

  test("a build finished elsewhere after this device wrote its draft beats it", () => {
    // Phone half-builds at 100, tablet finishes and saves at 200: opening on the phone shows the finished build.
    const picked = pickDraft({
      local: draft(100, "Half"),
      start: { name: "Sila", build, draft: null, savedAt: 200 },
      tier: 1,
    });
    assert.equal(picked.name, "Sila");
    assert.equal(picked.archetypeId, "primaris-incursor");
  });

  test("a draft written after that save is still the newer one", () => {
    const picked = pickDraft({
      local: draft(300, "Newer"),
      start: { name: "Sila", build, draft: null, savedAt: 200 },
      tier: 1,
    });
    assert.equal(picked.name, "Newer");
  });

  test("a table: a draft this device kept from before the build was attached is dropped, detail and all", () => {
    // Issue #18: the tablet opened BUILD on a hand-made pregen (a blank draft with the texts as they were), the GM then
    // rewrote the Past, and the #18 migration script saved the build (builtAt 200).
    const old: Draft = { tier: 4, name: "Grimsson", detail: { past: "as printed" } };
    const picked = pickDraft({
      local: old,
      start: { name: "Grimsson", detail: { past: "rewritten" }, build, draft: null, savedAt: 200 },
      tier: 4,
    });
    assert.equal(picked.archetypeId, "primaris-incursor");
    assert.equal(picked.detail?.past, "rewritten");
  });

  test("with no savedAt (a character built before builtAt) a local draft always wins", () => {
    const picked = pickDraft({ local: draft(1, "Local"), start: { name: "Kaeso", build }, tier: 1 });
    assert.equal(picked.name, "Local");
  });

  test("no draft falls back to the saved build, then to a blank one at the bench's Tier", () => {
    assert.equal(pickDraft({ local: null, start: { name: "Kaeso", build }, tier: 4 }).tier, 1, "the build's own Tier");
    const blank = pickDraft({ local: null, start: { name: "New" }, tier: 4 });
    assert.deepEqual([blank.tier, blank.name, blank.archetypeId], [4, "New", undefined]);
  });

  test("a draft from before the builder kept the detail starts from the character's", () => {
    const picked = pickDraft({
      local: null,
      start: { name: "Kaeso", detail: { past: "Raised in the hive sumps" }, draft: draft(10) },
      tier: 1,
    });
    assert.deepEqual(picked.detail, { past: "Raised in the hive sumps" });
  });
});

describe("pickDraft without clocks (a table)", () => {
  test("a draft opened on an earlier save is stale, whatever this device's clock says", () => {
    const local: Draft = { ...draft(9_999_999, "Half"), builtAt: 100 };
    const picked = pickDraft({ local, start: { name: "Sila", build, draft: null, savedAt: 200 }, tier: 1 });
    assert.equal(picked.name, "Sila");
  });

  test("a draft opened on the current save stays, whatever this device's clock says", () => {
    const local: Draft = { ...draft(1, "Mine"), builtAt: 200 };
    const picked = pickDraft({ local, start: { name: "Sila", build, draft: null, savedAt: 200 }, tier: 1 });
    assert.equal(picked.name, "Mine");
  });
});

describe("mergeOverrides", () => {
  test("only the Traits changed here land on the live overrides", () => {
    const live = { maxWounds: 20, speed: 9 }; // speed set on another device since this builder opened
    assert.deepEqual(mergeOverrides({ live, base: { maxWounds: 20 }, edited: { maxWounds: 22 } }), {
      maxWounds: 22,
      speed: 9,
    });
    assert.deepEqual(mergeOverrides({ live, base: { maxWounds: 20 }, edited: {} }), { speed: 9 }, "cleared");
    assert.equal(mergeOverrides({ live, base: { maxWounds: 20 }, edited: { maxWounds: 20 } }), null, "unchanged");
  });
});

// Only the archetype's Tier matters to `stepsFor`.
const lookups = { archetypes: new Map([["primaris-incursor", { tier: 1 }]]) } as unknown as Lookups;
const steps = (o: { tier?: number; made?: boolean; locked?: boolean; ascending?: boolean }) =>
  stepsFor({
    draft: { tier: 1, name: "X", archetypeId: "primaris-incursor" },
    lookups,
    tier: o.tier ?? 1,
    made: o.made ?? false,
    locked: o.locked ?? false,
    ascending: o.ascending ?? false,
  });

describe("stepsFor", () => {
  test("ASCENSION appears at creation only when the archetype is below the campaign's Tier (Core p.148)", () => {
    assert.ok(!steps({}).includes("ascension"));
    assert.ok(steps({ tier: 3 }).includes("ascension"));
  });

  test("ADVANCE appears once the character is made, ASCENSION again when the group has Ascended (§11.55)", () => {
    assert.ok(!steps({}).includes("advance"));
    assert.deepEqual(steps({ made: true, ascending: true }).slice(-4), ["ascension", "detail", "advance", "review"]);
  });

  test("a player's made character sees only what is theirs to change", () => {
    assert.deepEqual(steps({ made: true, locked: true }), ["advance", "review"]);
    assert.deepEqual(steps({ made: true, locked: true, ascending: true }), ["ascension", "advance", "review"]);
  });
});

describe("stepFromQuery", () => {
  test("a link may ask for one screen (the sheet's LEVEL UP badge)", () => {
    assert.equal(stepFromQuery("?step=advance"), "advance");
    assert.equal(stepFromQuery("?other=1&step=ascension"), "ascension");
  });

  test("anything that doesn't name a screen is ignored", () => {
    assert.equal(stepFromQuery(""), null);
    assert.equal(stepFromQuery("?step=toString"), null);
    assert.equal(stepFromQuery("?step=nowhere"), null);
  });

  // The page reads the query on the server and hands the step in, so the value arrives as searchParams gives it: a
  // string, absent, or (a repeated parameter) an array.
  test("asBuilderStep takes what searchParams hands the page", () => {
    assert.equal(asBuilderStep("advance"), "advance");
    assert.equal(asBuilderStep(undefined), null);
    assert.equal(asBuilderStep(["advance", "review"]), null);
    assert.equal(asBuilderStep("nowhere"), null);
  });
});
