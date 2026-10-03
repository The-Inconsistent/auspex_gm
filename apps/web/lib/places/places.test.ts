import assert from "node:assert/strict";
import { test } from "node:test";

import { placeOptions } from "./places";

test("placeOptions lists places in tree order, indented, without the place's own subtree", () => {
  const places = [
    { id: "spire", name: "Spire", parentId: "hive" },
    { id: "hive", name: "Hive", parentId: null },
    { id: "dock", name: "Dock", parentId: null },
  ];
  const pad = "   ";
  assert.deepEqual(placeOptions(places), [
    ["hive", "Hive"],
    ["spire", `${pad}Spire`],
    ["dock", "Dock"],
  ]);
  assert.deepEqual(placeOptions(places, "hive"), [["dock", "Dock"]]);
});
