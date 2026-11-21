import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import {
  ATTRIBUTES,
  CHAOS_SPAWN_AT,
  CharacterStats,
  deriveStats,
  exhaustedShock,
  isExhausted,
  isOut,
  mobBonusDice,
  pcHit,
  pcStatus,
  threatStatus,
  type Character,
  type Combatant,
  type LiveState,
  type ThreatCombatant,
} from "@wg/shared";
import { loadEngine, type Compiled } from "./engine.ts";
import { buildRuleset, idOf, THREAT_CLASSES } from "./ruleset.ts";

// What one hit does, as the ruleset's `health.harm` block says it (steps a to e and `muster` of the platform's
// primitive), against this repo's own damage rules over generated hits: pcHit for an Agent, combatant.adjust and
// combatant.update for a Threat (apps/api/src/encounter/encounter.actions.ts), pcStatus, threatStatus and isOut for
// the states after. The primitive is still being written, so `harm` and `muster` below are a reference of its rule,
// reading the generated block and evaluating its expressions through the platform engine's evaluator; when the engine
// offers `health.harm`, every case also runs through the real op. Skipped when InconsisTable is not checked out here.
const engine = await loadEngine();
const skip = engine === null ? "InconsisTable is not checked out beside this repo" : false;
const hasOp = engine?.PRIMITIVES["health.harm"]?.ops.hit !== undefined;
const skipOp =
  skip ||
  (!hasOp && "this InconsisTable checkout has no health.harm primitive yet: the cases ran against the reference only");

type Ruleset = ReturnType<typeof buildRuleset>;
type Harm = Ruleset["health"]["harm"];
type Profile = Harm["profiles"][number] & {
  shockless?: string;
  felled?: { when: string; injuries?: string; condition?: string; healTo?: string };
  destroyed?: { over: string; field: string };
};
type Scope = Record<string, unknown>;
type Actor = {
  entity: "agent" | "threat";
  fields: Record<string, unknown>;
  resources: Record<string, number>;
  conditions: string[];
  campaign: Scope;
};
type Hit = { wounds?: number; shock?: number };
type Outcome =
  | { refused: true }
  | { refused: false; resources: Record<string, number>; fields: Record<string, unknown>; added: string[] };

// A small seeded generator, so a failure names a case that can be replayed (as turns.test.ts has it).
function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1));
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(next() * xs.length)]!;
  return { next, int, pick };
}

const dir = new URL("../fixtures/pregens/", import.meta.url);
const PREGENS = readdirSync(dir)
  .filter((f) => f.endsWith(".json"))
  .sort()
  .map((f) => CharacterStats.parse((JSON.parse(readFileSync(new URL(f, dir), "utf8")) as { stats: unknown }).stats));

// A pregen's sheet as the ruleset's field rows (as ruleset.test.ts has it).
const fieldsOf = (stats: CharacterStats) => ({
  baseSpeed: stats.speed,
  "armour.ar": stats.armour.ar,
  "armour.powered": stats.armour.powered,
  ...Object.fromEntries(ATTRIBUTES.map((a) => [`attr.${idOf(a)}`, stats.attributes[a]])),
  ...Object.fromEntries(Object.entries(stats.skills).map(([s, v]) => [`skill.${idOf(s)}`, v])),
  ...Object.fromEntries(Object.entries(stats.mods).map(([k, v]) => [`mod.${k}`, v])),
});

function compile(ruleset: Ruleset): Compiled {
  const result = engine!.compileRuleset(ruleset);
  if (!result.ok) assert.fail(result.problems.map((p) => `${p.path}: ${p.message}`).join("\n"));
  return result.compiled;
}

const parsed = new Map<string, unknown>();
const ev = (source: string, scope: Scope) => {
  if (!parsed.has(source)) parsed.set(source, engine!.parseExpr(source));
  return engine!.evaluate({ node: parsed.get(source), scope });
};

