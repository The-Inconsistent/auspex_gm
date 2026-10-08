import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { mentionToken, type MentionKind } from "@wg/shared";

import type { MentionEntry } from "@/components/ui/mentions/mentions-provider";

import { searchEntries } from "./utils.ts";

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
// An entry with only the fields the search reads.
const entryOf = (kind: MentionKind, n: number, name: string, row: Record<string, unknown> = {}): MentionEntry => ({
  kind,
  id: ID(n),
  name,
  hidden: false,
  row: { id: ID(n), ...row },
});
const names = (hits: { entry: MentionEntry }[]) => hits.map((h) => h.entry.name);

describe("codex search", () => {
  test("an empty or punctuation-only query finds nothing", () => {
    const entries = [entryOf("npc", 1, "Verrin")];
    assert.deepEqual(searchEntries(entries, "", "(removed)"), []);
    assert.deepEqual(searchEntries(entries, " ' ", "(removed)"), []);
  });

  test("name matches come before body matches, each by name", () => {
    const entries = [
      entryOf("npc", 1, "Zeta", { description: "Keeps the vox." }),
      entryOf("location", 2, "Vox Shrine"),
      entryOf("npc", 3, "Alpha", { gmNotes: "Was the vox-operator." }),
    ];
    assert.deepEqual(names(searchEntries(entries, "vox", "(removed)")), ["Vox Shrine", "Alpha", "Zeta"]);
  });

  test("punctuation and accents fold away", () => {
    const entries = [entryOf("faction", 1, "T'au Envoys"), entryOf("npc", 2, "Ophélie")];
    assert.deepEqual(names(searchEntries(entries, "tau", "(removed)")), ["T'au Envoys"]);
    assert.deepEqual(names(searchEntries(entries, "ophelie", "(removed)")), ["Ophélie"]);
  });

  test("a mention reads as its name, never its token", () => {
    const verrin = entryOf("npc", 1, "Verrin");
    const shrine = entryOf("location", 2, "Shrine", { description: `Tended by ${mentionToken(verrin)}.` });
    assert.deepEqual(names(searchEntries([verrin, shrine], "npc", "(removed)")), []);
    const [hit] = searchEntries([verrin, shrine], "tended by verrin", "(removed)");
    assert.equal(hit?.snippet, "Tended by Verrin.");
  });

  test("a phone's blanked GM fields never match", () => {
    const phone = entryOf("npc", 1, "Verrin", { description: "A scribe.", gmNotes: "", secrets: "" });
    assert.deepEqual(searchEntries([phone], "password", "(unknown)"), []);
    const gm = entryOf("npc", 1, "Verrin", { description: "A scribe.", secrets: "The password is Thrice." });
    assert.equal(searchEntries([gm], "password", "(removed)")[0]?.snippet, "The password is Thrice.");
  });

  test("a long body shows one line around the match, cut ends marked", () => {
    const body = `${"a ".repeat(50)}the cult's\n\npassword ${"b ".repeat(80)}`;
    const [hit] = searchEntries([entryOf("handout", 1, "Letter", { body })], "cults password", "(removed)");
    assert.ok(hit?.snippet?.startsWith("…"));
    assert.ok(hit?.snippet?.endsWith("…"));
    assert.match(hit?.snippet ?? "", /the cult's password/);
    assert.match(hit?.snippet ?? "", /^…a /); // starts on a whole word
  });
});
