import assert from "node:assert/strict";
import { test } from "node:test";

import { revealAction, undoBegin } from "./scene-reveal.ts";

const codex = {
  npcs: [{ id: "n1", name: "Tessaly", revealed: true, revealedAt: "t" }],
  locations: [{ id: "l1", name: "Camp", revealed: true }],
  handouts: [],
  adventures: [
    {
      id: "a",
      beats: [
        { id: "b1", order: 0, title: "One", status: "done" },
        { id: "b2", order: 1, title: "Two", status: "active" },
      ],
    },
  ],
} as never;

test("a reveal save carries the whole entry, without id and revealedAt", () => {
  const a = revealAction({ codex, id: "n1", revealed: false });
  assert.deepEqual(a, {
    type: "codex.save",
    kind: "npc",
    id: "n1",
    data: { name: "Tessaly", revealed: false },
  });
  assert.equal(revealAction({ codex, id: "gone", revealed: true }), null);
});

test("undo returns to the scene before, then seals what the begin revealed", () => {
  const steps = undoBegin({ codex, begun: "b2", before: "b1", status: "planned", revealed: ["n1", "l1", "gone"] });
  assert.deepEqual(steps[0], { type: "beat.begin", id: "b1", leave: "planned", reveal: false });
  assert.equal(steps.length, 3);
});

test("undo with no scene before saves the begun scene back to planned", () => {
  const [first] = undoBegin({ codex, begun: "b2", before: null, status: "planned", revealed: [] });
  assert.deepEqual(first, { type: "codex.save", kind: "beat", id: "b2", data: { title: "Two", status: "planned" } });
});

test("undo puts a scene that was done before the begin back to done", () => {
  const steps = undoBegin({ codex, begun: "b1", before: "b2", status: "done", revealed: [] });
  assert.deepEqual(steps[0], { type: "beat.begin", id: "b2", leave: "planned", reveal: false });
  assert.deepEqual(steps[1], { type: "codex.save", kind: "beat", id: "b1", data: { title: "One", status: "done" } });
  assert.equal(steps.length, 2);
});
