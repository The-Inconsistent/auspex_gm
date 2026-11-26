import assert from "node:assert/strict";
import { test } from "node:test";
import { rulesList } from "../index.ts";
import { buildCodexPack } from "./codex-packs.ts";
import { loadEngine, loadServedCheck } from "./engine.ts";
import { buildRuleset, COMBAT_GROUPS } from "./ruleset.ts";

// The phone's fight panels (InconsisTable's house decision #114, its pull request #257): a panel is drawn only on
// phones, so everything it reads must be in a player's served copy, which InconsisTable's own check says.
const engine = await loadEngine();
const served = await loadServedCheck();
const skip =
  engine === null
    ? "InconsisTable is not checked out beside this repo"
    : served === null
      ? "this InconsisTable checkout has no served-copy check (its house decision #113)"
      : false;

test("every panel reads only what a player's served copy keeps, in both rulesets", { skip }, () => {
  for (const r of [buildRuleset(), buildRuleset({ builder: "ledger" })]) {
    const c = engine!.compileRuleset(r);
    if (!c.ok) assert.fail(c.problems.map((p) => `${p.path}: ${p.message}`).join("\n"));
    assert.deepEqual(served!(c.compiled.ruleset), [], r.version);
  }
});

test("the combat options list every combat action once, in Auspex's groups, for every seat", () => {
  const actions = buildCodexPack().entries.filter((e) => e.type === "combatAction");
  const rules = rulesList().filter((r) => r.kind === "action");
  assert.deepEqual(actions.map((e) => e.key.slice("action.".length)).sort(), rules.map((r) => r.id).sort());
  for (const e of actions) {
    assert.equal(e.visibility, "party", e.key);
    assert.ok(
      COMBAT_GROUPS.some((g) => g.id === e.body.group),
      e.key,
    );
  }
});

test("the phone's Turn draws every panel, and the attack and the power only where the build gives them", () => {
  for (const r of [buildRuleset(), buildRuleset({ builder: "ledger" })]) {
    const turn = (r.layout as { agent: { phoneTurn: { widget: string; variant?: string }[] } }).agent.phoneTurn;
    const panels = (r as unknown as { panels: { id: string }[] }).panels;
    assert.deepEqual(
      turn.filter((w) => w.widget === "panel").map((w) => w.variant),
      panels.map((p) => p.id),
    );
    const strikes = turn.filter((w) => w.widget === "strike").map((w) => w.variant);
    assert.deepEqual(strikes, r.version.startsWith("0.2.") ? ["agentAttackTold", "power"] : [], r.version);
  }
});
