import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import {
  ATTRIBUTES,
  Character,
  SKILLS,
  attributeTotals,
  corruptionTestDn,
  deriveStats,
  poolMax,
  skillTotal,
  testPool,
  threatStatus,
  type ThreatCombatant,
  CharacterStats,
  type Skill,
} from "@wg/shared";
import { loadEngine } from "./engine.ts";
import { buildRuleset, idOf, THREAT_CLASSES } from "./ruleset.ts";

// The parity target of the port: the ruleset InconsisTable runs must give, for every pregen, the numbers this repo's
// own rule functions give. Skipped when InconsisTable is not checked out beside this repo.
const engine = await loadEngine();
const skip = engine === null ? "InconsisTable is not checked out beside this repo" : false;

const dir = new URL("../fixtures/pregens/", import.meta.url);
const PREGENS = readdirSync(dir)
  .filter((f) => f.endsWith(".json"))
  .sort()
  .map(
    (f) =>
      JSON.parse(readFileSync(new URL(f, dir), "utf8")) as { name: string; stats: unknown; build: { tier: number } },
  )
  .map((c) => ({ ...c, stats: CharacterStats.parse(c.stats) }));

// A pregen's sheet as the ruleset's field rows.
const fieldsOf = (stats: CharacterStats, tier: number) => ({
  tier,
  baseSpeed: stats.speed,
  "armour.ar": stats.armour.ar,
  "armour.powered": stats.armour.powered,
  ...Object.fromEntries(ATTRIBUTES.map((a) => [`attr.${idOf(a)}`, stats.attributes[a]])),
  ...Object.fromEntries(Object.entries(stats.skills).map(([s, v]) => [`skill.${idOf(s)}`, v])),
  ...Object.fromEntries(Object.entries(stats.mods).map(([k, v]) => [`mod.${k}`, v])),
});

const compile = () => {
  const result = engine!.compileRuleset(buildRuleset());
  if (!result.ok) assert.fail(result.problems.map((p) => `${p.path}: ${p.message}`).join("\n"));
  return result.compiled;
};

test("the ruleset passes InconsisTable's validator", { skip }, () => {
  compile();
});

test("every pregen's Traits and Skill totals match deriveStats and skillTotal", { skip }, () => {
  const compiled = compile();
  for (const { name, stats, build } of PREGENS) {
    assert.equal(stats.mutations.length, 0, `${name}: mutations change Attributes, which this stage does not port`);
    const derived = engine!.deriveValues({
      compiled,
      entity: "agent",
      values: { fields: fieldsOf(stats, build.tier), resources: {} },
    });
    const want = deriveStats({ stats, overrides: {}, tier: build.tier });
    for (const [trait, value] of Object.entries(want)) assert.equal(derived[trait], value, `${name}: ${trait}`);
    for (const skill of Object.keys(SKILLS) as Skill[]) {
      assert.equal(derived[idOf(skill)], skillTotal(stats, skill), `${name}: ${skill}`);
    }
  }
});

test("a called Test rolls the pool testPool gives", { skip }, () => {
  const compiled = compile();
  const { stats, build } = PREGENS[0]!;
  const fields = fieldsOf(stats, build.tier);
  const derived = engine!.deriveValues({ compiled, entity: "agent", values: { fields, resources: {} } });
  const character = { stats, overrides: {} } as Character;
  const pool = (test: string, ctx: Record<string, unknown>) =>
    engine!.evaluateInt({ expr: compiled.tests[test]!.pool!, scope: engine!.actorScope({ fields, derived, ctx }) });
  const called = (t: object) =>
    testPool({ character, tier: build.tier, test: { skill: null, attribute: null, dn: 3, ...t } as never });

  for (const skill of Object.keys(SKILLS) as Skill[]) {
    assert.equal(pool("skill", { skill: idOf(skill) }), called({ kind: "skill", skill }), skill);
  }
  for (const attribute of ATTRIBUTES) {
    assert.equal(pool("attribute", { attribute: idOf(attribute) }), attributeTotals(stats)[attribute], attribute);
  }
  assert.equal(pool("trait", { trait: "influence" }), called({ kind: "influence" }));
  assert.equal(pool("trait", { trait: "resolve" }), called({ kind: "resolve" }));
  assert.equal(pool("corruption", {}), called({ kind: "corruption" }));
});

