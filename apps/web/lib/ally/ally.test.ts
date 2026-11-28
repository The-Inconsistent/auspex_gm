import assert from "node:assert/strict";
import { test } from "node:test";

import { budgetEntries, followersToAdd, joinRules, pickDefaults, runByOptions } from "./ally.ts";

const threat = (over: object) => ({
  kind: "threat",
  ally: false,
  mobCount: null,
  threatClass: "T",
  npcId: null,
  ...over,
});
const agents = [{ id: "a1", name: "Veyl" }];

test("an ally stays out of the budget, a Mob counts its members", () => {
  const rows = budgetEntries([threat({}), threat({ ally: true }), threat({ mobCount: 4 }), { kind: "pc" }] as never);
  assert.deepEqual(rows, [
    { cls: "T", count: 1, asMob: false },
    { cls: "T", count: 4, asMob: true },
  ]);
});

test("a Follower is never an enemy and defaults to the Agent it follows; an Ally is the GM's alone", () => {
  assert.deepEqual(joinRules({ fightsAs: "follower", followsId: "a1" }), {
    enemy: false,
    playerMayRun: true,
    controllerId: "a1",
  });
  assert.deepEqual(joinRules({ fightsAs: "ally", followsId: "a1" }), {
    enemy: false,
    playerMayRun: false,
    controllerId: null,
  });
  assert.equal(joinRules({ fightsAs: "threat", followsId: null }).enemy, true);
});

test("RUN BY offers only the GM for an Ally, and the Agents otherwise", () => {
  assert.equal(runByOptions({ agents, fightsAs: "ally" }).length, 1);
  assert.equal(runByOptions({ agents, fightsAs: "follower" }).length, 2);
  assert.equal(runByOptions({ agents, fightsAs: null }).length, 2);
});

test("+ FOLLOWERS skips an NPC already fielded and names one without a stat block", () => {
  const npc = (id: string, statSource: object) => ({ id, name: id, followsId: "a1", statSource });
  const codex = {
    npcs: [
      npc("kx9", { kind: "bestiary", threatId: "servitor" }),
      npc("here", { kind: "bestiary", threatId: "servitor" }),
      npc("quick", { kind: "quick", tier: 2 }),
      { ...npc("other", { kind: "bestiary", threatId: "servitor" }), followsId: "a2" },
    ],
  } as never;
  const r = followersToAdd({
    codex,
    bestiary: [{ id: "servitor" }] as never,
    agentIds: ["a1"],
    combatants: [threat({ npcId: "here" })] as never,
  });
  assert.deepEqual(
    r.add.map((a) => a.npc.id),
    ["kx9"],
  );
  assert.deepEqual(r.noStats, ["quick"]);
  assert.equal(r.fielded, 1); // "here" is given and already in the fight
});

test("picking an NPC resets JOINS: a Threat after a Follower goes back to enemy, a runner outside the fight is the GM", () => {
  assert.deepEqual(pickDefaults({ fightsAs: "follower", followsId: "a1" }, ["a1"]), { side: "ally", runBy: "a1" });
  assert.deepEqual(pickDefaults({ fightsAs: "follower", followsId: "a1" }, []), { side: "ally", runBy: null });
  assert.deepEqual(pickDefaults({ fightsAs: "threat", followsId: null }, ["a1"]), { side: "enemy", runBy: null });
});
