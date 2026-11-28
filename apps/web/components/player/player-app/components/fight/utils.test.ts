import assert from "node:assert/strict";
import { test } from "node:test";

import type { ThreatCombatant } from "@wg/shared";

import { allyLine } from "./utils";

const names = new Map([
  ["a", "Veyl"],
  ["b", "Ulfgar"],
]);
const ally = (controllerId: string | null) => ({ controllerId }) as unknown as ThreatCombatant;

test("an ally's row says who runs it", () => {
  assert.equal(allyLine({ c: ally("a"), characterId: "a", names }), "YOUR FOLLOWER · YOU RUN IT");
  assert.equal(allyLine({ c: ally("b"), characterId: "a", names }), "FOLLOWS ULFGAR");
  assert.equal(allyLine({ c: ally(null), characterId: "a", names }), "ALLY · THE GM RUNS IT");
});
