import assert from "node:assert/strict";
import { test } from "node:test";

import { sheetRules } from "./sheet-rules.ts";

// Only the fields sheetRules reads.
const lists = {
  species: [
    {
      id: "primaris-astartes",
      name: "Primaris Astartes",
      source: "core",
      page: 29,
      abilities: [{ name: "Space Marine Implants", text: "…" }],
    },
  ],
  archetypes: [
    {
      id: "tactical-space-marine",
      name: "Tactical Space Marine",
      source: "core",
      page: 113,
      abilities: [{ name: "Tactical Versatility", text: "…" }],
    },
  ],
  "sub-factions": [
    {
      id: "blood-angels",
      name: "Blood Angels",
      source: "core",
      page: 72,
      traits: [
        { name: "The Red Thirst", text: "…", page: 73 },
        { name: "Homebrew Extra", text: "…", page: 28, source: "apocrypha" },
      ],
    },
  ],
  "option-groups": [],
  talents: [
    { id: "silent", name: "Silent", source: "core", page: 139, category: "talent", effect: "Quiet." },
    { id: "blessing", name: "Blessing", source: "vow-of-absolution", page: 50, category: "faith", effect: "…" },
  ],
} as unknown as Parameters<typeof sheetRules>[0];

test("abilities cite the rule's own page, in its own book or its owner's, else the owner's (as resolveBuild does)", () => {
  const page = Object.fromEntries(sheetRules(lists).abilities.map((a) => [a.name, a.page]));
  assert.deepEqual(page, {
    "Space Marine Implants": "Core p.29",
    "Tactical Versatility": "Core p.113",
    "The Red Thirst": "Core p.73",
    "Homebrew Extra": "Apocrypha p.28",
  });
});

test("talents carry their effect as the sheet's text, sorted by name", () => {
  const { talents } = sheetRules(lists);
  assert.deepEqual(
    talents.map((t) => [t.name, t.page, t.text, t.from]),
    [
      ["Blessing", "VoA p.50", "…", "FAITH"],
      ["Silent", "Core p.139", "Quiet.", "Talent"],
    ],
  );
});

test("ids stay unique when two owners print a rule of the same name", () => {
  const twice = { ...lists, archetypes: [...lists.archetypes, { ...lists.archetypes[0]!, id: "other" }] };
  const ids = sheetRules(twice).abilities.map((a) => a.id);
  assert.equal(new Set(ids).size, ids.length);
});
