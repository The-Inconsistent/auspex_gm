import assert from "node:assert/strict";
import { test } from "node:test";

import { CodexSave, CreateGame, TableLines } from "@wg/shared";

import { sayIssue } from "./use-field-errors.ts";

// The first refusal a schema gives, in the words a field shows under it.
const say = (
  schema: { safeParse: (v: unknown) => { error?: { issues: Parameters<typeof sayIssue>[0][] } } },
  v: unknown,
) => schema.safeParse(v).error?.issues.map(sayIssue)[0];

test("an empty or blank required field reads Required", () => {
  assert.equal(say(CreateGame.shape.name, ""), "Required.");
  assert.equal(say(TableLines.element, "   "), "Required.", "trimmed first, so spaces are empty");
  assert.equal(say(CodexSave.location.shape.name, " "), "Required.", "a save names its place");
});

test("too long or too many reads the limit", () => {
  assert.equal(say(CreateGame.shape.name, "x".repeat(101)), "At most 100 characters.");
  assert.equal(say(TableLines, Array(13).fill("x")), "At most 12.");
});
