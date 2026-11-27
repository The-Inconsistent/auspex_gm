import assert from "node:assert/strict";
import { test } from "node:test";
import { requisitionKindOf, requisitionTest, requisitionYield, type Rarity } from "@wg/shared";
import { wargearList } from "../index.ts";
import { loadEngine } from "./engine.ts";
import { buildRuleset, COUNTED_KINDS, idOf, itemKindOf } from "./ruleset.ts";

// The items an Agent carries and a requisition (InconsisTable's house decisions #95 and #102), against this repo's
// requisitionTest and requisitionYield (Core pp.205-206, p.229). Skipped when InconsisTable is not checked out here.
const engine = await loadEngine();
const skip = engine === null ? "InconsisTable is not checked out beside this repo" : false;
const ledger = buildRuleset({ builder: "ledger" });
const ev = (source: string, scope: Record<string, unknown>) =>
  engine!.evaluate({ node: engine!.parseExpr(source), scope });
const sum = (parts: { value: string }[], scope: Record<string, unknown>) =>
  parts.reduce((n, p) => n + (ev(p.value, scope) as number), 0);

test("the ledger ruleset passes InconsisTable's validator with its items and requisition", { skip }, () => {
  const result = engine!.compileRuleset(ledger);
  if (!result.ok) assert.fail(result.problems.map((p) => `${p.path}: ${p.message}`).join("\n"));
  assert.ok(!("items" in buildRuleset()), "the by-hand ruleset has no wargear entries to carry");
});

test("every catalogue kind is carried as one item kind, ammunition and grenades counted", () => {
  const want: Record<string, string> = {
    weapon: "weapon",
    armour: "armour",
    upgrade: "upgrade",
    ammo: "ammo",
    grenade: "grenade",
    equipment: "gear",
    augmetic: "gear",
    follower: "gear",
  };
  for (const [kind, item] of Object.entries(want)) assert.equal(itemKindOf(kind), item, kind);
  // A requisition counts Ammo and Grenades on the session's Ammo Test (requisitionKindOf, p.205, p.229).
  for (const kind of Object.keys(want))
    assert.equal(COUNTED_KINDS.has(itemKindOf(kind)), requisitionKindOf(kind as never) !== "wargear", kind);
});

// Keyword sets an Agent may hold, against every item's printed Keywords.
const AGENTS = [[], ["IMPERIUM"], ["IMPERIUM", "ADEPTUS ASTARTES"], ["AELDARI", "ASURYANI"], ["CHAOS", "HERETIC"]];

test("a requisition's DN, bonus dice and who may ask are requisitionTest's", { skip }, () => {
  const { acquire } = (ledger as Extract<typeof ledger, { items: unknown }>).items;
  let checked = 0;
  for (const w of wargearList()) {
    if (w.value === null || w.rarity === null) continue;
    const item = {
      value: w.value,
      rarity: idOf(w.rarity),
      keywords: w.keywords,
      tags: [w.source, w.kind],
    };
    for (const keywords of AGENTS) {
      const scope = { ...engine!.actorScope({ fields: { keywords } }), item };
      const want = requisitionTest({ keywords, itemKeywords: w.keywords, value: w.value, rarity: w.rarity as Rarity });
      const what = `${w.id} for ${JSON.stringify(keywords)}`;
      assert.equal(ev(acquire.if, scope), keywords.length > 0 && want.eligible, what);
      assert.equal(sum(acquire.inputs.dn, scope), want.dn, what);
      assert.equal(sum(acquire.inputs.bonus, scope), want.bonusDice, what);
      if (COUNTED_KINDS.has(itemKindOf(w.kind)))
        assert.equal(
          ev(acquire.quantity, scope),
          requisitionYield(requisitionKindOf(w.kind), w.rarity as Rarity),
          what,
        );
      checked++;
    }
  }
  assert.ok(checked > 1000, `${checked} cases`);
});
