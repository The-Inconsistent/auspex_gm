import assert from "node:assert/strict";
import { test } from "node:test";

import { HazardTable, type LocationHazard } from "@wg/shared";

import { hazardTests, hazardView, rollHazards } from "./hazards.ts";

// Placeholders only: book text never goes in tests (docs/data.md, Copyright).
const ID = "00000000-0000-4000-8000-000000000001";
const row = (from: number, to: number, extra: object = {}) => ({
  id: `ph-${from}`,
  from,
  to,
  name: `[hazard ${from}]`,
  page: 11,
  text: "[text]",
  ...extra,
});
const d6Table = HazardTable.parse({
  id: "ph-hazards",
  name: "[Hazards]",
  source: "threat-assessment",
  page: 11,
  dice: "d6",
  rows: [row(1, 2), row(3, 5, { tests: [{ kind: "resolve", tierDn: 3, purpose: "[p]" }] })],
  gaps: [6],
});
const list = HazardTable.parse({
  id: "ph-list",
  name: "[List]",
  source: "core",
  page: 201,
  dice: null,
  rows: [
    {
      id: "ph-shock",
      name: "[Shock]",
      page: 201,
      text: "[text]",
      conditions: ["restrained"],
      variants: [
        { name: "Moderate", tests: [{ kind: "attribute", attribute: "T", dn: 5, purpose: "[p]" }], text: "[dmg]" },
      ],
    },
  ],
});
const faces =
  (...fs: number[]) =>
  () =>
    fs.shift()!;

test("a printed Test shows one scene Test per Skill, at its DN or the Tier plus its Tier DN", () => {
  const tests = hazardTests({
    tests: [
      { kind: "skill", skills: ["Deception", "Leadership"], attribute: null, dn: null, purpose: "[p]" },
      { kind: "resolve", skills: [], attribute: null, dn: null, tierDn: 3, purpose: "[p]" },
    ],
    tier: 4,
  });
  assert.equal(tests[2]!.purpose, "[p] (DN: the Tier + 3)");
  assert.deepEqual(
    tests.map((t) => [t.skill, t.dn]),
    [
      ["Deception", null],
      ["Leadership", null],
      [null, 7],
    ],
  );
});

test("a place's entry reads its book row, with the intensity picked, or the GM's own", () => {
  const book: LocationHazard = { id: ID, kind: "book", hazardId: "ph-shock", variant: "Moderate" };
  const v = hazardView({ entry: book, tables: [d6Table, list], tier: 2 })!;
  assert.equal(v.name, "[Shock] · Moderate");
  assert.equal(v.cite, "[List] · Core p.201");
  assert.deepEqual(
    v.tests.map((t) => [t.attribute, t.dn]),
    [["T", 5]],
  );
  assert.deepEqual(v.conditions, ["restrained"]);
  assert.equal(hazardView({ entry: { ...book, hazardId: "gone" }, tables: [list], tier: 2 }), null);
  const own = hazardView({
    entry: { id: ID, kind: "custom", name: "Climb", tests: [], effect: "[x]" },
    tables: [],
    tier: 2,
  });
  assert.deepEqual([own?.name, own?.cite, own?.text], ["Climb", "Your own", "[x]"]);
});

test("×TIER rolls once per Tier, and a result with no printed row rolls again (§11.93)", () => {
  const picked = rollHazards({ table: d6Table, times: 2, d6: faces(6, 1, 6, 6, 4) });
  assert.deepEqual(
    picked.map((r) => r.id),
    ["ph-1", "ph-3"],
  );
  assert.deepEqual(rollHazards({ table: list, times: 3 }), [], "a list is picked from, not rolled on");
});
