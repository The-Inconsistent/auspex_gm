import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { stamp, toResult } from "./admin.ts";

describe("toResult", () => {
  test("passes an applied action and its notices through", () => {
    assert.deepEqual(toResult({ ok: true }), { ok: true });
    assert.deepEqual(toResult({ ok: true, notices: ["Deleted session 3", 4] }), {
      ok: true,
      notices: ["Deleted session 3"],
    });
  });

  test("shows a refusal that came back as a 200", () => {
    assert.deepEqual(toResult({ ok: false, error: "This game is archived" }), {
      ok: false,
      error: "This game is archived",
    });
  });

  test("turns the seat removal's count into a notice", () => {
    assert.deepEqual(toResult({ removed: 2 }), { ok: true, notices: ["Removed from 2 games"] });
    assert.deepEqual(toResult({ removed: 1 }), { ok: true, notices: ["Removed from 1 game"] });
  });

  test("reads Nest's error body", () => {
    assert.deepEqual(toResult({ statusCode: 403, message: "Admins only" }), { ok: false, error: "Admins only" });
    assert.deepEqual(toResult({ message: ["a", "b"] }), { ok: false, error: "a, b" });
  });

  test("anything else is no signal", () => {
    assert.deepEqual(toResult(null), { ok: false, error: "No signal" });
    assert.deepEqual(toResult({}), { ok: false, error: "No signal" });
  });
});

describe("stamp", () => {
  test("is the same wherever it renders", () => {
    assert.equal(stamp("2026-10-06T20:03:09.000Z"), "6 Oct 2026, 20:03 UTC");
  });

  test("survives a bad date", () => {
    assert.equal(stamp("not a date"), "—");
  });
});