function scopeOf(compiled: Compiled, a: Actor) {
  const values = { fields: a.fields, resources: a.resources, campaign: a.campaign };
  const derived = engine!.deriveValues({ compiled, entity: a.entity, values });
  return {
    derived,
    scope: engine!.actorScope({ fields: a.fields, derived, resources: a.resources, campaign: a.campaign }),
  };
}

const statesOf = (compiled: Compiled, a: Actor) =>
  engine!.healthStatesOf({ compiled, entity: a.entity, scope: scopeOf(compiled, a).scope }).sort();

// ── the reference of the primitive's rule ──

/** `hit { wounds?, shock? }`, steps a to e, every expression read on the actor before the hit. */
function harm(ruleset: Ruleset, compiled: Compiled, a: Actor, hit: Hit): Outcome {
  const h = ruleset.health.harm;
  const { scope } = scopeOf(compiled, a);
  const profile = h.profiles.find((p) => p.entities.includes(a.entity)) as Profile | undefined;
  let wounds = hit.wounds ?? 0;
  let shock = hit.shock ?? 0;
  const resources = { ...a.resources };
  const fields = { ...a.fields };
  const added: string[] = [];
  const done = (): Outcome => ({ refused: false, resources, fields, added });

  if (profile?.shockless !== undefined && shock !== 0 && ev(profile.shockless, scope) === true)
    return { refused: true };
  // b. A Mob: members lost to Wounds, one more to Shock past the shock track's max; nothing else changes.
  if (h.mob !== undefined && h.mob.members in a.resources) {
    const { max } = engine!.resourceBounds({ compiled, resource: h.mob.members, scope });
    const shockMax = engine!.resourceBounds({ compiled, resource: h.shock, scope }).max!;
    const after = resources[h.mob.members]! - wounds - (shock > shockMax ? 1 : 0);
    resources[h.mob.members] = Math.max(0, Math.min(max!, after));
    return done();
  }
  // a. Spent: Shock becomes Wounds.
  const spent = profile?.spent;
  const isSpent =
    spent !== undefined &&
    ((spent.when !== undefined && ev(spent.when, scope) === true) ||
      a.conditions.some((c) => spent.conditions?.includes(c)));
  if (isSpent && shock > 0) [wounds, shock] = [wounds + shock, 0];
  // c. Destroyed.
  if (profile?.destroyed !== undefined && wounds > (ev(profile.destroyed.over, scope) as number)) {
    fields[profile.destroyed.field] = true;
    return done();
  }
  // d. Shock.
  resources[h.shock] = Math.max(0, resources[h.shock]! + shock);
  // e. Wounds.
  const felled = profile?.felled;
  const current = resources[h.wounds]!;
  if (felled !== undefined && ev(felled.when, scope) === true) {
    if (wounds > 0) {
      if (felled.injuries !== undefined) fields[felled.injuries] = ((fields[felled.injuries] as number) ?? 0) + 1;
    } else if (wounds < 0) {
      const healTo = felled.healTo === undefined ? Infinity : (ev(felled.healTo, scope) as number);
      resources[h.wounds] = Math.max(0, Math.min(healTo, current + wounds));
    }
    return done();
  }
  resources[h.wounds] = Math.max(0, current + wounds);
  if (felled?.condition !== undefined) {
    const down = ev(felled.when, scopeOf(compiled, { ...a, fields, resources }).scope) === true;
    if (down) added.push(felled.condition);
  }
  return done();
}

/** `muster { members }`: start becomes max(start, members), members `members`. */
function muster(ruleset: Ruleset, a: Actor, members: number): Actor {
  const { mob } = ruleset.health.harm;
  return {
    ...a,
    fields: { ...a.fields, [mob.start]: Math.max(a.fields[mob.start] as number, members) },
    resources: { ...a.resources, [mob.members]: members },
  };
}

// ── the real op, once the platform has it ──

