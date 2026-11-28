import { test } from "node:test";
import assert from "node:assert/strict";

import type { Codex } from "@wg/shared";

import { myFollowers, ungivenGear } from "./utils";

const item = (name: string): Codex["items"][number] => ({
  id: name,
  name,
  wargearId: null,
  description: "",
  gmNotes: "",
  locationId: null,
  npcId: null,
  mods: [],
  givenTo: "a",
});

test("ungivenGear: a given item's line leaves the DOSSIER, one per item", () => {
  const gear = ["Auspex (Core p.236)", "Stasis casket", "Auspex (Core p.236)", "Rope"];
  assert.deepEqual(ungivenGear(gear, [item("Stasis casket"), item("Auspex")]), ["Auspex (Core p.236)", "Rope"]);
  assert.deepEqual(ungivenGear(gear, []), gear, "nothing given, nothing hidden");
  assert.deepEqual(ungivenGear(["Lasgun sling"], [item("Lasgun")]), ["Lasgun sling"], "a name that only starts alike");
});

test("myFollowers: only the NPCs that follow this Agent", () => {
  const codex = {
    npcs: [
      { id: "n1", followsId: "a" },
      { id: "n2", followsId: "b" },
      { id: "n3", followsId: null },
    ],
  } as unknown as Codex;
  assert.deepEqual(
    myFollowers(codex, "a").map((n) => n.id),
    ["n1"],
  );
  assert.deepEqual(myFollowers(codex, "z"), []);
});
