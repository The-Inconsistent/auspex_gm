import assert from "node:assert/strict";
import { test } from "node:test";

import { CodexInput } from "./codex.ts";
import { NpcPreset, mergeCites, npcFromPreset, presetNpc } from "./npc-presets.ts";

const maloquence = NpcPreset.parse({
  id: "chaos-lord-maloquence",
  name: "Lord Maloquence",
  role: "Chaos Lord",
  cites: [{ source: "wretches-of-the-writ", page: 5 }],
  faction: "Traitors of the Rift",
  gmNotes: "Hook 1.",
});

test("presetNpc adds a hidden NPC with the cites first in GM NOTES and an empty description", () => {
  const saved = CodexInput.npc.parse(presetNpc(maloquence, []));
  assert.equal(saved.gmNotes, "Wretches p.5\n\nHook 1.");
  assert.equal(saved.description, "");
  assert.equal(saved.revealed, false);
  assert.equal(saved.factionId, null, "no faction of that name in the codex");
  assert.deepEqual(saved.statSource, { kind: "none" });
  const id = "00000000-0000-4000-8000-000000000001";
  assert.equal(presetNpc(maloquence, [{ id, name: "traitors of the rift" }]).factionId, id, "matched by name");
});

test("a transcribed preset replaces its patron and keeps both cites", () => {
  const patron = NpcPreset.parse({
    id: "chaos-lord-maloquence",
    name: "Chaos Lord Maloquence",
    role: "Patron",
    cites: [{ source: "forsaken-system", page: 88 }],
  });
  const merged = mergeCites(patron, maloquence);
  assert.equal(merged.name, "Lord Maloquence");
  assert.deepEqual(merged.cites, [
    { source: "wretches-of-the-writ", page: 5 },
    { source: "forsaken-system", page: 88 },
  ]);
  const saved = CodexInput.npc.parse(presetNpc(merged, []));
  assert.ok(npcFromPreset(saved, merged));
  assert.ok(!npcFromPreset(saved, maloquence), "the cite line tells them apart");
});
