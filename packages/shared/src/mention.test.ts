import { test } from "node:test";
import assert from "node:assert/strict";
import {
  insertMention,
  mentionQuery,
  mentionToken,
  nameLinker,
  parseMentions,
  plainMentions,
  remapMentions,
} from "./index.ts";

const A = "00000000-0000-4000-8000-000000000001";
const B = "00000000-0000-4000-8000-000000000002";

test("parseMentions splits text and tokens, and a token round-trips", () => {
  const t = mentionToken({ kind: "npc", id: A });
  assert.equal(t, `@[npc:${A}]`);
  assert.deepEqual(parseMentions(`See ${t}${mentionToken({ kind: "location", id: B })}.`), [
    { text: "See " },
    { kind: "npc", id: A },
    { kind: "location", id: B },
    { text: "." },
  ]);
  assert.deepEqual(parseMentions(""), []);
});

test("a malformed or unknown-kind token stays text", () => {
  for (const s of [`@[npc:${A}`, `@[ship:${A}]`, "@[npc:not-an-id]", `[npc:${A}]`])
    assert.deepEqual(parseMentions(s), [{ text: s }]);
});

test("remapMentions follows the import's id map and leaves outside ids alone", () => {
  const C = "00000000-0000-4000-8000-000000000003";
  const text = `${mentionToken({ kind: "npc", id: A })} and ${mentionToken({ kind: "item", id: B })}`;
  assert.equal(
    remapMentions(text, new Map([[A, C]])),
    `${mentionToken({ kind: "npc", id: C })} and ${mentionToken({ kind: "item", id: B })}`,
  );
});

test("nameLinker: whole words, case-sensitive, longest first, never itself", () => {
  const link = nameLinker([
    { kind: "npc", id: A, name: "Verrin" },
    { kind: "npc", id: B, name: "Magos Verrin" },
    { kind: "location", id: "x", name: "Ix" }, // too short to link
  ]);
  assert.deepEqual(link({ text: "Ask Magos Verrin, not Verrins or verrin. Ix." }), [
    { text: "Ask " },
    { kind: "npc", id: B, name: "Magos Verrin" },
    { text: ", not Verrins or verrin. Ix." },
  ]);
  assert.deepEqual(link({ text: "Verrin waits.", self: A }), [{ text: "Verrin waits." }]);
  assert.deepEqual(nameLinker([])({ text: "plain" }), [{ text: "plain" }]);
});

test("nameLinker escapes regex characters in names", () => {
  const link = nameLinker([{ kind: "faction", id: A, name: "Cult (of) the Star" }]);
  assert.deepEqual(link({ text: "the Cult (of) the Star rises" }).length, 3);
});

test("mentionQuery finds the @ before the caret, but not inside an email", () => {
  assert.deepEqual(mentionQuery({ text: "see @ver", caret: 8 }), { start: 4, query: "ver" });
  assert.deepEqual(mentionQuery({ text: "@", caret: 1 }), { start: 0, query: "" });
  assert.equal(mentionQuery({ text: "a@b.c", caret: 5 }), null);
  assert.equal(mentionQuery({ text: "@ver x", caret: 6 }), null);
});

test("insertMention replaces the typed query and puts the caret after the token", () => {
  const token = mentionToken({ kind: "npc", id: A });
  const r = insertMention({ text: "see @ver now", start: 4, caret: 8, token });
  assert.equal(r.text, `see ${token} now`);
  assert.equal(r.caret, 4 + token.length);
});

test("plainMentions spells a token out, or the placeholder", () => {
  const text = `${mentionToken({ kind: "npc", id: A })} and ${mentionToken({ kind: "npc", id: B })}`;
  const nameOf = (id: string) => (id === A ? "Verrin" : undefined);
  assert.equal(plainMentions({ text, nameOf, missing: "(unknown)" }), "Verrin and (unknown)");
});
