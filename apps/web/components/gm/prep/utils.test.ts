import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { BeatTest } from "@wg/shared";

import { dnLabel, ruinOnFailure, testTitle } from "./utils.ts";

describe("scene Test labels", () => {
  test("a Test is named by what it rolls", () => {
    assert.equal(testTitle(BeatTest.parse({ kind: "skill", skill: "Awareness", dn: 3 })), "AWARENESS (Int)");
    assert.equal(testTitle(BeatTest.parse({ kind: "opposed", attribute: "S" })), "OPPOSED · STRENGTH (S)");
    assert.equal(testTitle(BeatTest.parse({ kind: "resolve", dn: 5 })), "RESOLVE");
  });

  test("a DN the table prints carries its name (Core p.161)", () => {
    assert.deepEqual([dnLabel(5), dnLabel(4), dnLabel(null)], ["DN 5 · CHALLENGING", "DN 4", "NO DN"]);
  });

  test("only Fear and Corruption remind the GM of Ruin (Core p.320)", () => {
    assert.equal(ruinOnFailure(BeatTest.parse({ kind: "skill", skill: "Tech", dn: 3 })), null);
    assert.match(ruinOnFailure(BeatTest.parse({ kind: "corruption", dn: 3 })) ?? "", /GM GAINS 1 RUIN/);
  });
});