// The state the platform's api loads for the op (its ActorState: the entity type, a ready scope, a resource's shown
// max as `limit`, a condition's id), and the deltas it writes back (a resource added to, a field set, a condition laid).
function viaOp(ruleset: Ruleset, compiled: Compiled, a: Actor, op: "hit" | "muster", input: object): Outcome {
  const { derived, scope } = scopeOf(compiled, a);
  const resources = Object.fromEntries(
    Object.entries(a.resources).map(([id, value]) => {
      const b = engine!.resourceBounds({ compiled, resource: id, scope });
      return [id, { value, min: b.min, max: b.max, limit: b.max }];
    }),
  );
  const conditions = a.conditions.map((c, i) => ({
    id: `c${i}`,
    conditionId: c,
    expiresOn: "manual",
    expiresAfter: null,
  }));
  const actor = { id: "a", entity: a.entity, fields: a.fields, derived, scope, resources, conditions };
  const r = engine!.runOp({
    primitive: "health.harm",
    op,
    params: ruleset.health.harm,
    state: { actors: { a: actor }, turn: null },
    input: { actorId: "a", ...input },
  });
  if (!r.ok) {
    if (["badParams", "badInput", "unknownOp"].includes(r.refusal.code)) {
      assert.fail(`health.harm ${op}: ${r.refusal.code} ${r.refusal.detail ?? ""}: the adapter needs updating`);
    }
    return { refused: true };
  }
  const out = {
    refused: false as const,
    resources: { ...a.resources },
    fields: { ...a.fields },
    added: [] as string[],
  };
  for (const d of r.deltas) {
    const t = d.target as { resource?: string; field?: string; applyCondition?: string };
    if (t.resource !== undefined) {
      out.resources[t.resource] =
        d.kind === "add" ? out.resources[t.resource]! + (d.value as number) : (d.value as number);
    } else if (t.field !== undefined) {
      out.fields[t.field] = d.kind === "add" ? (out.fields[t.field] as number) + (d.value as number) : d.value;
    } else if (t.applyCondition !== undefined) out.added.push(t.applyCondition);
  }
  return out;
}

/** The op takes a hit of -100 to 100 on each track, one of them not zero; the reference takes any numbers. */
const sendable = (hit: Hit) =>
  [hit.wounds ?? 0, hit.shock ?? 0].every((n) => Math.abs(n) <= 100) &&
  ((hit.wounds ?? 0) !== 0 || (hit.shock ?? 0) !== 0);

/** The op lays no condition the actor already holds; the reference names it either way, as pcHit sets its flag. */
const unheld = (a: Actor, o: Outcome): Outcome =>
  o.refused ? o : { ...o, added: o.added.filter((c) => !a.conditions.includes(c)) };

// ── the cases ──

const CASES = 4000;
const RULESETS: [string, Ruleset, string | false][] = [
  ["by hand (0.1.x)", buildRuleset(), skip],
  [
    "ledger (0.2.x)",
    buildRuleset({ builder: "ledger" }),
    skip || (!engine?.BuildParams && "this InconsisTable checkout has no ledger builder"),
  ],
];
const labelsOf = (ruleset: Ruleset, entity: string) =>
  new Map(ruleset.health.states.filter((s) => s.entities.includes(entity)).map((s) => [s.label, s.id]));
const toIds = (labels: Map<string, string>, status: string[], what: string) =>
  status
    .map((l) => {
      const id = labels.get(l);
      if (id === undefined) assert.fail(`${what}: no state for "${l}"`);
      return id;
    })
    .sort();
const isUnable = (ruleset: Ruleset, states: string[]) =>
  states.some((s) => (ruleset.initiative.unableStates as readonly string[]).includes(s));

