import assert from "node:assert/strict";
import { test } from "node:test";
import { canAct, canSeize, isOut, sideOf, sideUpNext, type Combatant, type LiveState } from "@wg/shared";
import { loadEngine } from "./engine.ts";
import { buildRuleset } from "./ruleset.ts";

// The turn order InconsisTable runs (`initiative.sides`, as the ruleset configures it) against this repo's own turn
// rules, over generated fights: which side is up (sideUpNext), who may start a Turn (canAct and the checks of
// turn.start), who may Seize (canSeize and the checks of turn.seize), and what Round 0, BEGIN ROUND 1 and a new Round
// do. Skipped when InconsisTable is not checked out beside this repo.
const engine = await loadEngine();
const skip = engine === null ? "InconsisTable is not checked out beside this repo" : false;
const params = buildRuleset().initiative;

// A small seeded generator, so a failure names a fight that can be replayed.
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Fight = { state: LiveState; glory: number; ruin: number };

function fight(seed: number): Fight {
  const r = rng(seed);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!;
  const flags = () => {
    const acted = r() < 0.35;
    return { acted, ambushed: r() < 0.25, held: acted && r() < 0.2, manifested: false };
  };
  const combatants: Combatant[] = [];
  for (let i = 1 + Math.floor(r() * 3); i > 0; i--)
    combatants.push({ id: `pc${i}`, kind: "pc", characterId: `ch${i}`, ...flags() } as Combatant);
  for (let i = 1 + Math.floor(r() * 3); i > 0; i--) {
    // Past Max Wounds a Troop is Slain (out of the fight) and an Adversary is still the GM's call (in it).
    const over = r() < 0.2;
    combatants.push({
      id: `th${i}`,
      kind: "threat",
      threatClass: pick(["T", "E", "A"] as const),
      mobCount: null,
      mobStart: null,
      wounds: over ? 5 : 0,
      maxWounds: 4,
      shock: 0,
      maxShock: null,
      ...flags(),
    } as unknown as Combatant);
  }
  const side = () => pick([null, "agents", "threats"] as const);
  const state = {
    characters: [],
    campaign: { tier: 1 },
    encounter: {
      round: pick([0, 1, 1, 2, 3]),
      currentId: null as string | null,
      lastSide: side(),
      seizedSide: null,
      combatants,
    },
  } as unknown as LiveState;
  const e = state.encounter!;
  if (r() < 0.4) e.seizedSide = pick(["agents", "threats"] as const);
  // Someone is acting in about half of the fights: a combatant that could have started this Turn.
  const able = combatants.filter((c) => !c.acted && !isOut(state, c));
  if (e.round > 0 && able.length > 0 && r() < 0.5) e.currentId = pick(able).id;
  return { state, glory: Math.floor(r() * 3), ruin: Math.floor(r() * 3) };
}

// What the engine's primitive reads for the same fight. Round 0 here is a fight that has not begun.
const toRule = ({ state, glory, ruin }: Fight) => {
  const e = state.encounter!;
  const ids = (keep: (c: Combatant) => boolean) => e.combatants.filter(keep).map((c) => c.id);
  return {
    actors: [],
    turn: {
      round: Math.max(1, e.round),
      begun: e.round > 0,
      currentId: e.currentId,
      order: ids(() => true),
      sideOf: Object.fromEntries(e.combatants.map((c) => [c.id, sideOf(c)])),
      lastSide: e.lastSide,
      outOfTurnSide: e.seizedSide,
      done: ids((c) => c.acted),
      held: ids((c) => c.held),
      barred: ids((c) => c.ambushed),
      unable: ids((c) => isOut(state, c)),
    },
    pools: { glory: { value: glory, min: 0, max: 6 }, ruin: { value: ruin, min: 0, max: 6 } },
  };
};

// endCurrentTurn (encounter.actions.ts): the one acting has acted, its side went last, and a Seize holds until the
// other side acts.
function ended(state: LiveState): LiveState {
  const e = state.encounter!;
  const current = e.combatants.find((c) => c.id === e.currentId);
  if (!current) return state;
  const side = sideOf(current);
  return {
    ...state,
    encounter: {
      ...e,
      currentId: null,
      lastSide: side,
      seizedSide: e.seizedSide === side ? side : null,
      combatants: e.combatants.map((c) => (c.id === current.id ? { ...c, acted: true, held: false } : c)),
    },
  } as LiveState;
}

// The checks of turn.start and turn.seize, in this repo's own words: the Turn in progress ends first, then the pick is
// judged (rules-flow §11.168).
function reference({ state, glory, ruin }: Fight, id: string) {
  const after = ended(state);
  const e = after.encounter!;
  const c = e.combatants.find((x) => x.id === id)!;
  const startable = e.round > 0 && !isOut(after, c) && !c.acted && !(c.ambushed && e.round === 1);
  const side = sideOf(c);
  return {
    start: startable && sideUpNext(after) === side,
    justGo: startable,
    seize: startable && canSeize(after, side) && (side === "agents" ? glory : ruin) >= 1,
  };
}

const run = (f: Fight, op: string, input: unknown) =>
  engine!.runOp({ primitive: "initiative.sides", op, params, state: toRule(f), input });

