import assert from "node:assert/strict";
import { test } from "node:test";

import { fromLocalInput, nextSessionLine, toLocalInput } from "./next-session.ts";

test("a datetime-local value round-trips through the stored UTC date (issue #197)", () => {
  const iso = fromLocalInput("2026-10-12T18:00");
  assert.ok(iso?.endsWith("Z"));
  assert.equal(toLocalInput(iso), "2026-10-12T18:00");
});

test("an empty or broken input is no date, and no date is an empty input", () => {
  assert.equal(fromLocalInput(""), null);
  assert.equal(fromLocalInput("not a date"), null);
  assert.equal(toLocalInput(null), "");
});

test("the line carries the place only when there is one", () => {
  const iso = "2026-10-12T16:00:00.000Z";
  assert.ok(nextSessionLine(iso, "Mike's flat").endsWith(" · Mike's flat"));
  assert.ok(!nextSessionLine(iso).includes(" · "));
});
