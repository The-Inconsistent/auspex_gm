import assert from "node:assert/strict";
import { test } from "node:test";
import { SETUP_STEPS } from "../../../apps/web/lib/setup/constants.ts";
import { loadEngine } from "./engine.ts";
import { buildRuleset, CHECKLIST } from "./ruleset.ts";

// The setup checklist (InconsisTable's house decision #90) against this repo's SETUP steps: the same steps in the
// book's order, each with its cite, Patron the optional one. Skipped where it needs InconsisTable's validator.
const engine = await loadEngine();
const skip = engine === null ? "InconsisTable is not checked out beside this repo" : false;

test("both rulesets pass InconsisTable's validator with their checklist and premise", { skip }, () => {
  for (const r of [buildRuleset(), buildRuleset({ builder: "ledger" })]) {
    const c = engine!.compileRuleset(r);
    if (!c.ok) assert.fail(c.problems.map((p) => `${p.path}: ${p.message}`).join("\n"));
  }
});

test("the checklist is this repo's setup steps, in order, with their cites", () => {
  // This repo writes the book's name in full and an en dash; the platform's cite is 40 characters at most.
  const short = (c: string) =>
    c
      .replace(/Core Rulebook/g, "Core")
      .replace("Forsaken System Player's Guide", "FSPG")
      .replace(/–/g, "-")
      .replace(/; /g, ", ");
  assert.deepEqual(
    CHECKLIST.map((c) => [c.id, c.cite, !!c.optional]),
    SETUP_STEPS.map((s) => [s.key, short(s.cite), "optional" in s && s.optional]),
  );
  // The premise's three steps read its lore entry (the owner's decision 2).
  for (const id of ["kind", "framework", "patron"])
    assert.equal((CHECKLIST.find((c) => c.id === id)!.done as { kind?: string }).kind, "lore", id);
  const ledger = buildRuleset({ builder: "ledger" }) as { checklist: { id: string; done: { built?: boolean } }[] };
  assert.equal(ledger.checklist.find((c) => c.id === "characters")!.done.built, true);
});