function agentCase(seed: number, ledger: boolean) {
  const { int, pick, next } = rng(seed);
  const stats = pick(PREGENS);
  const tier = int(1, 5);
  // The by-hand ruleset has no Lost state, so its Agents stay short of it.
  const corruption = ledger ? pick([0, CHAOS_SPAWN_AT - 1, CHAOS_SPAWN_AT, int(0, 30)]) : 0;
  const d = deriveStats({ stats: { ...stats, corruption }, overrides: {}, tier });
  const [W, S, T] = [d.maxWounds, d.maxShock, d.maxTraumatic];
  const wounds = Math.max(0, pick([0, 1, W - 1, W, W + 1, W + 3, int(0, 2 * W + 2)]));
  const shock = Math.max(0, pick([0, 1, S - 1, S, S + 1, int(0, 2 * S + 2)]));
  const c = {
    id: "ch",
    stats: { ...stats, corruption },
    overrides: {},
    wounds,
    shock,
    traumatic: pick([0, 0, 0, 1, T, T + 1, int(0, T + 2)]),
    annihilated: next() < 0.05,
    conditions: next() < 0.2 ? ["Exhausted"] : next() < 0.1 ? ["Prone"] : [],
  } as unknown as Character;
  // At and around each threshold: Max Wounds, twice Max Wounds (Annihilation), Max Shock, and back to 0.
  const near = (cur: number, max: number) =>
    pick([undefined, 0, 1, -1, -cur, -cur - 2, max - cur, max - cur + 1, 2 * max, 2 * max + 1, int(-10, 2 * max + 4)]);
  const hit: Hit = { wounds: near(wounds, W), shock: near(shock, S) };
  if (hit.wounds === undefined) delete hit.wounds;
  if (hit.shock === undefined) delete hit.shock;
  return { c, d, tier, hit };
}

const agentActor = (compiled: Compiled, c: Character, tier: number): Actor => ({
  entity: "agent",
  fields: { ...fieldsOf(c.stats), traumatic: c.traumatic, annihilated: c.annihilated },
  resources: { wounds: c.wounds, shock: c.shock, corruption: c.stats.corruption },
  conditions: c.conditions.map(idOf),
  campaign: engine!.campaignValues({ compiled, stored: { tier } }),
});

for (const [name, ruleset, skipThis] of RULESETS) {
  test(
    `${name}: ${CASES} hits on Agents do what pcHit does, and leave the states pcStatus gives`,
    { skip: skipThis },
    () => {
      const compiled = compile(ruleset);
      const labels = labelsOf(ruleset, "agent");
      const n = { converted: 0, injured: 0, annihilated: 0, prone: 0, healedDying: 0, deadProne: 0 };
      for (let seed = 1; seed <= CASES; seed++) {
        const { c, d, tier, hit } = agentCase(seed, name.startsWith("ledger"));
        const what = `${name}, Agent case ${seed} (${JSON.stringify(hit)} on ${c.wounds}/${d.maxWounds} W, ${c.shock}/${d.maxShock} S)`;
        const want = pcHit({ c, d, hit });
        const got = harm(ruleset, compiled, agentActor(compiled, c, tier), hit);
        assert.ok(!got.refused, `${what}: refused`);
        const before = pcStatus(c, d);
        // The one gap (reported): pcHit adds Prone to a Dead Agent whose Wounds cross Max Wounds (state.ts:673), where
        // the block's "down" is `felled.when`, which a Dead Agent never meets.
        if (before.includes("Dead") && want.prone) {
          n.deadProne++;
          want.prone = false;
        }
        assert.deepEqual(
          {
            wounds: got.resources.wounds,
            shock: got.resources.shock,
            traumatic: got.fields.traumatic,
            prone: got.added.includes("prone"),
            annihilated: got.fields.annihilated,
          },
          want,
          what,
        );
        if (isExhausted({ ...c, maxShock: d.maxShock }) && (hit.shock ?? 0) > 0) n.converted++;
        if (want.traumatic > c.traumatic) n.injured++;
        if (want.annihilated && !c.annihilated) n.annihilated++;
        if (want.prone) n.prone++;
        if (before.includes("Dying") && want.wounds < c.wounds) n.healedDying++;

        const after = { ...c, ...want } as Character;
        const states = statesOf(compiled, agentActor(compiled, after, tier));
        assert.deepEqual(states, toIds(labels, pcStatus(after, d), what), `${what}: states`);
        const table = { characters: [after], campaign: { tier } } as unknown as LiveState;
        const row = { kind: "pc", characterId: after.id } as unknown as Combatant;
        assert.equal(isUnable(ruleset, states), isOut(table, row), `${what}: out of the turn order`);
      }
      // The generator reaches every branch, so a step that broke one would show.
      console.log(JSON.stringify({ ruleset: name, agents: n }));
      for (const [k, v] of Object.entries(n)) if (k !== "deadProne") assert.ok(v >= 100, `only ${v} hits ${k}`);
    },
  );
}

