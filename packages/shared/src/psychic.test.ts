import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isSustain,
  sustainEntry,
  sustainHitReminder,
  isSustained,
  sustainLine,
  sustainTurnReminder,
  sustainedPowers,
} from "./psychic.ts";

const two = ["Prone", "Sustaining: Smite", "Sustaining: Iron Arm"];

test("a sustained power is a Condition entry that fits the 60-character cap", () => {
  assert.equal(sustainEntry("  Smite "), "Sustaining: Smite");
  assert.ok(sustainEntry("x".repeat(200)).length <= 60);
  assert.ok(isSustain(sustainEntry("Smite")));
  assert.ok(!isSustain("Prone"));
});

test("only Sustaining entries count, as a line with two DN each (Core p.265)", () => {
  assert.deepEqual(sustainedPowers(two), ["Smite", "Iron Arm"]);
  assert.equal(sustainLine(two), "SUSTAINING Smite, Iron Arm · +4 DN to all Tests");
  assert.equal(sustainLine(["Prone"]), null);
});

test("a power is Sustained whatever the case it is printed in", () => {
  assert.ok(isSustained("Sustained") && isSustained(" sustained "));
  assert.ok(!isSustained("Instant") && !isSustained("1 Round"));
});

test("the reminders name the psyker, the DN and the powers", () => {
  assert.equal(
    sustainHitReminder({ name: "IZZY", conditions: two, wounds: 2, shock: 1 }),
    "IZZY: hit while sustaining 2 powers: Willpower Test DN 7, or all sustained powers end (Core p.265)",
  );
  assert.match(
    sustainHitReminder({ name: "IZZY", conditions: ["Sustaining: Smite"], wounds: 1, shock: 0 }) ?? "",
    /sustaining 1 power: Willpower Test DN 3/,
  );
  assert.equal(sustainHitReminder({ name: "IZZY", conditions: [], wounds: 2, shock: 0 }), null);
  assert.equal(
    sustainTurnReminder({ name: "IZZY", conditions: two }),
    "IZZY: sustaining Smite, Iron Arm: +4 DN to all Tests (Core p.265)",
  );
  assert.equal(sustainTurnReminder({ name: "IZZY", conditions: ["Prone"] }), null);
});