test("a Corruption Test's DN adds the level's modifier", { skip }, () => {
  const compiled = compile();
  const { stats, build } = PREGENS[0]!;
  const fields = fieldsOf(stats, build.tier);
  for (let points = 0; points <= 30; points++) {
    const resources = { corruption: points };
    const derived = engine!.deriveValues({ compiled, entity: "agent", values: { fields, resources } });
    const scope = engine!.actorScope({ fields, derived, resources, ctx: { dn: 3 } });
    assert.equal(
      engine!.evaluateInt({ expr: compiled.tests.corruption!.target, scope }),
      corruptionTestDn({ source: 3, points }),
      `${points} Corruption`,
    );
  }
});

// The one place the ruleset departs from this repo on purpose: callDn leaves the Wounded +1 DN (p.193) to the GM, the
// ruleset adds it to every called Test, and the call's ignoreWounded tick takes it off.
test("a Wounded Agent's called Test has +1 DN unless the call ignores it", { skip }, () => {
  const compiled = compile();
  const { stats, build } = PREGENS[0]!;
  const fields = fieldsOf(stats, build.tier);
  const target = (test: string, wounds: number, ignoreWounded: boolean) => {
    const resources = { wounds, corruption: 0 };
    const derived = engine!.deriveValues({ compiled, entity: "agent", values: { fields, resources } });
    const scope = engine!.actorScope({ fields, derived, resources, ctx: { dn: 3, ignoreWounded } });
    return engine!.evaluateInt({ expr: compiled.tests[test]!.target, scope });
  };
  for (const id of Object.keys(compiled.tests)) {
    assert.equal(target(id, 0, false), 3, `${id}: not Wounded`);
    assert.equal(target(id, 1, false), 4, `${id}: Wounded`);
    assert.equal(target(id, 1, true), 3, `${id}: Wounded, ignored`);
  }
});

test("Glory and Ruin are capped as poolMax caps them", { skip }, () => {
  const compiled = compile();
  for (let players = 1; players <= 8; players++) {
    const scope = engine!.actorScope({ fields: {}, party: { characters: players } });
    assert.equal(engine!.resourceBounds({ compiled, resource: "glory", scope }).max, poolMax("glory", players));
    assert.equal(engine!.resourceBounds({ compiled, resource: "ruin", scope }).max, poolMax("ruin", players));
  }
});

test("a single Threat's state is the one threatStatus gives", { skip }, () => {
  const compiled = compile();
  const labels = new Map(compiled.ruleset.health.states.map((s) => [s.id, s.label]));
  const [maxWounds, max] = [4, 3];
  for (const threatClass of Object.keys(THREAT_CLASSES) as (keyof typeof THREAT_CLASSES)[]) {
    for (const maxShock of [max, null]) {
      for (const wounds of [0, 1, maxWounds, maxWounds + 1]) {
        for (const shock of [0, max, max + 1]) {
          const fields = {
            threatClass: THREAT_CLASSES[threatClass],
            "stat.wounds": maxWounds,
            ...(maxShock === null ? {} : { "stat.shock": maxShock }),
          };
          const resources = { wounds, shock };
          const derived = engine!.deriveValues({ compiled, entity: "threat", values: { fields, resources } });
          const scope = engine!.actorScope({ fields, derived, resources });
          const got = engine!.healthStatesOf({ compiled, entity: "threat", scope }).map((id) => labels.get(id));
          const want = threatStatus({
            threatClass,
            mobCount: null,
            wounds,
            shock,
            maxWounds,
            maxShock,
          } as ThreatCombatant);
          assert.deepEqual(got, want, `${threatClass} wounds ${wounds}/${maxWounds} shock ${shock}/${maxShock}`);
        }
      }
    }
  }
});
