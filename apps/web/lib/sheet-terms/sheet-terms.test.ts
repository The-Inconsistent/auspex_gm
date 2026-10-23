import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";

import { SHEET_TERMS } from "./sheet-terms.ts";

const rulesDir = new URL("../../../../packages/data/rules/", import.meta.url);
const ruleIds = new Set(
  readdirSync(rulesDir).flatMap((f) => {
    const raw = JSON.parse(readFileSync(new URL(f, rulesDir), "utf8")) as
      { id: string }[] | { entries: { id: string }[] };
    return (Array.isArray(raw) ? raw : raw.entries).map((r) => r.id);
  }),
);

test("every term cites a page, reads in one breath and points at a rule that exists", () => {
  for (const [key, t] of Object.entries(SHEET_TERMS)) {
    assert.match(t.cite, /^Core p\.\d+$/, key);
    assert.ok(t.meaning.length > 0 && t.meaning.length <= 140, `${key}: ${t.meaning.length} characters`);
    if ("rule" in t) assert.ok(ruleIds.has(t.rule), `${key}: no rule ${t.rule}`);
  }
});
