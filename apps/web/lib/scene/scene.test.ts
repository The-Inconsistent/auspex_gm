import assert from "node:assert/strict";
import { test } from "node:test";

import { currentScene, objectivesAt } from "./scene.ts";

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

test("objectivesAt: a scene's own missions, or the adventure's whole-adventure ones (§11.163)", () => {
  const characters = [
    {
      name: "Tarsus",
      objectives: [
        { text: "Whole", done: false, adventureId: "a1", beatId: null },
        { text: "Scene", done: true, adventureId: "a1", beatId: "b1" },
        { text: "Elsewhere", done: false, adventureId: "a2" },
        { text: "Unlinked", done: false },
      ],
    },
    { name: "Vex", objectives: [{ text: "Hers", done: false, adventureId: "a1", beatId: "b1" }] },
  ] as never;
  const texts = (r: ReturnType<typeof objectivesAt>) => r.map((x) => `${x.agent}: ${x.objective.text}`);
  assert.deepEqual(texts(objectivesAt(characters, { adventureId: "a1" })), ["Tarsus: Whole"]);
  assert.deepEqual(texts(objectivesAt(characters, { adventureId: "a1", beatId: "b1" })), [
    "Tarsus: Scene",
    "Vex: Hers",
  ]);
});
