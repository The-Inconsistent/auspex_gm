import { test } from "node:test";
import assert from "node:assert/strict";
import { rankOf, treeOfLearning } from "./creation.ts";

test("rankOf: +1 per 40 XP earned, at most 3 (Core pp.146–147)", () => {
  assert.equal(rankOf(0), 1);
  assert.equal(rankOf(39), 1);
  assert.equal(rankOf(60), 2); // Emmet's example
  assert.equal(rankOf(80), 3);
  assert.equal(rankOf(400), 3);
});

test("treeOfLearning: raising a Skill to R needs R Skills with points (Core p.26, §11.52)", () => {
  // Jordan's example: Athletics 4 once she has four Skills
  assert.equal(treeOfLearning({ Athletics: 1 }, "Athletics", 2), false);
  assert.equal(treeOfLearning({ Athletics: 3, Awareness: 1, "Ballistic Skill": 1, Stealth: 1 }, "Athletics", 4), true);
  // An Imperial Guardsman's printed Ballistic Skill 2 is exempt, but raising it to 3 needs a third Skill
  assert.equal(treeOfLearning({ "Ballistic Skill": 2 }, "Awareness", 1), true);
  assert.equal(treeOfLearning({ "Ballistic Skill": 2, Awareness: 1 }, "Ballistic Skill", 3), false);
});
