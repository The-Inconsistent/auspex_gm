import { test } from "node:test";
import assert from "node:assert/strict";
import { PAUSE_TABLE_MAX } from "@wg/shared";
import { pauseRelay } from "./table.pause.ts";

const tap = (socketId: string, role: "gm" | "player" | "screen" = "player", campaignId = "c1") => ({
  role,
  campaignId,
  socketId,
});

test("the pause card: only a player seat sends one, and it carries the moment only (issue #194)", () => {
  const relay = pauseRelay();
  assert.equal(relay(tap("gm", "gm")), null, "the GM's own tablet");
  assert.equal(relay(tap("tv", "screen")), null, "the table screen is nobody");
  const signal = relay(tap("phone"));
  assert.ok(signal);
  assert.deepEqual(Object.keys(signal), ["at"], "no socket, user or character id");
  assert.ok(!Number.isNaN(Date.parse(signal.at)));
});

test("the pause card: one per phone per window, and a table cap across phones", () => {
  const relay = pauseRelay();
  assert.ok(relay(tap("a")));
  assert.equal(relay(tap("a")), null, "the same phone again inside its window is dropped");
  for (let i = 1; i < PAUSE_TABLE_MAX; i++) assert.ok(relay(tap(`p${i}`)), `phone ${i}`);
  assert.equal(relay(tap("late")), null, "past the table's cap");
  assert.ok(relay(tap("other", "player", "c2")), "another table has its own budget");
});

test("the pause card: a phone tapping again doesn't use up the table's budget", () => {
  const relay = pauseRelay();
  assert.ok(relay(tap("a")));
  for (let i = 0; i < 20; i++) relay(tap("a"));
  for (let i = 1; i < PAUSE_TABLE_MAX; i++) assert.ok(relay(tap(`p${i}`)), `phone ${i}`);
});
