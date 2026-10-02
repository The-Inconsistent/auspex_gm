import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BeatTest,
  CodexInput,
  DN_TABLE,
  MAX_POOL_LINES,
  Pack,
  PoolEntry,
  PoolSpend,
  TestKind,
  canSpend,
  retypeTest,
} from "./index.ts";

const ok = (t: object) => BeatTest.safeParse(t).success;
const awareness = { kind: "skill", skill: "Awareness", dn: 3 };

test("the DN table is the six rows on Core p.161", () => {
  assert.deepEqual(
    DN_TABLE.map((r) => `${r.dn} ${r.modifier} ${r.name}`),
    ["1 -2 Easy", "3 0 Standard", "5 2 Challenging", "7 4 Difficult", "9 6 Extreme", "12 9 Near Impossible"],
  );
});

test("a scene Test names the pool its kind rolls (issue #39, Core pp.169-170)", () => {
  assert.ok(ok(awareness));
  assert.ok(ok({ kind: "attribute", attribute: "S", dn: 5 }));
  assert.ok(ok({ kind: "opposed", skill: "Persuasion" }));
  assert.ok(ok({ kind: "opposed", attribute: "S" }));
  assert.ok(ok({ kind: "resolve", dn: 5, who: "each" }));
  assert.equal(ok({ kind: "skill", dn: 3 }), false, "a Skill Test without a Skill");
  assert.equal(ok({ ...awareness, attribute: "Int" }), false, "its Attribute comes from SKILLS, never stored");
  assert.equal(ok({ kind: "attribute", dn: 3 }), false, "an Attribute Test without an Attribute");
  assert.equal(ok({ kind: "opposed", skill: "Persuasion", dn: 3 }), false, "an Opposed Test has no DN");
  assert.equal(ok({ kind: "opposed", skill: "Persuasion", attribute: "S" }), false, "one pool per side");
  assert.equal(ok({ kind: "opposed" }), false, "an Opposed Test without a pool");
  assert.equal(ok({ kind: "corruption", skill: "Scholar", dn: 3 }), false, "Conviction is a trait, not a Skill");
  assert.ok(ok({ kind: "influence" }), "a DN the GM sets at the table (§11.75)");
  assert.ok(ok({ kind: "skill", skill: "Survival" }), "likewise for a Skill Test");
});

test("a scene Test's DN and Shift ladder are bounded", () => {
  assert.equal(ok({ ...awareness, dn: 0 }), false);
  assert.equal(ok({ ...awareness, dn: 21 }), false);
  assert.ok(ok({ ...awareness, shifts: ["1", "2", "3", "4", "5"] }));
  assert.equal(ok({ ...awareness, shifts: ["1", "2", "3", "4", "5", "6"] }), false);
});

test("a scene without Tests has none, and a pack's Tests reach the scene", () => {
  const beat = CodexInput.beat.parse({ adventureId: "00000000-0000-4000-8000-000000000001", title: "Arrival" });
  assert.deepEqual(beat.tests, []);
  const pack = Pack.parse({
    campaign: { name: "Pack", tier: 1 },
    adventures: [
      { key: "a", title: "A", beats: [{ title: "B", tests: [{ kind: "skill", skill: "Survival", dn: 5 }] }] },
    ],
  });
  assert.deepEqual(pack.adventures[0]!.beats[0]!.tests, [
    {
      kind: "skill",
      skill: "Survival",
      attribute: null,
      dn: 5,
      who: "one",
      purpose: "",
      shifts: [],
      onSuccess: "",
      onFailure: "",
    },
  ]);
});

test("a Test moved to another kind stays valid and keeps what fits", () => {
  const start = BeatTest.parse(awareness);
  for (const from of TestKind.options)
    for (const to of TestKind.options) {
      const t = retypeTest(retypeTest(start, from), to);
      assert.ok(ok(t), `${from} → ${to}`);
    }
  assert.deepEqual(
    [retypeTest(start, "opposed").skill, retypeTest(start, "opposed").dn, retypeTest(start, "resolve").dn],
    ["Awareness", null, 3],
  );
  const laddered = BeatTest.parse({ ...awareness, shifts: ["Gain Information"] });
  assert.deepEqual(retypeTest(laddered, "opposed").shifts, [], "no DN to Shift against (Core p.165)");
  assert.deepEqual(retypeTest(laddered, "resolve").shifts, ["Gain Information"]);
});

test("a scene's Ruin and Glory lines are bounded, and a Glory award starts at 1 (issue #40, §11.77)", () => {
  const entry = (e: object) => PoolEntry.safeParse(e).success;
  assert.equal(PoolEntry.parse({ text: "[impressive feat]" }).amount, 1, "Core p.316 prints no amount");
  assert.ok(entry({ text: "[trigger]", amount: 10 }));
  assert.equal(entry({ text: "[trigger]", amount: 0 }), false);
  assert.equal(entry({ text: "[trigger]", amount: 11 }), false, "an app limit, not a rule");
  assert.equal(entry({ text: "x".repeat(201) }), false);
  const spend = (s: object) => PoolSpend.safeParse({ name: "[spend]", ...s }).success;
  assert.ok(spend({ pool: "ruin", cost: 2 }));
  assert.ok(spend({ pool: "glory", cost: 3 }), "the books plan Glory spends too");
  assert.equal(spend({ cost: 2 }), false, "a spend names its pool");
  assert.equal(spend({ pool: "ruin" }), false, "and its cost: the app never invents one");
  assert.equal(spend({ pool: "wrath", cost: 1 }), false, "Wrath is per character, not a scene's");

  const beat = { adventureId: "00000000-0000-4000-8000-000000000001", title: "Arrival" };
  const b = CodexInput.beat.parse(beat);
  assert.deepEqual([b.ruin, b.glory, b.spends], [[], [], []], "a scene from before issue #40 has none");
  const many = Array.from({ length: MAX_POOL_LINES + 1 }, () => ({ text: "[trigger]" }));
  assert.equal(CodexInput.beat.safeParse({ ...beat, ruin: many }).success, false);
});

test("a spend the pool can't pay is refused before it's sent", () => {
  const pools = { glory: 2, ruin: 1 };
  assert.ok(canSpend(pools, { pool: "glory", cost: 2 }));
  assert.equal(canSpend(pools, { pool: "ruin", cost: 2 }), false, "pool.adjust would floor at 0 and undercharge");
  assert.ok(canSpend(pools, { pool: "ruin", cost: 1 }));
});
