import assert from "node:assert/strict";
import { test } from "node:test";

import { currentScene } from "./scene.ts";

const beat = (id: string, status: string) => ({ id, status }) as never;

test("the current scene is the active beat, with its adventure and index", () => {
  const adventures = [
    { id: "a1", beats: [beat("b1", "done")] },
    { id: "a2", beats: [beat("b2", "done"), beat("b3", "active"), beat("b4", "planned")] },
  ] as never;
  const hit = currentScene({ adventures });
  assert.equal(hit?.adventure.id, "a2");
  assert.equal(hit?.beat.id, "b3");
  assert.equal(hit?.index, 1);
  assert.equal(currentScene({ adventures: [{ id: "a", beats: [beat("b", "planned")] }] as never }), null);
});
