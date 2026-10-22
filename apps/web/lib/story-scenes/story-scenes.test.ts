import assert from "node:assert/strict";
import { test } from "node:test";

import { exitNumber, readiness, sceneFixes, tagline, toggleId } from "./story-scenes.ts";

const beat = (over: object) => ({ goal: "g", readAloud: "r", exits: [], ...over }) as never;

test("a scene is ready with a goal, a read-aloud and wired exits", () => {
  assert.deepEqual(sceneFixes(beat({}), ["a"]), []);
  assert.equal(readiness([]), "READY ✓");
});

test("each gap is one fix, and an exit to a deleted scene counts as unwired", () => {
  const exits = [
    { label: "x", beatId: null },
    { label: "y", beatId: "gone" },
    { label: "z", beatId: "a" },
  ];
  const fixes = sceneFixes(beat({ goal: " ", readAloud: "", exits }), ["a"]);
  assert.deepEqual(fixes, ["NO GOAL", "NO READ-ALOUD", "2 EXITS WITH NO SCENE"]);
  assert.equal(readiness(fixes), "3 TO FIX");
});

test("the tagline names the type, the cast and the fight", () => {
  const encounter = [{ threatId: "ork-boy", count: 6, asMob: true, label: undefined }] as never;
  const names = { npcNames: ["Vex"], threatNames: new Map([["ork-boy", "Ork Boy"]]) };
  assert.equal(tagline({ type: "combat", encounter } as never, names), "COMBAT · Vex · FIGHT: Ork Boy ×6 (mob)");
  assert.equal(tagline({ type: "rest", encounter: [] } as never, { ...names, npcNames: [] }), "REST");
});

test("exitNumber is the target's two-digit place, null when it leads nowhere", () => {
  assert.equal(exitNumber("b", ["a", "b"]), "02");
  assert.equal(exitNumber(null, ["a"]), null);
  assert.equal(exitNumber("gone", ["a"]), null);
});

test("toggleId adds a missing id and drops a present one", () => {
  assert.deepEqual(toggleId(["a"], "b"), ["a", "b"]);
  assert.deepEqual(toggleId(["a", "b"], "a"), ["b"]);
});
