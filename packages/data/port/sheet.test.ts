import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import {
  ATTRIBUTE_NAMES,
  ATTRIBUTES,
  attributeTotals,
  CHAOS_SPAWN_AT,
  CharacterStats,
  deriveStats,
  Overrides,
} from "@wg/shared";
import { loadEngine } from "./engine.ts";
import { buildRuleset, idOf } from "./ruleset.ts";

// The sheet's widgets, the GM's overrides and what a build over a hand-made sheet keeps (InconsisTable's house
// decisions #83, #96), against this repo's deriveStats and attributeTotals. Skipped when InconsisTable is not checked
// out beside this repo.
const engine = await loadEngine();
const skip = engine === null ? "InconsisTable is not checked out beside this repo" : false;
const RULESETS = [buildRuleset(), buildRuleset({ builder: "ledger" })];

const dir = new URL("../fixtures/pregens/", import.meta.url);
const PREGENS = readdirSync(dir)
  .filter((f) => f.endsWith(".json"))
  .sort()
  .map(
    (f) =>
      JSON.parse(readFileSync(new URL(f, dir), "utf8")) as { name: string; stats: unknown; build: { tier: number } },
  )
  .map((c) => ({ ...c, stats: CharacterStats.parse(c.stats) }));
const fieldsOf = (stats: CharacterStats) => ({
  baseSpeed: stats.speed,
  "armour.ar": stats.armour.ar,
  "armour.powered": stats.armour.powered,
  ...Object.fromEntries(ATTRIBUTES.map((a) => [`attr.${idOf(a)}`, stats.attributes[a]])),
  ...Object.fromEntries(Object.entries(stats.skills).map(([s, v]) => [`skill.${idOf(s)}`, v])),
  ...Object.fromEntries(Object.entries(stats.mods).map(([k, v]) => [`mod.${k}`, v])),
});

test("both rulesets pass InconsisTable's validator with the sheet's widgets", { skip }, () => {
  for (const r of RULESETS) {
    const c = engine!.compileRuleset(r);
    if (!c.ok) assert.fail(c.problems.map((p) => `${p.path}: ${p.message}`).join("\n"));
  }
});

test("a GM's override is the Trait deriveStats gives with it, and only Overrides' Traits take one", { skip }, () => {
  const c = engine!.compileRuleset(RULESETS[0]!);
  assert.ok(c.ok);
  const keys = Object.keys(Overrides.shape) as (keyof Overrides)[];
  for (const { name, stats, build } of PREGENS)
    for (const k of keys)
      for (const v of [1, 4, 13]) {
        const derived = engine!.deriveValues({
          compiled: c.compiled,
          entity: "agent",
          values: {
            fields: { ...fieldsOf(stats), [`override.${k}`]: v },
            campaign: engine!.campaignValues({ compiled: c.compiled, stored: { tier: build.tier } }),
          },
        });
        const want = deriveStats({ stats, overrides: { [k]: v }, tier: build.tier });
        for (const [trait, value] of Object.entries(want))
          assert.equal(derived[trait], value, `${name}, ${k} = ${v}: ${trait}`);
      }
  const agent = RULESETS[0]!.entities.find((e) => e.id === "agent")! as {
    derived: { id: string; override?: string }[];
  };
  const overridden = agent.derived.flatMap((d) => (d.override ? [d.id] : []));
  assert.deepEqual(overridden.sort(), [...keys].sort());
});

test("the sheet's Attribute totals and Resilience sum are attributeTotals and deriveStats", { skip }, () => {
  const c = engine!.compileRuleset(RULESETS[0]!);
  assert.ok(c.ok);
  for (const { name, stats, build } of PREGENS) {
    const derived = engine!.deriveValues({
      compiled: c.compiled,
      entity: "agent",
      values: {
        fields: fieldsOf(stats),
        campaign: engine!.campaignValues({ compiled: c.compiled, stored: { tier: build.tier } }),
      },
    });
    const totals = attributeTotals(stats);
    for (const a of ATTRIBUTES) {
      const id = `${idOf(ATTRIBUTE_NAMES[a])}Total`;
      assert.equal(derived[id], totals[a], `${name}: ${id}`);
      assert.equal(derived[`${idOf(ATTRIBUTE_NAMES[a])}Bonus`], totals[a] - stats.attributes[a], `${name}: ${a} bonus`);
    }
    assert.equal(
      derived.resilienceBase! + stats.armour.ar,
      deriveStats({ stats, overrides: {}, tier: build.tier }).resilience,
      `${name}: Resilience`,
    );
  }
});

test("Corruption's pips run to Chaos Spawn in the levels' steps, and a build over a sheet keeps armour and Wealth", () => {
  for (const r of RULESETS) {
    const pools = r.layout.agent.sections.find((s) => s.id === "pools")!.show;
    const pips = pools.find((x) => typeof x === "object" && x.widget === "pips") as { steps: { size: number }[] };
    assert.equal(
      pips.steps.reduce((n, s) => n + s.size, 0),
      CHAOS_SPAWN_AT,
    );
  }
  const ledger = RULESETS[1] as Extract<(typeof RULESETS)[number], { build: unknown }>;
  assert.deepEqual(ledger.build.keep, { fields: ["armour.ar", "armour.powered"], resources: ["wealth"] });
});
