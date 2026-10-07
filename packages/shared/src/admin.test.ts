import { test } from "node:test";
import assert from "node:assert/strict";
import { ADMIN_ACTIONS } from "./admin.ts";
import { Action, PLAYER_ACTIONS, type ActionInput } from "./actions.ts";

// One valid payload per admin action: the route parses what a client sends with `Action`, so each must pass it.
const samples: ActionInput[] = [
  { type: "session.abandon" },
  { type: "session.delete" },
  { type: "member.seat", userId: "user_1" },
  { type: "member.remove", userId: "user_1" },
  { type: "campaign.archive" },
  { type: "campaign.unarchive" },
  { type: "campaign.delete", name: "Game" },
];

test("the admin route's allowlist is exactly these actions, and no player may send one", () => {
  assert.deepEqual(new Set(samples.map((a) => a.type)), ADMIN_ACTIONS);
  for (const a of samples) {
    assert.ok(Action.safeParse(a).success, a.type);
    assert.ok(!PLAYER_ACTIONS.has(a.type), `${a.type} is the GM's`);
  }
});
