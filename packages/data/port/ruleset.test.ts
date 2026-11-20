import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import {
  Action,
  ASCENSION_XP,
  ascensionGroup,
  ATTRIBUTES,
  CHAOS_SPAWN_AT,
  Character,
  SKILLS,
  attributeTotals,
  corruptionTestDn,
  deriveStats,
  pcStatus,
  poolMax,
  skillTotal,
  testPool,
  threatStatus,
  type ThreatCombatant,
  CharacterStats,
  type Skill,
} from "@wg/shared";
import { XP_AWARDS } from "../../../apps/web/components/gm/party/constants.ts";
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
const fieldsOf = (stats: CharacterStats) => ({
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
// The campaign's values as the engine reads them, for a stored Tier.
const campaignAt = (compiled: ReturnType<typeof compile>, tier: number) =>
  engine!.campaignValues({ compiled, stored: { tier } });

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
      values: { fields: fieldsOf(stats), resources: {}, campaign: campaignAt(compiled, build.tier) },
    });
    const want = deriveStats({ stats, overrides: {}, tier: build.tier });
    for (const [trait, value] of Object.entries(want)) assert.equal(derived[trait], value, `${name}: ${trait}`);
    for (const skill of Object.keys(SKILLS) as Skill[]) {
      assert.equal(derived[idOf(skill)], skillTotal(stats, skill), `${name}: ${skill}`);
    }
  }
});

test("a pregen copied in by hand through the creation steps gets the same field rows", { skip }, () => {
  const compiled = compile();
  const steps = buildRuleset().creation;
  for (const { name, stats } of PREGENS) {
    // Everything the sheet holds, with nothing for a rating or a bonus it does not list.
    const sheet: Record<string, unknown> = {
      ...Object.fromEntries(steps.flatMap((s) => s.fields).map((f) => [f, 0])),
      ...fieldsOf(stats),
      species: stats.species,
      archetype: stats.archetype,
      keywords: stats.keywords,
    };
    const answers = Object.fromEntries(
      steps.map((s) => [s.id, Object.fromEntries(s.fields.map((f) => [f, sheet[f]]))]),
    );
    const made = engine!.runCreation({ ruleset: compiled.ruleset, actor: "agent", answers, lookup: () => undefined });
    if (!made.ok) assert.fail(`${name}: ${made.problems.map((p) => `${p.path}: ${p.message}`).join("; ")}`);
    assert.deepEqual(made.fields, sheet, name);
  }
  // Only the Attributes are asked of everyone.
  const bare = engine!.runCreation({ ruleset: compiled.ruleset, actor: "agent", answers: {}, lookup: () => undefined });
  assert.deepEqual(bare.ok ? [] : bare.problems.map((p) => p.path), ["attributes"]);
});

