import assert from "node:assert/strict";
import { test } from "node:test";

import { FrameworkBody, Grant } from "@wg/shared";

import { grantText, tierLabel, tierRange } from "./utils.ts";

const body = (b: object) => FrameworkBody.parse({ name: "X", ...b });

test("the Tier hint comes from a Tier limit, else from Core p.20's suggested Tier", () => {
  assert.equal(tierLabel(tierRange(body({ limitations: [{ kind: "tier", max: 2 }] }))!), "TIER 1–2");
  assert.equal(tierLabel(tierRange(body({ limitations: [{ kind: "tier", min: 3 }] }))!), "TIER 3+");
  assert.equal(tierLabel(tierRange(body({ tier: 4 }))!), "TIER 4");
  assert.equal(tierRange(body({})), null);
});

test("Wargear grants read as one line each", () => {
  const g = (x: object) => grantText(Grant.parse(x));
  assert.equal(g({ wargear: { name: "Vox Caster", scope: "group" } }), "Vox Caster (one for the group)");
  assert.equal(
    g({ choose: 1, from: [{ wargear: { name: "Void Suit" } }, { wargear: { name: "Respirator" } }] }),
    "1 of: Void Suit; Respirator",
  );
});