// combatant.adjust (encounter.actions.ts:558-576), without the database: the Threat's counters after one hit, or null
// when it is refused. `bump` (core/sql.ts) is greatest(0, col + d).
function adjust(c: ThreatCombatant, a: Hit): ThreatCombatant | null {
  const maxShock = c.maxShock; // :558, statSnapshot.shock
  if (a.shock && maxShock === null) return null; // :559
  const mobLoss = (a.wounds ?? 0) + (a.shock !== undefined && maxShock !== null && a.shock > maxShock ? 1 : 0); // :563-564
  const hit = exhaustedShock({
    exhausted: isExhausted({ shock: c.shock, maxShock, conditions: c.conditions }),
    wounds: a.wounds,
    shock: a.shock,
  }); // :566-572
  return c.mobCount !== null
    ? { ...c, mobCount: Math.min(c.mobStart ?? c.mobCount, Math.max(0, c.mobCount - mobLoss)) } // :575
    : { ...c, wounds: Math.max(0, c.wounds + hit.wounds), shock: Math.max(0, c.shock + hit.shock) }; // :576
}

// combatant.update's sizing (encounter.actions.ts:531-539) for a Mob: the start rises to the new size.
const resize = (c: ThreatCombatant, mobCount: number): ThreatCombatant => ({
  ...c,
  mobCount,
  mobStart: Math.max(c.mobStart ?? 0, mobCount),
});

const CODES = Object.keys(THREAT_CLASSES) as (keyof typeof THREAT_CLASSES)[];

function threatCase(seed: number) {
  const { int, pick, next } = rng(seed);
  const mob = next() < 0.4;
  // A Mob is formed of Troops only (p.324).
  const threatClass = mob ? "T" : pick(CODES);
  const tier = int(1, 5);
  const maxWounds = int(1, 8);
  const maxShock = next() < 0.3 ? null : int(1, 6);
  const mobStart = mob ? pick([2, 3, 5, 10, int(2, 30), 500]) : null;
  const mobCount =
    mobStart === null ? null : pick([0, 1, mobStart >> 1, (mobStart + 1) >> 1, mobStart, int(0, mobStart)]);
  const near = (cur: number, max: number) =>
    pick([undefined, 0, 1, -1, -cur, -cur - 2, max - cur, max - cur + 1, 2 * max, int(-10, 2 * max + 4)]);
  const wounds = mob ? 0 : Math.max(0, pick([0, 1, maxWounds, maxWounds + 1, int(0, 2 * maxWounds)]));
  const shock = maxShock === null || mob ? 0 : Math.max(0, pick([0, maxShock, maxShock + 1, int(0, 2 * maxShock)]));
  const c = {
    id: "th",
    kind: "threat",
    threatClass,
    mobCount,
    mobStart,
    wounds,
    shock,
    maxWounds,
    maxShock,
    conditions: next() < 0.2 ? ["Exhausted"] : [],
  } as unknown as ThreatCombatant;
  const hit: Hit = {
    wounds:
      mobCount === null
        ? near(wounds, maxWounds)
        : pick([undefined, 0, 1, -1, mobCount, mobCount + 1, -mobStart! - 1, int(-5, 12)]),
    shock:
      maxShock === null
        ? pick([undefined, 0, 0, 1, -1, int(-3, 6)])
        : mobCount === null
          ? near(shock, maxShock)
          : pick([undefined, 0, -1, maxShock - 1, maxShock, maxShock + 1, int(0, 2 * maxShock + 2)]),
  };
  if (hit.wounds === undefined) delete hit.wounds;
  if (hit.shock === undefined) delete hit.shock;
  // A different class in every other column, so reading the wrong column shows.
  const other = THREAT_CLASSES[CODES.find((k) => k !== threatClass)!];
  return { c, tier, hit, other };
}

