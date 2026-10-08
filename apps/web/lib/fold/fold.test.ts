import assert from "node:assert/strict";
import { test } from "node:test";

import { fold } from "./fold.ts";

test("case, punctuation and accents fold away; letters stay", () => {
  assert.equal(fold("T’au Kommandoz!"), "taukommandoz");
  assert.equal(fold("Ophélie"), "ophelie");
  assert.equal(fold("é"), "e");
});
