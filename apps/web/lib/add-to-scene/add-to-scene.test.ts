import assert from "node:assert/strict";
import { test } from "node:test";

import type { Codex } from "@wg/shared";

import { addNpcToBeat } from "./add-to-scene.ts";

type Beat = Codex["adventures"][number]["beats"][number];
type Npc = Codex["npcs"][number];

const beat = {
  id: "b1",
  order: 2,
  adventureId: "a1",
  title: "Ambush at the spoil heaps",
  npcIds: [],
  encounter: [{ threatId: "ork-boy", count: 6, asMob: true }],
} as unknown as Beat;
const npc = (statSource: Npc["statSource"]) => ({ id: "n1", name: "Dudd the Bomb Squig", statSource }) as Npc;

test("ADD TO SCENE appends one named combatant and lists the NPC once", () => {
  const data = addNpcToBeat(beat, npc({ kind: "bestiary", threatId: "dudd-the-bomb-squig" }))!;
  assert.equal("id" in data || "order" in data, false, "id and order are server-owned");
  assert.deepEqual(data.encounter, [
    { threatId: "ork-boy", count: 6, asMob: true },
    { threatId: "dudd-the-bomb-squig", count: 1, asMob: false, label: "Dudd the Bomb Squig" },
  ]);
  assert.deepEqual(data.npcIds, ["n1"]);
  const again = addNpcToBeat({ ...beat, npcIds: ["n1"] }, npc({ kind: "bestiary", threatId: "x" }))!;
  assert.deepEqual(again.npcIds, ["n1"]);
});

test("ADD TO SCENE fields only bestiary NPCs (rules-flow §11.88)", () => {
  assert.equal(addNpcToBeat(beat, npc({ kind: "quick", tier: 3 })), null);
  assert.equal(addNpcToBeat(beat, npc({ kind: "none" })), null);
});