const threatActor = (compiled: Compiled, c: ThreatCombatant, tier: number, other: string): Actor => ({
  entity: "threat",
  fields: {
    ...Object.fromEntries(
      [1, 2, 3, 4, 5].map((n) => [`class.t${n}`, n === tier ? THREAT_CLASSES[c.threatClass] : other]),
    ),
    "stat.wounds": c.maxWounds,
    ...(c.maxShock === null ? {} : { "stat.shock": c.maxShock }),
    ...(c.mobStart === null ? {} : { "mob.start": c.mobStart }),
  },
  resources: { wounds: c.wounds, shock: c.shock, ...(c.mobCount === null ? {} : { members: c.mobCount }) },
  conditions: c.conditions.map(idOf),
  campaign: engine!.campaignValues({ compiled, stored: { tier } }),
});

function checkThreatStates(ruleset: Ruleset, compiled: Compiled, c: ThreatCombatant, a: Actor, what: string) {
  const states = statesOf(compiled, a);
  assert.deepEqual(states, toIds(labelsOf(ruleset, "threat"), threatStatus(c), what), `${what}: states`);
  const table = { characters: [], campaign: { tier: 1 } } as unknown as LiveState;
  assert.equal(isUnable(ruleset, states), isOut(table, c), `${what}: out of the turn order`);
  const { derived } = scopeOf(compiled, a);
  assert.equal(derived.mobBonusDice, c.mobCount === null ? 0 : mobBonusDice(c.mobCount), `${what}: Mob bonus dice`);
}

