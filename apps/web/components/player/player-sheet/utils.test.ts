import { test } from "node:test";
import assert from "node:assert/strict";

import type { Codex } from "@wg/shared";

import { ungivenGear } from "./utils";

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
