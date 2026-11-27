import assert from "node:assert/strict";
import { test } from "node:test";
import { ATTRIBUTE_NAMES, ATTRIBUTES, CHAOS_SPAWN_AT, mutationDns, rankOf, SKILLS, TEST_KINDS } from "@wg/shared";
import { loadEngine } from "./engine.ts";
import { buildRuleset, idOf } from "./ruleset.ts";

// The words of the Tests and the notices (InconsisTable's house decisions #77 and #79), against this repo's call form
// and the notices its actions return. Skipped when InconsisTable is not checked out beside this repo.
const engine = await loadEngine();
const skip = engine === null ? "InconsisTable is not checked out beside this repo" : false;
const RULESETS = [buildRuleset(), buildRuleset({ builder: "ledger" })];

test("both rulesets pass InconsisTable's validator with their words and notices", { skip }, () => {
  for (const r of RULESETS) {
    const result = engine!.compileRuleset(r);
    if (!result.ok) assert.fail(result.problems.map((p) => `${p.path}: ${p.message}`).join("\n"));
  }
});

test("every Test, input and option has a word, the printed Skill and Attribute names among them", () => {
  const { tests } = buildRuleset();
  type Words = {
    label?: string;
    inputs: Record<string, string>;
    inputOptions?: Record<string, string[]>;
    inputLabels?: Record<string, string>;
    inputOptionLabels?: Record<string, Record<string, string>>;
  };
  for (const [id, t] of Object.entries(tests as Record<string, Words>)) {
    assert.ok(t.label, `${id}: label`);
    for (const input of Object.keys(t.inputs)) assert.ok(t.inputLabels?.[input], `${id}.${input}`);
    for (const [input, options] of Object.entries(t.inputOptions ?? {}))
      for (const o of options) assert.ok(t.inputOptionLabels?.[input]?.[o], `${id}.${input}.${o}`);
  }
  for (const s of Object.keys(SKILLS)) assert.equal(tests.skill.inputOptionLabels.skill[idOf(s)], s);
  for (const a of ATTRIBUTES) assert.equal(tests.attribute.inputOptionLabels.attribute[idOf(a)], ATTRIBUTE_NAMES[a]);
});

test("every kind of Test this repo calls is a Test of the ruleset", () => {
  const { tests } = buildRuleset();
  // Influence and Resolve are the one trait Test, picked by its input (p.169, p.170).
  const named: Record<(typeof TEST_KINDS)[number], string> = {
    skill: "skill",
    attribute: "attribute",
    opposed: "opposed",
    influence: "trait",
    resolve: "trait",
    corruption: "corruption",
  };
  for (const kind of TEST_KINDS) assert.ok(tests[named[kind] as keyof typeof tests], kind);
  // An Opposed Test has no DN (p.170): the table reports who won.
  assert.equal(tests.opposed.kind, "reported");
  assert.ok(!("dn" in tests.opposed.inputs));
});

// The notices a change of the Agent's values raises: a `crossed` rule holds after and not before.
const { notices } = buildRuleset();
function crossed(before: Record<string, unknown>, after: Record<string, unknown>) {
  // A value a rule cannot read meets nothing, as the platform raises it (house decision #79).
  const holds = (n: (typeof notices)[number], scope: Record<string, unknown>) => {
    try {
      return engine!.evaluate({ node: engine!.parseExpr(n.if), scope }) === true;
    } catch {
      return false;
    }
  };
  return notices.filter((n) => n.when === "crossed" && !holds(n, before) && holds(n, after));
}
const corruptionScope = (points: number) => engine!.actorScope({ fields: {}, resources: { corruption: points } });
// Rank as the ruleset's own formula gives it, so the notice follows the sheet.
const rankScope = (xp: number) => {
  const agent = buildRuleset().entities[0] as { derived: { id: string; expr: string }[] };
  const expr = agent.derived.find((d) => d.id === "rank")!.expr;
  const rank = engine!.evaluate({ node: engine!.parseExpr(expr), scope: engine!.actorScope({ fields: { xp } }) });
  assert.equal(rank, rankOf(xp), `Rank at ${xp} XP`);
  return engine!.actorScope({ fields: { xp }, derived: { rank: rank as number } });
};

test("a Corruption gain raises a Mutation Test per level entered, as mutationDns, and Chaos Spawn", { skip }, () => {
  for (let before = 0; before <= CHAOS_SPAWN_AT + 2; before++)
    for (let after = before; after <= CHAOS_SPAWN_AT + 4; after++) {
      const told = crossed(corruptionScope(before), corruptionScope(after)).map((n) => n.text);
      const want = [
        ...mutationDns(before, after).map((dn) => `Mutation Test, DN ${dn}`),
        ...(before < CHAOS_SPAWN_AT && after >= CHAOS_SPAWN_AT ? ["Chaos Spawn"] : []),
      ];
      assert.equal(told.length, want.length, `${before} → ${after}`);
      want.forEach((w, i) => assert.ok(told[i]!.includes(w), `${before} → ${after}: ${told[i]} for ${w}`));
      // A fall says nothing (p.287).
      assert.equal(crossed(corruptionScope(after), corruptionScope(before)).length, 0);
    }
});

test("an award raises a notice per Rank reached, as session.end names the Rank", { skip }, () => {
  for (let xp = 0; xp <= 130; xp += 3)
    for (const award of [0, 8, 10, 12, 40, 100]) {
      const told = crossed(rankScope(xp), rankScope(xp + award)).map((n) => n.text);
      const risen = rankOf(xp + award) > rankOf(xp);
      assert.equal(told.length > 0, risen, `${xp} + ${award}`);
      if (risen) assert.equal(told.at(-1), `{name} reached Rank ${rankOf(xp + award)}`);
    }
});

test("every notice fits the platform's caps and cites its page", () => {
  for (const n of buildRuleset().notices) {
    assert.ok(n.text.length <= 120, n.id);
    assert.ok(n.cite, n.id);
  }
});