for (const [name, ruleset, skipThis] of RULESETS) {
  test(`${name}: ${CASES} hits on Threats and Mobs do what combatant.adjust does`, { skip: skipThis }, () => {
    const compiled = compile(ruleset);
    const n = {
      refusedShockless: 0,
      converted: 0,
      mobShockLoss: 0,
      mobHits: 0,
      mobSlain: 0,
      mobHealCapped: 0,
      single: 0,
    };
    for (let seed = 1; seed <= CASES; seed++) {
      const { c, tier, hit, other } = threatCase(seed);
      const what = `${name}, Threat case ${seed} (${JSON.stringify(hit)} on ${JSON.stringify(c)})`;
      const want = adjust(c, hit);
      const a = threatActor(compiled, c, tier, other);
      const got = harm(ruleset, compiled, a, hit);
      assert.equal(got.refused, want === null, `${what}: refused`);
      if (want === null || got.refused) {
        n.refusedShockless++;
        continue;
      }
      assert.deepEqual(
        { wounds: got.resources.wounds, shock: got.resources.shock, mobCount: got.resources.members ?? null },
        { wounds: want.wounds, shock: want.shock, mobCount: want.mobCount },
        what,
      );
      assert.deepEqual(got.added, [], `${what}: a Threat takes no Condition from a hit`);
      if (c.mobCount === null) {
        n.single++;
        if (isExhausted({ ...c }) && (hit.shock ?? 0) > 0) n.converted++;
      } else {
        n.mobHits++;
        if (c.maxShock !== null && (hit.shock ?? 0) > c.maxShock) n.mobShockLoss++;
        if (want.mobCount === 0 && c.mobCount > 0) n.mobSlain++;
        if (want.mobCount === c.mobStart && c.mobCount - (hit.wounds ?? 0) > c.mobStart!) n.mobHealCapped++;
      }
      checkThreatStates(ruleset, compiled, want, { ...a, fields: got.fields, resources: got.resources }, what);
    }
    console.log(JSON.stringify({ ruleset: name, threats: n }));
    for (const [k, v] of Object.entries(n)) assert.ok(v >= 100, `only ${v} hits ${k}`);
  });

  test(
    `${name}: a Mob spawned with N members starts full, and a single Threat carries none`,
    { skip: skipThis },
    () => {
      const compiled = compile(ruleset);
      const { mob } = ruleset.health.harm;
      for (const size of [2, 3, 10, 37, 500]) {
        const scope = engine!.actorScope({ fields: { "stat.wounds": 1, [mob.start]: size } });
        assert.equal(engine!.startValue({ compiled, resource: mob.members, scope }), size, `${size}`);
      }
      // Its bounds read the start field, which a single Threat leaves unset: the platform does not create the resource.
      const single = engine!.actorScope({ fields: { "stat.wounds": 1 } });
      assert.throws(() => engine!.startValue({ compiled, resource: mob.members, scope: single }));
    },
  );

  test(`${name}: resizing a Mob (muster) is combatant.update's rule`, { skip: skipThis }, () => {
    const compiled = compile(ruleset);
    let raised = 0;
    for (let seed = 1; seed <= CASES; seed++) {
      const { c, tier, other } = threatCase(seed);
      if (c.mobCount === null) continue;
      const { int, pick } = rng(seed + 1_000_000);
      const size = pick([0, 1, c.mobCount, c.mobStart!, c.mobStart! + 1, int(0, 500)]);
      const what = `${name}, Mob case ${seed} resized to ${size}`;
      const want = resize(c, size);
      const got = muster(ruleset, threatActor(compiled, c, tier, other), size);
      assert.deepEqual([got.resources.members, got.fields["mob.start"]], [want.mobCount, want.mobStart], what);
      const { max } = engine!.resourceBounds({ compiled, resource: "members", scope: scopeOf(compiled, got).scope });
      assert.ok(got.resources.members! <= max!, `${what}: past the start`);
      if (want.mobStart! > c.mobStart!) raised++;
      checkThreatStates(ruleset, compiled, want, got, what);
    }
    assert.ok(raised >= 100, `only ${raised} resizes raised the start`);
  });

  test(`${name}: the real health.harm op agrees with the reference`, { skip: skipThis || skipOp }, () => {
    const compiled = compile(ruleset);
    let sent = 0;
    for (let seed = 1; seed <= CASES; seed++) {
      const agent = agentCase(seed, name.startsWith("ledger"));
      const a = agentActor(compiled, agent.c, agent.tier);
      if (sendable(agent.hit)) {
        sent++;
        assert.deepEqual(
          viaOp(ruleset, compiled, a, "hit", agent.hit),
          unheld(a, harm(ruleset, compiled, a, agent.hit)),
          `Agent ${seed}`,
        );
      }
      const threat = threatCase(seed);
      const t = threatActor(compiled, threat.c, threat.tier, threat.other);
      if (sendable(threat.hit)) {
        sent++;
        assert.deepEqual(
          viaOp(ruleset, compiled, t, "hit", threat.hit),
          harm(ruleset, compiled, t, threat.hit),
          `Threat ${seed}`,
        );
      }
      if (threat.c.mobCount === null) continue;
      const size = rng(seed + 1_000_000).int(0, 500);
      const m = muster(ruleset, t, size);
      assert.deepEqual(
        viaOp(ruleset, compiled, t, "muster", { members: size }),
        {
          refused: false,
          resources: m.resources,
          fields: m.fields,
          added: [],
        },
        `Mob ${seed} muster`,
      );
    }
    assert.ok(sent >= CASES, `only ${sent} hits were within what the op takes`);
  });
}
