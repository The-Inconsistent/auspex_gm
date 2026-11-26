import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import {
  ATTRIBUTES,
  CharacterStats,
  deriveStats,
  isExhausted,
  isGone,
  MAX_PENDING_SPENDS,
  pcStatus,
  rankOf,
  restoreShockAmount,
  spendCost,
  SPEND_KINDS,
  type Character,
} from "@wg/shared";
import { loadEngine, type Compiled } from "./engine.ts";
import { buildRuleset, idOf } from "./ruleset.ts";

// The spends (InconsisTable's house decision #84) against this repo's spendCost and spend.actions.ts: what each costs,
// when Restore Shock is open and what it restores, and Determination through the platform's own convert op. Skipped
// when InconsisTable is not checked out beside this repo.
const engine = await loadEngine();
const skip = engine === null ? "InconsisTable is not checked out beside this repo" : false;
const RULESETS = [buildRuleset(), buildRuleset({ builder: "ledger" })];

type Spend = {
  id: string;
  cost: { pool?: string; resource?: string; amount: string; byRun?: boolean }[];
  inputs?: Record<string, { min: number; max: string }>;
  if?: string;
  run?: { primitive: string; op: string; input: Record<string, string> }[];
};
const spendOf = (r: (typeof RULESETS)[number], id: string) => (r.spends as Spend[]).find((s) => s.id === id)!;
const ev = (source: string, scope: Record<string, unknown>) =>
  engine!.evaluate({ node: engine!.parseExpr(source), scope });

const dir = new URL("../fixtures/pregens/", import.meta.url);
const PREGENS = readdirSync(dir)
  .filter((f) => f.endsWith(".json"))
  .sort()
  .map((f) => CharacterStats.parse((JSON.parse(readFileSync(new URL(f, dir), "utf8")) as { stats: unknown }).stats));
const fieldsOf = (stats: CharacterStats) => ({
  baseSpeed: stats.speed,
  "armour.ar": stats.armour.ar,
  "armour.powered": stats.armour.powered,
  ...Object.fromEntries(ATTRIBUTES.map((a) => [`attr.${idOf(a)}`, stats.attributes[a]])),
  ...Object.fromEntries(Object.entries(stats.skills).map(([s, v]) => [`skill.${idOf(s)}`, v])),
  ...Object.fromEntries(Object.entries(stats.mods).map(([k, v]) => [`mod.${k}`, v])),
});

test("both rulesets pass InconsisTable's validator with their spends", { skip }, () => {
  for (const r of RULESETS) {
    const result = engine!.compileRuleset(r);
    if (!result.ok) assert.fail(result.problems.map((p) => `${p.path}: ${p.message}`).join("\n"));
  }
});

test("every spend kind of this repo is a spend, costing what spendCost says", { skip }, () => {
  const r = RULESETS[0]!;
  assert.deepEqual(r.requests, { max: MAX_PENDING_SPENDS });
  for (const kind of SPEND_KINDS) {
    const spend = spendOf(r, kind);
    for (const amount of [1, 2, 5, 10]) {
      const ctx = Object.fromEntries(Object.keys(spend.inputs ?? {}).map((k) => [k, amount]));
      // Determination is a roll, not a spend: its Icons are an input, not a cost (p.196).
      const used = kind === "gloryDice" || kind === "gloryDamage" ? amount : 1;
      const want = spendCost(kind, used);
      const got = { wrath: 0, glory: 0 };
      for (const c of spend.cost) got[(c.pool ?? c.resource) as "wrath" | "glory"] += ev(c.amount, { ctx }) as number;
      assert.deepEqual(got, want, `${kind} × ${amount}`);
    }
  }
});

// A generated Agent, as harm.test.ts makes them.
function agent(seed: number, tier: number) {
  const stats = PREGENS[seed % PREGENS.length]!;
  const d = deriveStats({ stats, overrides: {}, tier });
  const wounds = [0, 1, d.maxWounds, d.maxWounds + 1][seed % 4]!;
  const shock = [0, 1, d.maxShock, d.maxShock + 2][(seed >> 2) % 4]!;
  const traumatic = [0, d.maxTraumatic + 1][(seed >> 4) % 2]!;
  const corruption = [0, 26][(seed >> 5) % 2]!;
  const xp = [0, 40, 90][(seed >> 6) % 3]!;
  const c = {
    stats: { ...stats, corruption },
    overrides: {},
    wounds,
    shock,
    traumatic,
    annihilated: false,
    xp,
    conditions: [],
  } as unknown as Character;
  return { c, d };
}