const FIGHTS = 4000;

test("the side that is up is the one sideUpNext names", { skip }, () => {
  for (let seed = 1; seed <= FIGHTS; seed++) {
    const f = fight(seed);
    const e = f.state.encounter!;
    if (e.round === 0 || e.currentId !== null) continue;
    assert.equal(engine!.sideUp({ params, state: toRule(f) }), sideUpNext(f.state), `fight ${seed}`);
  }
});

test("a Turn starts, with and without JUST GO, exactly when turn.start would let it", { skip }, () => {
  let started = 0;
  for (let seed = 1; seed <= FIGHTS; seed++) {
    const f = fight(seed);
    for (const c of f.state.encounter!.combatants) {
      const want = reference(f, c.id);
      assert.equal(run(f, "pick", { id: c.id }).ok, want.start, `fight ${seed}, ${c.id}: pick`);
      assert.equal(run(f, "pick", { id: c.id, force: true }).ok, want.justGo, `fight ${seed}, ${c.id}: JUST GO`);
      if (want.start) started++;
    }
  }
  assert.ok(started > 500, `only ${started} picks were allowed: the fights are too narrow to prove anything`);
});

test("a Seize is allowed, and paid for, exactly when turn.seize would let it", { skip }, () => {
  let seized = 0;
  for (let seed = 1; seed <= FIGHTS; seed++) {
    const f = fight(seed);
    for (const c of f.state.encounter!.combatants) {
      const want = reference(f, c.id).seize;
      const got = run(f, "seize", { id: c.id });
      assert.equal(got.ok, want, `fight ${seed}, ${c.id}: Seize (${got.ok ? "allowed" : got.refusal.detail})`);
      if (!got.ok) continue;
      seized++;
      const pool = sideOf(c) === "agents" ? "glory" : "ruin";
      const paid = got.deltas.filter((d) => "pool" in d.target);
      assert.deepEqual(paid, [{ target: { pool }, kind: "add", value: -1 }], `fight ${seed}, ${c.id}: the cost`);
    }
  }
  assert.ok(seized > 100, `only ${seized} Seizes were allowed: the fights are too narrow to prove anything`);
});

test("canAct is a pick the engine accepts once the order is set aside", { skip }, () => {
  for (let seed = 1; seed <= FIGHTS; seed++) {
    const f = fight(seed);
    if (f.state.encounter!.currentId !== null) continue;
    for (const c of f.state.encounter!.combatants) {
      assert.equal(run(f, "pick", { id: c.id, force: true }).ok, canAct(f.state, c), `fight ${seed}, ${c.id}`);
    }
  }
});

// encounter.begin and newRound (encounter.actions.ts), read as the values they leave behind.
const after = (f: Fight, op: string) => {
  const result = run(f, op, {});
  assert.ok(result.ok, result.ok ? "" : result.refusal.detail);
  return Object.fromEntries(result.deltas.map((d) => [(d.target as { turn: string }).turn, d.value]));
};

test("Round 0: no Turn and no Seize, and BEGIN ROUND 1 keeps the ambushes but not the stray marks", { skip }, () => {
  let checked = 0;
  for (let seed = 1; seed <= FIGHTS; seed++) {
    const f = fight(seed);
    const e = f.state.encounter!;
    if (e.round !== 0) continue;
    checked++;
    for (const c of e.combatants) {
      assert.equal(run(f, "pick", { id: c.id, force: true }).ok, false, `fight ${seed}: a Turn in Round 0`);
      assert.equal(run(f, "seize", { id: c.id }).ok, false, `fight ${seed}: a Seize in Round 0`);
    }
    assert.equal(run(f, "newRound", {}).ok, false, `fight ${seed}: a new Round before BEGIN ROUND 1`);
    const set = after(f, "begin");
    // encounter.begin: acted and held cleared for everyone, currentId, lastSide and seizedSide null, ambushes kept.
    assert.equal(set.begun, true);
    assert.deepEqual(set.done, []);
    assert.deepEqual(set.held, []);
    assert.equal(set.lastSide, null);
    assert.equal(set.outOfTurnSide, null);
    assert.equal("barred" in set, false, `fight ${seed}: BEGIN ROUND 1 must not touch the ambushes`);
  }
  assert.ok(checked > 200);
});

test("a new Round: everyone ready again, ambushes over, the players pick first", { skip }, () => {
  for (let seed = 1; seed <= FIGHTS; seed++) {
    const f = fight(seed);
    const e = f.state.encounter!;
    if (e.round === 0) continue;
    const set = after(f, "newRound");
    // newRound: acted, ambushed and held false for everyone; round + 1; currentId, lastSide and seizedSide null.
    assert.equal(set.round, e.round + 1, `fight ${seed}`);
    assert.deepEqual(set.done, [], `fight ${seed}`);
    assert.deepEqual(set.held, [], `fight ${seed}`);
    assert.deepEqual(set.barred, [], `fight ${seed}`);
    assert.equal(set.currentId, null, `fight ${seed}`);
    assert.equal(set.lastSide, null, `fight ${seed}`);
    assert.equal(set.outOfTurnSide, null, `fight ${seed}`);
  }
});
