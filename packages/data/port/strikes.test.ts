import assert from "node:assert/strict";
import { test } from "node:test";
import { hitDn, mobBonusDice, threatAttackPool, woundsFromDamage } from "@wg/shared";
import { threats } from "../index.ts";
import { loadEngine, type Compiled } from "./engine.ts";
import { buildPack, SKILL_VARIANTS } from "./pack.ts";
import { buildRuleset } from "./ruleset.ts";

// The attack guide (InconsisTable's house decision #99) against this repo's attack.ts: a Threat's pool, the DN to hit
// and what a typed damage total does, over every printed weapon and both kinds of target. Skipped when InconsisTable
// is not checked out beside this repo.
const engine = await loadEngine();
const skip = engine === null ? "InconsisTable is not checked out beside this repo" : false;
type Side = { entity: string; scope: Record<string, unknown> };
type Plan = {
  pool: { total: number };
  beat: { total: number };
  soak: { total: number } | null;
  shows: { id: string; total: number }[];
  harm: { wounds: number; shock: number } | null;
};
const P = engine as unknown as {
  planStrike(a: {
    ruleset: unknown;
    strikeId: string;
    attacker: Side;
    target: Side;
    means: Record<string, unknown> | null;
    inputs: Record<string, unknown>;
    total: number | null;
  }): Plan | { code: string; detail: string };
};
const { pack } = buildPack();
const bodies = new Map(pack.entries.map((e) => [e.key, e.body]));

function side(compiled: Compiled, entity: string, fields: Record<string, unknown>, resources: Record<string, number>) {
  const campaign = engine!.campaignValues({ compiled, stored: { tier: 3 } });
  const derived = engine!.deriveValues({ compiled, entity, values: { fields, resources, campaign } });
  return { entity, scope: engine!.actorScope({ fields, derived, resources, campaign }) };
}

test("both rulesets pass InconsisTable's validator with their strikes", { skip }, () => {
  for (const r of [buildRuleset(), buildRuleset({ builder: "ledger" })]) {
    const c = engine!.compileRuleset(r);
    if (!c.ok) assert.fail(c.problems.map((p) => `${p.path}: ${p.message}`).join("\n"));
  }
});

test("a Threat's attack: threatAttackPool's dice, hitDn's DN, and woundsFromDamage's hit", { skip }, () => {
  const ruleset = buildRuleset();
  const c = engine!.compileRuleset(ruleset);
  assert.ok(c.ok);
  const list = [...threats.values()].filter((t) => bodies.has(t.id));
  let checked = 0;
  list.forEach((t, i) => {
    const weapon = t.abilities.flatMap((a) => a.weapons)[0];
    const body = bodies.get(t.id)!;
    const key = (body.weapons as string[] | undefined)?.[0];
    if (!weapon || !key) return;
    // The pack reads a misprinted Skill name as the Skill it means (SKILL_VARIANTS), where threatAttackPool matches the
    // printed name only and falls back to the Default pool (rules-flow §11.194).
    const named = {
      skills: { ...t.skills, list: t.skills.list.map((x) => ({ ...x, name: SKILL_VARIANTS[x.name] ?? x.name })) },
    };
    const { dice } = threatAttackPool(named, weapon);
    // A target: the next Threat, its Defence and Resilience printed, wounded or not as the attacker.
    const other = list[(i + 1) % list.length]!;
    const wounded = i % 3 === 0;
    const mob = i % 4 === 0 ? 5 : 0;
    const attacker = side(
      c.compiled,
      "threat",
      { ...body, ...(mob && { "mob.start": mob }) },
      { wounds: wounded ? 1 : 0, ...(mob && { members: mob }) },
    );
    const target = side(c.compiled, "threat", bodies.get(other.id)!, { wounds: 0 });
    for (const total of [0, 3, 6, 9, 14]) {
      const plan = P.planStrike({
        ruleset,
        strikeId: "threatAttack",
        attacker,
        target,
        means: bodies.get(key)!,
        inputs: {},
        total,
      });
      assert.ok("pool" in plan, `${t.id}: ${JSON.stringify(plan)}`);
      if (dice !== null) assert.equal(plan.pool.total, dice + (mob ? mobBonusDice(mob) : 0), `${t.id} pool`);
      // A Mob is not "Wounded" (threatStatus); a single Threat with Wounds under its max is.
      const isWounded = !mob && wounded && 1 <= t.wounds;
      assert.equal(plan.beat.total, hitDn({ defence: other.defence, attackerWounded: isWounded }), `${t.id} DN`);
      const want = woundsFromDamage({
        damage: total,
        resilience: other.resilience.value,
        ap: weapon.ap ?? 0,
        takesShock: other.shock !== null,
      });
      assert.deepEqual(plan.harm ?? { wounds: 0, shock: 0 }, want, `${t.id} → ${other.id}, ${total}`);
      checked++;
    }
  });
  assert.ok(checked > 1000, `${checked} cases`);
});

test("the phone's own strike reads no target value, and the GM's guide offers Critical Hits", () => {
  const ledger = buildRuleset({ builder: "ledger" });
  const strikes = ledger.strikes as { id: string; then?: { table: string } }[];
  const told = strikes.find((s) => s.id === "agentAttackTold")!;
  assert.ok(!JSON.stringify(told).includes("ctx.target"), "a Threat's Defence and Resilience are the GM's");
  for (const id of ["threatAttack", "agentAttack", "agentAttackTold"])
    assert.equal(strikes.find((s) => s.id === id)!.then?.table, "criticalHits", id);
  assert.equal(strikes.find((s) => s.id === "power")!.then?.table, "perils");
});
