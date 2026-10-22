import assert from "node:assert/strict";
import { test } from "node:test";

import { objectivesLine, padAction, seatLine } from "./party-view.ts";

test("each field sends the action the app has always used for it", () => {
  assert.deepEqual(padAction({ field: "wounds", id: "c1", delta: -2 }), {
    type: "character.adjust",
    id: "c1",
    wounds: -2,
  });
  assert.deepEqual(padAction({ field: "wrath", id: "c1", delta: 1 }), { type: "character.adjust", id: "c1", wrath: 1 });
  assert.deepEqual(padAction({ field: "corruption", id: "c1", delta: 1 }), {
    type: "character.corrupt",
    id: "c1",
    delta: 1,
  });
  assert.deepEqual(padAction({ field: "wealth", id: "c1", delta: -1 }), {
    type: "character.supply",
    id: "c1",
    wealth: -1,
  });
});

test("a seat reads as words and an objectives count as a line", () => {
  assert.equal(seatLine({ member: "Ana", active: true }), "PLAYED BY ANA");
  assert.equal(seatLine({ member: null, active: true }), "SEATED · GUEST QR");
  assert.equal(seatLine({ member: null, active: false }), "OPEN SEAT");
  assert.equal(objectivesLine([{ text: "a", done: true }]), "1 OBJECTIVE · 1 DONE");
  assert.equal(objectivesLine([]), "0 OBJECTIVES · 0 DONE");
});