function scopeOf(compiled: Compiled, c: Character, tier: number) {
  const fields = { ...fieldsOf(c.stats), traumatic: c.traumatic, xp: (c as unknown as { xp: number }).xp };
  const resources = { wounds: c.wounds, shock: c.shock, corruption: c.stats.corruption, wrath: 2 };
  const campaign = engine!.campaignValues({ compiled, stored: { tier } });
  const derived = engine!.deriveValues({ compiled, entity: "agent", values: { fields, resources, campaign } });
  return engine!.actorScope({ fields, derived, resources, campaign, ctx: { self: "a" } });
}

test("Restore Shock is open while conscious with Shock to restore, and restores Rank + Tier", { skip }, () => {
  for (const [i, r] of RULESETS.entries()) {
    const compiled = engine!.compileRuleset(r);
    if (!compiled.ok) assert.fail("compiles");
    const spend = spendOf(r, "restoreShock");
    for (let seed = 0; seed < 192; seed++)
      for (const tier of [1, 3, 5]) {
        const { c, d } = agent(seed, tier);
        // The by-hand ruleset has no Lost state, so its Agents stay short of Chaos Spawn.
        if (i === 0 && c.stats.corruption >= 26) continue;
        const status = pcStatus(c, d);
        const open = !(status.includes("Dying") || isGone(status)) && c.shock > 0;
        const scope = scopeOf(compiled.compiled, c, tier);
        assert.equal(ev(spend.if!, scope), open, `${r.version} case ${seed} at Tier ${tier}: ${status.join(", ")}`);
        const xp = (c as unknown as { xp: number }).xp;
        assert.equal(ev(spend.run![0]!.input.shock!, scope), -restoreShockAmount({ rank: rankOf(xp), tier }));
      }
  }
});

test("Determination turns min(Icons, Wounds) into Shock through convert, refused while Exhausted", { skip }, () => {
  const r = RULESETS[0]!;
  const compiled = engine!.compileRuleset(r);
  if (!compiled.ok) assert.fail("compiles");
  const step = spendOf(r, "determination").run![0]!;
  const n = { converted: 0, refused: 0 };
  for (let seed = 0; seed < 64; seed++)
    for (const icons of [1, 2, 4, 9]) {
      const { c, d } = agent(seed, 2);
      const scope = scopeOf(compiled.compiled, c, 2);
      const resources = Object.fromEntries(
        Object.entries({ wounds: c.wounds, shock: c.shock }).map(([id, value]) => {
          const b = engine!.resourceBounds({ compiled: compiled.compiled, resource: id, scope });
          return [id, { value, min: b.min, max: b.max, limit: b.max }];
        }),
      );
      const actor = { id: "a", entity: "agent", fields: {}, derived: scope.derived, scope, resources, conditions: [] };
      const out = engine!.runOp({
        primitive: step.primitive,
        op: step.op,
        params: r.health.harm,
        state: { actors: { a: actor }, turn: null },
        input: { actorId: "a", amount: ev(step.input.amount!, { ...scope, ctx: { icons } }) },
      });
      // spend.actions.ts: refused while Exhausted (p.199) or with no Wounds; else k = min(Icons, Wounds).
      const k = Math.min(icons, c.wounds);
      const refused = isExhausted({ shock: c.shock, maxShock: d.maxShock, conditions: [] }) || k <= 0;
      const what = `case ${seed}, ${icons} Icons on ${c.wounds} W, ${c.shock}/${d.maxShock} S`;
      assert.equal(!out.ok, refused, what);
      n[out.ok ? "converted" : "refused"]++;
      if (!out.ok) continue;
      const moved = Object.fromEntries(
        out.deltas.map((x) => [(x.target as { resource: string }).resource, x.value as number]),
      );
      assert.deepEqual(moved, { wounds: -k, shock: k }, what);
    }
  assert.ok(n.converted > 0 && n.refused > 0, JSON.stringify(n));
});
