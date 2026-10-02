import assert from "node:assert/strict";
import { test } from "node:test";

import { CodexInput } from "./codex.ts";
import { FactionPreset, fromPreset, presetFaction } from "./faction-presets.ts";

test("presetFaction starts neutral, with the cite first in the notes", () => {
  const orks = FactionPreset.parse({ id: "orks", name: "Orks", source: "core", page: 80, keywords: ["ORK"] });
  assert.deepEqual(presetFaction(orks), {
    name: "Orks",
    keywords: ["ORK"],
    stance: "neutral",
    notes: "Core p.80",
    secrets: "",
  });
  const cult = FactionPreset.parse({
    id: "x",
    name: "A cult",
    source: "redacted-records",
    page: 68,
    notes: "Hooks.",
    secrets: "The Secret.",
  });
  const saved = CodexInput.faction.parse(presetFaction(cult));
  assert.equal(saved.notes, "RR1 p.68\n\nHooks.");
  assert.equal(saved.secrets, "The Secret.");
});

test("fromPreset tells two books' factions of one name apart", () => {
  const a = FactionPreset.parse({ id: "a", name: "The Administratum", source: "forsaken-system", page: 54 });
  const b = FactionPreset.parse({ id: "b", name: "The Administratum", source: "litanies-of-the-lost", page: 16 });
  const saved = CodexInput.faction.parse(presetFaction(a));
  assert.ok(fromPreset(saved, a));
  assert.ok(!fromPreset(saved, b));
  assert.ok(
    !fromPreset({ name: "Orks", notes: "Core p.80" }, { ...a, name: "Orks", source: "core", page: 8 }),
    "p.8 isn't p.80",
  );
});
