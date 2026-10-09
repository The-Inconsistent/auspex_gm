import { test } from "node:test";
import assert from "node:assert/strict";
import { Action, Clock, clockLabel, countdownLeft, mmss, tickClock } from "./index.ts";

const clock = Clock.parse({ id: "k", name: "Hive guard", segments: 6, filled: 3, visible: true });

test("a tick stays inside the pie (issue #210)", () => {
  assert.equal(tickClock({ clock, delta: 1 }).filled, 4);
  assert.equal(tickClock({ clock, delta: 5 }).filled, 6, "full is full");
  assert.equal(tickClock({ clock, delta: -8 }).filled, 0, "never below empty");
  assert.equal(tickClock({ clock: { ...clock, segments: 4, filled: 6 }, delta: 0 }).filled, 4, "a smaller pie");
});

test("two taps sent together both count", () => {
  const once = tickClock({ clock, delta: 1 });
  assert.equal(tickClock({ clock: once, delta: 1 }).filled, 5);
});

test("a clock is 4, 6 or 8 segments, named in 40 characters, and starts hidden", () => {
  const save = (o: object) => Action.safeParse({ type: "clock.save", name: "Airlock", segments: 4, ...o });
  const fresh = save({}).data;
  assert.equal(fresh?.type, "clock.save");
  assert.equal(fresh?.type === "clock.save" && fresh.visible, false);
  assert.equal(save({ segments: 5 }).success, false);
  assert.equal(save({ name: "x".repeat(41) }).success, false);
  assert.equal(save({ name: "  " }).success, false);
});

test("the countdown reads whole seconds left as mm:ss, and stops at 00:00", () => {
  assert.equal(countdownLeft({ endsAt: 10_000, now: 0 }), 10);
  assert.equal(countdownLeft({ endsAt: 10_000, now: 9_001 }), 1, "a part second still shows");
  assert.equal(countdownLeft({ endsAt: 10_000, now: 20_000 }), 0);
  assert.equal(mmss(0), "00:00");
  assert.equal(mmss(605), "10:05");
  assert.equal(mmss(6000), "100:00");
});

test("a pie reads aloud as its name and how full it is", () => {
  assert.equal(clockLabel(clock), "Hive guard, 3 of 6");
});
