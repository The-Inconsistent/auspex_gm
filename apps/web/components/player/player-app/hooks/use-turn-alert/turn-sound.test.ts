import assert from "node:assert/strict";
import { test } from "node:test";

import { readTurnSound, subscribeTurnSound, writeTurnSound } from "./turn-sound";

// Bun's test runtime has no localStorage, so every access throws: the private-window case.
test("the turn sound is off by default and survives storage that throws", () => {
  assert.equal(readTurnSound(), false);
  let calls = 0;
  const unsubscribe = subscribeTurnSound(() => calls++);
  writeTurnSound(true);
  assert.equal(readTurnSound(), true);
  unsubscribe();
  writeTurnSound(false);
  assert.equal(readTurnSound(), false);
  assert.equal(calls, 1);
});
