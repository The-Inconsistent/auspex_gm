import assert from "node:assert/strict";
import { test } from "node:test";

import { chronicleTurns } from "./chronicle.ts";

const line = (who: string, text: string) => ({ who, text });

test("lines of one Turn become one entry, oldest line first, newest Turn first", () => {
  const log = [line("BREACHA", "b2"), line("BREACHA", "b1"), line("TARSUS", "t1"), line("ROUND 1", "begins")];
  assert.deepEqual(
    chronicleTurns(log).map((t) => [t.who, t.lines.map((l) => l.text)]),
    [
      ["BREACHA", ["b1", "b2"]],
      ["TARSUS", ["t1"]],
      ["ROUND 1", ["begins"]],
    ],
  );
});

test("a second Turn by the same combatant is its own entry", () => {
  const log = [line("TARSUS", "again"), line("BREACHA", "b"), line("TARSUS", "first")];
  assert.deepEqual(
    chronicleTurns(log).map((t) => t.who),
    ["TARSUS", "BREACHA", "TARSUS"],
  );
});

test("an empty log has no entries", () => {
  assert.deepEqual(chronicleTurns([]), []);
});
