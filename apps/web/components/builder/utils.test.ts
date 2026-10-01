import assert from "node:assert/strict";
import { describe, test } from "node:test";

import type { Draft } from "./builder-context.tsx";
import { pickDraft } from "./utils.ts";

// The volkus Disruptor's choices, cut down to what CharacterBuild needs (packages/data/build.test.ts has the whole one).
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
    // rewrote the Past, and attach-builds.ts saved the build (builtAt 200).
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