test("a called Test rolls the pool testPool gives", { skip }, () => {
  const compiled = compile();
  const { stats, build } = PREGENS[0]!;
  const fields = fieldsOf(stats);
  const campaign = campaignAt(compiled, build.tier);
  const derived = engine!.deriveValues({ compiled, entity: "agent", values: { fields, resources: {}, campaign } });
  const character = { stats, overrides: {} } as Character;
  const pool = (test: string, ctx: Record<string, unknown>) =>
    engine!.evaluateInt({
      expr: compiled.tests[test]!.pool!,
      scope: engine!.actorScope({ fields, derived, campaign, ctx }),
    });
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
  const fields = fieldsOf(stats);
  const campaign = campaignAt(compiled, build.tier);
  for (let points = 0; points <= 30; points++) {
    const resources = { corruption: points };
    const derived = engine!.deriveValues({ compiled, entity: "agent", values: { fields, resources, campaign } });
    const scope = engine!.actorScope({ fields, derived, resources, campaign, ctx: { dn: 3 } });
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
  const fields = fieldsOf(stats);
  const campaign = campaignAt(compiled, build.tier);
  const target = (test: string, wounds: number, ignoreWounded: boolean) => {
    const resources = { wounds, corruption: 0 };
    const derived = engine!.deriveValues({ compiled, entity: "agent", values: { fields, resources, campaign } });
    const scope = engine!.actorScope({ fields, derived, resources, campaign, ctx: { dn: 3, ignoreWounded } });
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

// A Threat's five class columns: `at` is the one written for the campaign's Tier, `other` every other column.
const classColumns = (at: number, cls: string, other: string) =>
  Object.fromEntries([1, 2, 3, 4, 5].map((n) => [`class.t${n}`, n === at ? cls : other]));
const statesOf = (
  compiled: ReturnType<typeof compile>,
  tier: number,
  fields: Record<string, unknown>,
  res: Record<string, number>,
) => {
  const labels = new Map(compiled.ruleset.health.states.map((s) => [s.id, s.label]));
  const campaign = campaignAt(compiled, tier);
  const values = { fields, resources: res, campaign };
  const derived = engine!.deriveValues({ compiled, entity: "threat", values });
  const scope = engine!.actorScope({ fields, derived, resources: res, campaign });
  return engine!.healthStatesOf({ compiled, entity: "threat", scope }).map((id) => labels.get(id));
};

test("a single Threat's state is the one threatStatus gives for its class at the campaign Tier", { skip }, () => {
  const compiled = compile();
  const [maxWounds, max] = [4, 3];
  const classes = Object.keys(THREAT_CLASSES) as (keyof typeof THREAT_CLASSES)[];
  for (const threatClass of classes) {
    // A different class in every other column, so reading the wrong column shows.
    const other = THREAT_CLASSES[classes.find((c) => c !== threatClass)!];
    for (const tier of [1, 3, 5]) {
      for (const maxShock of [max, null]) {
        for (const wounds of [0, 1, maxWounds, maxWounds + 1]) {
          for (const shock of [0, max, max + 1]) {
            const fields = {
              ...classColumns(tier, THREAT_CLASSES[threatClass], other),
              "stat.wounds": maxWounds,
              ...(maxShock === null ? {} : { "stat.shock": maxShock }),
            };
            const want = threatStatus({
              threatClass,
              mobCount: null,
              wounds,
              shock,
              maxWounds,
              maxShock,
            } as ThreatCombatant);
            assert.deepEqual(
              statesOf(compiled, tier, fields, { wounds, shock }),
              want,
              `${threatClass} at Tier ${tier}, wounds ${wounds}/${maxWounds} shock ${shock}/${maxShock}`,
            );
          }
        }
      }
    }
  }
});

test("a Threat's class is the column of the campaign's Tier", { skip }, () => {
  const compiled = compile();
  // Troop is killed by Shock past its maximum, an Elite is Exhausted: the two differ on this one state.
  const res = { wounds: 0, shock: 4 };
  for (let tier = 1; tier <= 5; tier++) {
    const fields = {
      // Troop only in the column of this Tier; Elite in all the others.
      ...classColumns(tier, "troop", "elite"),
      "stat.wounds": 4,
      "stat.shock": 3,
    };
    assert.deepEqual(statesOf(compiled, tier, fields, res), ["Slain"], `Tier ${tier}: Troop`);
    const other = tier === 5 ? 1 : tier + 1;
    assert.deepEqual(statesOf(compiled, other, fields, res), ["Exhausted"], `Tier ${other}: Elite`);
  }
});

test("with nothing stored for the campaign the Tier in play is 1", { skip }, () => {
  const compiled = compile();
  const campaign = engine!.campaignValues({ compiled, stored: {} });
  assert.equal(campaign.tier, 1);
  const { stats } = PREGENS[0]!;
  const fields = fieldsOf(stats);
  const derived = engine!.deriveValues({ compiled, entity: "agent", values: { fields, resources: {}, campaign } });
  assert.equal(derived.maxWounds, deriveStats({ stats, overrides: {}, tier: 1 }).maxWounds);
});

// The ledger ruleset's play keys (`build.ascension`, `gone`, `award`): what happens after a character is made.
const ledger = buildRuleset({ builder: "ledger" }) as Extract<ReturnType<typeof buildRuleset>, { build: unknown }>;
const agentStates = ledger.health.states.filter((s) => !("entities" in s) || s.entities?.includes("agent"));

test("the ledger ruleset carries the play keys from this repo's constants, and the default one has none", () => {
  const { ascension, gone, award } = ledger.build;
  assert.equal(ascension.xp, ASCENSION_XP);
  assert.equal(ascension.cite, "Core pp.147-148");
  assert.deepEqual(award.suggested, [...XP_AWARDS]);
  assert.equal(award.cite, "Core p.321");
  // The server's limit on the XP of a session's end: the largest it accepts.
  const accepts = (xp: number) => Action.safeParse({ type: "session.end", xp }).success;
  assert.ok(accepts(award.max) && !accepts(award.max + 1) && accepts(0));
  assert.ok(award.suggested.length <= 6 && gone.length <= 10);
  assert.ok(award.suggested.every((n, i) => n >= 0 && n <= award.max && (i === 0 || n > award.suggested[i - 1]!)));
  const plain = buildRuleset();
  assert.ok(!("build" in plain));
  assert.ok(!JSON.stringify(plain).match(/"(ascension|gone|award)"|"lost"/));
});

test("every id in `gone` is a health state of the Agent", () => {
  const ids = new Set(agentStates.map((s) => s.id));
  assert.deepEqual(ledger.build.gone, ["dead", "lost"]);
  for (const id of ledger.build.gone) assert.ok(ids.has(id), id);
  const lost = agentStates.find((s) => s.id === "lost")!;
  assert.match(lost.when, new RegExp(`res\\.corruption\\) \\? res\\.corruption : 0\\) >= ${CHAOS_SPAWN_AT}$`));
});

// Seeded, so a failure repeats.
const seeded = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
};

test("who the ruleset's keys count and call short is who ascensionGroup does (300 groups)", () => {
  const next = seeded(318);
  const upTo = (n: number) => Math.floor(next() * (n + 1));
  const idOfLabel = new Map(agentStates.map((s) => [s.label, s.id]));
  const { gone, ascension } = ledger.build;
  let all = 0;
  let kept = 0;
  let behind = 0;
  for (let g = 0; g < 300; g++) {
    const { stats } = PREGENS[upTo(PREGENS.length - 1)]!;
    const tier = 1 + upTo(4);
    const characters = Array.from({ length: 1 + upTo(5) }, (_, i) => {
      const xpAtAscension = upTo(300);
      return {
        id: `c${i}`,
        stats: { ...stats, corruption: upTo(32) },
        overrides: {},
        wounds: upTo(25),
        shock: upTo(25),
        traumatic: upTo(8),
        // The ruleset has no state for a hit past twice Max Wounds, so it is left out of both sides.
        annihilated: false,
        xp: xpAtAscension + upTo(160),
        xpAtAscension,
      } as Character;
    });
    const want = ascensionGroup(characters, tier);
    // A character's states are the ruleset's ids for what pcStatus names.
    const counted = characters.filter(
      (c) =>
        !pcStatus(c, deriveStats({ stats: c.stats, overrides: c.overrides, tier }))
          .map((label) => idOfLabel.get(label))
          .some((id) => id !== undefined && gone.includes(id)),
    );
    const short = counted.filter((c) => c.xp - c.xpAtAscension < ascension.xp);
    all += characters.length;
    kept += counted.length;
    behind += short.length;
    assert.deepEqual(
      counted.map((c) => c.id),
      want.group.map((c) => c.id),
      `group ${g}`,
    );
    assert.deepEqual(
      short.map((c) => c.id),
      want.short.map((c) => c.id),
      `group ${g}: short`,
    );
  }
  // The cases cover every outcome, so a key that dropped one would show.
  assert.ok(kept < all && behind > 0 && behind < kept);
});

// What the validator cannot say: the Agent is Lost where pcStatus says so. The ledger ruleset compiles only on a
// checkout with the ledger builder.
test(
  "the Agent's Lost state holds at the Corruption level pcStatus calls Lost",
  { skip: skip || (!engine?.BuildParams && "this InconsisTable checkout has no ledger builder") },
  () => {
    const compiled = engine!.compileRuleset(ledger);
    if (!compiled.ok) assert.fail(compiled.problems.map((p) => `${p.path}: ${p.message}`).join("\n"));
    const { stats, build } = PREGENS[0]!;
    const fields = fieldsOf(stats);
    const campaign = campaignAt(compiled.compiled, build.tier);
    for (let corruption = 0; corruption <= 30; corruption++) {
      const resources = { corruption, wounds: 0, shock: 0 };
      const values = { fields, resources, campaign };
      const derived = engine!.deriveValues({ compiled: compiled.compiled, entity: "agent", values });
      const scope = engine!.actorScope({ fields, derived, resources, campaign });
      const states = engine!.healthStatesOf({ compiled: compiled.compiled, entity: "agent", scope });
      assert.equal(states.includes("lost"), corruption >= CHAOS_SPAWN_AT, `${corruption} Corruption`);
    }
  },
);
