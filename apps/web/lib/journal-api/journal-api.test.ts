import assert from "node:assert/strict";
import { test } from "node:test";

import { mergeDraft } from "./journal-api";

test("an empty recap becomes the draft, one line per entry", () => {
  assert.equal(
    mergeDraft({ recap: "  ", lines: ["Fight 1: ork-boy.", "20 XP awarded."] }),
    "Fight 1: ork-boy.\n20 XP awarded.",
  );
});

test("typed text is kept and the draft follows after a blank line", () => {
  assert.equal(
    mergeDraft({ recap: "We met Iskra.\n", lines: ["Fight 1: ork-boy."] }),
    "We met Iskra.\n\nFight 1: ork-boy.",
  );
});

test("lines already in the recap are not added twice", () => {
  const once = mergeDraft({ recap: "", lines: ["A.", "B."] });
  assert.equal(mergeDraft({ recap: once, lines: ["A.", "B."] }), once);
});
