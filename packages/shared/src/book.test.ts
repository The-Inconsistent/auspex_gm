import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCite, pdfPage } from "./book.ts";

test("pdfPage applies each book's offset (docs/data.md §3)", () => {
  assert.equal(pdfPage({ source: "core", page: 113 }), 114);
  assert.equal(pdfPage({ source: "apocrypha", page: 10 }), 13);
  assert.equal(pdfPage({ source: "legacy-of-the-necrontyr", page: 40 }), 40);
  assert.equal(pdfPage({ source: "threat-assessment", page: 8 }), 8);
});

test("parseCite reads the cites the app prints", () => {
  assert.deepEqual(parseCite("Core p.113"), { source: "core", page: 113 });
  assert.deepEqual(parseCite("TA p.8"), { source: "threat-assessment", page: 8 });
  assert.deepEqual(parseCite("VoA p.43"), { source: "vow-of-absolution", page: 43 });
  assert.equal(parseCite("p.75"), null);
  assert.equal(parseCite("Homebrew p.3"), null);
  assert.equal(parseCite("Core p.12, VoA p.4"), null);
});
