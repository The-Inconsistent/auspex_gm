import assert from "node:assert/strict";
import { test } from "node:test";
import { hazards, placeList, relics, scenePresets, spaceHulk } from "../index.ts";
import { buildCodexPack, SUMMARY_MAX } from "./codex-packs.ts";
import { loadEngine } from "./engine.ts";
import { prepTables, ROW_MAX } from "./generators.ts";
import { buildRuleset, idOf } from "./ruleset.ts";

// The prep tables, the generators and the codex pack (InconsisTable's house decisions #89, #97, #98) against this repo's
// own data: every printed row is a line, every dice count is rolled, every hazard, place and event is an entry. The
// validator runs when InconsisTable is checked out beside this repo.
const engine = await loadEngine();
const skip = engine === null ? "InconsisTable is not checked out beside this repo" : false;
const RULESETS = [buildRuleset(), buildRuleset({ builder: "ledger" })];
const { tables, generators } = prepTables();

test(
  "both rulesets pass InconsisTable's validator with their generators, and the codex pack with them",
  { skip },
  () => {
    const pack = buildCodexPack();
    for (const r of RULESETS) {
      const c = engine!.compileRuleset(r);
      if (!c.ok) assert.fail(c.problems.map((p) => `${p.path}: ${p.message}`).join("\n"));
      const result = engine!.validatePack({ input: pack, ruleset: c.compiled.ruleset });
      if (!result.ok) assert.fail(result.problems.map((p) => `${p.path}: ${p.message}`).join("\n"));
      assert.deepEqual(result.warnings, [], "no text long enough to be copied");
    }
  },
);

test("every printed loot, hulk and relic row is a line of its table, a gap a line of its own", () => {
  const { loot } = scenePresets();
  for (const t of loot.filter((x) => x.dice)) {
    const lines = tables[idOf(`loot ${t.id}`)]!.entries;
    assert.deepEqual(
      lines.map((l) => l.range),
      t.rows.map((r) => [r.from, r.to]),
      t.id,
    );
  }
  const objectives = tables.hulkObjectives!.entries;
  assert.equal(objectives.length, spaceHulk.objectives.rows.length + 2, "14-16 and 46 print no row");
  for (const p of relics.powers) assert.ok(tables[idOf(`relic power ${p.kind}`)], p.kind);
  // Every Form sends the GM to its kind's Powers (RR2 p.13).
  for (const l of tables.relicForm!.entries) assert.ok(l.next && tables[l.next], l.id);
});

test("a row's label is a name or a tag of a few words, never a printed sentence (§11.195)", () => {
  for (const [id, t] of Object.entries(tables))
    for (const l of t.entries) assert.ok(l.label.length <= ROW_MAX, `${id}.${l.id}: ${l.label}`);
  for (const g of generators)
    for (const s of g.steps)
      for (const l of Object.values((s.labels ?? {}) as Record<string, string>))
        assert.ok(l.length <= ROW_MAX, `${g.id}.${s.id}: ${l}`);
  // The trinkets print each row as a sentence: labelled by the roll only.
  assert.equal(tables.lootCoreTrinkets1!.entries[0]!.label, "Trinket 11");
});

test("a row printing two counts in dice makes both into the item, none dropped", () => {
  const g = generators.find((x) => x.id === "lootDarktideBountiesIndustrialWorks")!;
  assert.deepEqual(
    g.steps.filter((s) => s.id.startsWith("count")).map((s) => s.id),
    ["count", "count2"],
  );
  assert.deepEqual((g.make as { fields: object }).fields, { found: "count", found2: "count2" });
});

test("a loot row's count in dice is rolled in its generator, only for the rows that print it (decision 3)", () => {
  const { loot } = scenePresets();
  for (const t of loot.filter((x) => x.dice && !x.fault)) {
    const g = generators.find((x) => x.id === idOf(`loot ${t.id}`))!;
    const counts = g.steps.filter((s) => s.id.startsWith("count"));
    const dice = t.rows.filter((r) =>
      [...r.items.map((i) => i.count), ...r.ammo.map((a) => a.count)].some((c) => typeof c === "string"),
    );
    assert.equal(counts.length > 0, dice.length > 0, t.id);
    for (const r of dice)
      assert.ok(
        counts.some((s) => String(s.when).includes(`"${idOf(r.id)}"`)),
        r.id,
      );
    assert.equal(!!g.steps.find((s) => s.id === "fault"), !!t.faults, t.id);
  }
  // A list to pick from is a choice, never rolled.
  for (const t of loot.filter((x) => !x.dice))
    assert.equal(generators.find((x) => x.id === idOf(`loot ${t.id}`))!.steps[0]!.kind, "choice", t.id);
});

test("the codex pack holds every hazard, place and event, cited, in this repo's words", () => {
  const { entries } = buildCodexPack();
  const count = (type: string) => entries.filter((e) => e.type === type).length;
  assert.equal(count("hazard"), hazards.size);
  assert.equal(count("place"), placeList().length);
  assert.equal(
    count("sceneEvent"),
    scenePresets().tables.reduce((n, t) => n + t.rows.length, 0),
  );
  assert.equal(new Set(entries.map((e) => e.key)).size, entries.length, "keys are unique");
  for (const e of entries) {
    assert.ok(e.cite.length > 0 && e.cite.length <= 40, e.key);
    assert.ok(String(e.body.summary ?? "").length <= SUMMARY_MAX, e.key);
  }
  // A place's parent is a place of the pack, so it comes along with its children.
  const places = new Set(entries.filter((e) => e.type === "place").map((e) => e.key));
  for (const e of entries.filter((x) => x.body.parent)) assert.ok(places.has(e.body.parent as string), e.key);
});
