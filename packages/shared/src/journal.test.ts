import { test } from "node:test";
import assert from "node:assert/strict";
import { Action, draftRecap, journalLabel } from "./index.ts";

const e = (a: unknown, extra: object = {}) => ({ action: Action.parse(a), ...extra });
const id = "00000000-0000-4000-8000-000000000001";

test("a fight, the loot and the XP become recap lines", () => {
  const lines = draftRecap([
    e({ type: "encounter.start" }),
    e({ type: "combatant.addThreat", threatId: "ork-boy", mobCount: 6 }),
    e({ type: "combatant.addThreat", threatId: "ork-nob", label: "Big Nob" }),
    e({ type: "encounter.newRound" }),
    e({ type: "combatant.remove", id }),
    e({ type: "encounter.end" }),
    e({ type: "character.giveItem", id, itemId: id }),
    e({ type: "pool.adjust", pool: "glory", delta: -2 }),
    e({ type: "session.end", xp: 20 }),
  ]);
  assert.deepEqual(lines, [
    "Fight 1, 2 Rounds: ork-boy x6, Big Nob.",
    "1 combatant removed from the fight.",
    "1 item given out.",
    "glory pool down 2.",
    "20 XP awarded.",
  ]);
});

test("undone entries and undo entries are skipped", () => {
  const lines = draftRecap([
    e({ type: "encounter.start" }, { undoneBy: id }),
    e({ type: "journal.undo", entryId: id }, { undoes: id }),
    e({ type: "session.end", xp: 5 }),
  ]);
  assert.deepEqual(lines, ["5 XP awarded."]);
});

test("each fight in a session gets its own number", () => {
  const lines = draftRecap([
    e({ type: "encounter.start" }),
    e({ type: "combatant.addThreat", threatId: "ork-boy" }),
    e({ type: "encounter.end" }),
    e({ type: "encounter.start" }),
    e({ type: "combatant.addThreat", threatId: "ork-nob" }),
    e({ type: "encounter.end" }),
  ]);
  assert.deepEqual(lines, ["Fight 1: ork-boy.", "Fight 2: ork-nob."]);
});

const names: Record<string, string> = { [id]: "Brother A", "00000000-0000-4000-8000-000000000002": "Relic Bolter" };
const nameOf = (x: string) => names[x];
const label = (a: unknown) => journalLabel(Action.parse(a), nameOf);

test("labels read like the tracker's log, with names where the lookup has them", () => {
  assert.equal(label({ type: "combatant.adjust", id, wounds: 2 }), "Brother A: +2 Wounds");
  assert.equal(label({ type: "combatant.adjust", id, wounds: -1, shock: 3 }), "Brother A: \u22121 Wounds, +3 Shock");
  assert.equal(label({ type: "character.adjust", id, traumatic: 1 }), "Brother A: +1 Traumatic Injury");
  assert.equal(label({ type: "pool.adjust", pool: "glory", delta: -1 }), "Glory \u22121");
  assert.equal(label({ type: "turn.start", id }), "Brother A acting");
  assert.equal(label({ type: "turn.seize", id }), "Seize: Brother A acting");
  assert.equal(label({ type: "combatant.addCharacter", characterId: id }), "Add Brother A to the fight");
  assert.equal(label({ type: "combatant.addThreat", threatId: "ork-boy", mobCount: 6 }), "Add ork-boy x6 to the fight");
  assert.equal(
    label({ type: "combatant.addThreat", threatId: "ork-nob", label: "Big Nob" }),
    "Add Big Nob to the fight",
  );
  assert.equal(label({ type: "combatant.remove", id }), "Remove Brother A from the fight");
  assert.equal(
    label({ type: "character.giveItem", id, itemId: "00000000-0000-4000-8000-000000000002" }),
    "Give Relic Bolter to Brother A",
  );
  assert.equal(label({ type: "codex.save", kind: "item", data: { name: "Servo-skull" } }), "Add item Servo-skull");
  assert.equal(label({ type: "session.start" }), "Session started");
  assert.equal(label({ type: "encounter.newRound" }), "New Round");
});

test("an unknown name falls back, and a type with no label of its own is spelled out", () => {
  const none = (a: unknown) => journalLabel(Action.parse(a), () => undefined);
  assert.equal(none({ type: "combatant.adjust", id, wounds: 1 }), "Someone: +1 Wounds");
  assert.equal(none({ type: "combatant.remove", id }), "Remove a combatant from the fight");
  assert.equal(none({ type: "journal.undo", entryId: id }), "Undo");
  assert.equal(label({ type: "journal.undo", entryId: id }), "Undo \u201cBrother A\u201d");
  assert.equal(none({ type: "character.respite", id }), "Character respite");
  assert.equal(none({ type: "test.close" }), "Test close");
});

test("a recap with names says who was removed and what went to whom", () => {
  const lines = draftRecap(
    [
      e({ type: "encounter.start" }),
      e({ type: "combatant.addThreat", threatId: "ork-nob" }),
      e({ type: "combatant.remove", id }),
      e({ type: "encounter.end" }),
      e({ type: "character.giveItem", id, itemId: "00000000-0000-4000-8000-000000000002" }),
    ],
    (x) => (x === "ork-nob" ? "Ork Nob" : nameOf(x)),
  );
  assert.deepEqual(lines, [
    "Fight 1: Ork Nob.",
    "Removed from the fight: Brother A.",
    "Given out: Relic Bolter to Brother A.",
  ]);
});
