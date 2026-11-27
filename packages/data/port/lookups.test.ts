import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import {
  ATTRIBUTES,
  CharacterStats,
  deriveStats,
  diceRange,
  isD66,
  mutationRow,
  perilsRow,
  planApply,
  severityFor,
  sheetMutation,
  skillTotal,
  SKILLS,
  type ActionInput,
  type LookupApply,
  sustainEntry,
  sustainPenalty,
  type Skill,
} from "@wg/shared";
import { lookups, mutationTables } from "../index.ts";
import { loadEngine, type Compiled } from "./engine.ts";
import { english } from "./labels-vi.ts";
import { buildMutationPack, heldKeyOf } from "./mutations.ts";
import { buildRuleset, idOf } from "./ruleset.ts";
import { TABLES } from "./tables.ts";

// Critical Hits, Perils and the Mutation tables as lookups (InconsisTable's house decisions #87, #88), against this
// repo's planApply, perilsRow, mutationRow and deriveStats: every typed result, input and held count. Skipped when
// InconsisTable is not checked out beside this repo.
const engine = await loadEngine();
const skip = engine === null ? "InconsisTable is not checked out beside this repo" : false;

type Step =
  | { kind: "harm"; wounds: number; shock: number }
  | { kind: "condition"; condition: string }
  | { kind: "resource"; resource: string; by: number }
  | { kind: "pool"; pool: string; by: number }
  | { kind: "grant"; entry: string; has: boolean };
type Plan = { ok: true; total: number; entry: number; steps: Step[] } | { ok: false; code: string };
type Lookups = {
  planLookup(a: { compiled: unknown; tableId: string; result: number; inputs: object; scope: object }): Plan;
  deriveValues(a: {
    compiled: unknown;
    entity: string;
    values: { fields: object; campaign?: object; entries?: object[] };
  }): Record<string, number>;
};
const L = engine as unknown as Lookups;
let compiledOnce: Compiled | null = null;
const compiled = () => {
  if (compiledOnce) return compiledOnce;
  const r = engine!.compileRuleset(buildRuleset({ builder: "ledger" }));
  if (!r.ok) assert.fail(r.problems.map((p) => `${p.path}: ${p.message}`).join("\n"));
  return (compiledOnce = r.compiled);
};
const tableOf = (id: string) =>
  (english(buildRuleset({ builder: "ledger" })).tables as Record<string, { entries: { id: string; label: string }[] }>)[
    id
  ]!;
const D66 = Array.from({ length: 56 }, (_, i) => i + 11).filter(isD66);
const agent = (fields: Record<string, unknown> = {}) =>
  engine!.actorScope({ fields, resources: { wounds: 0, shock: 0, corruption: 0 } });

/** What a plan of either app does, summed: Wounds, Shock, Condition stacks, Corruption and the Glory spent. */
type Sum = { wounds: number; shock: number; conditions: Record<string, number>; corruption: number; glory: number };
const empty = (): Sum => ({ wounds: 0, shock: 0, conditions: {}, corruption: 0, glory: 0 });
function ofSteps(steps: Step[]): Sum {
  const s = empty();
  for (const x of steps) {
    s.wounds += x.kind === "harm" ? x.wounds : 0;
    s.shock += x.kind === "harm" ? x.shock : 0;
    if (x.kind === "condition") s.conditions[x.condition] = (s.conditions[x.condition] ?? 0) + 1;
    else if (x.kind === "resource") s.corruption += x.by;
    else if (x.kind === "pool") s.glory += x.by;
  }
  return s;
}
function ofActions(actions: ActionInput[]): Sum {
  const s = empty();
  for (const a of actions as Record<string, unknown>[])
    if (a.type === "character.adjust") {
      s.wounds += (a.wounds as number) ?? 0;
      s.shock += (a.shock as number) ?? 0;
    } else if (a.type === "character.update")
      for (const c of a.conditions as string[]) {
        const m = /^(.*?) \((\d+)\)$/.exec(c);
        s.conditions[idOf(m ? m[1]! : c)] = m ? Number(m[2]) : 1;
      }
    else if (a.type === "character.corrupt") s.corruption += a.delta as number;
    else if (a.type === "pool.adjust") s.glory += a.delta as number;
  return s;
}
// The totals a row's dice can show, each in turn; a row without dice is read once.
const rolls = (apply: LookupApply[]) => {
  const dice = apply.flatMap((a) => ("dice" in a ? [diceRange(a.dice)] : []));
  const at = dice[0] ?? { min: 0, max: 0 };
  return Array.from({ length: at.max - at.min + 1 }, (_, i) => at.min + i);
};

test("both rulesets pass InconsisTable's validator with their tables and held Mutations", { skip }, () => {
  for (const r of [buildRuleset(), buildRuleset({ builder: "ledger" })]) {
    const result = engine!.compileRuleset(r);
    if (!result.ok) assert.fail(result.problems.map((p) => `${p.path}: ${p.message}`).join("\n"));
  }
});

test("a Critical Hit typed in applies what planApply applies (Resilience, dice, Glory)", { skip }, () => {
  const rows = lookups().criticalHits.rows;
  let checked = 0;
  for (const result of D66) {
    const row = rows.find((r) => result >= r.from && result <= r.to)!;
    for (const under of [false, true])
      for (const glory of row.glory ? [0, 1, 3] : [0])
        for (const rolled of rolls(row.apply)) {
          const plan = L.planLookup({
            compiled: compiled(),
            tableId: TABLES.criticalHits,
            result,
            inputs: { under, rolled, glory },
            scope: agent(),
          });
          assert.ok(plan.ok, `${result}`);
          const want = planApply({
            row,
            target: { kind: "pc", id: "a", conditions: [] },
            typed: [rolled],
            glory: { spent: glory },
            beatResilience: !under,
          });
          assert.deepEqual(ofSteps(plan.steps), ofActions(want.actions), `${row.name} ${under} ${glory} ${rolled}`);
          checked++;
        }
  }
  assert.ok(checked > 200, `${checked} cases`);
});

test("Perils reads the row perilsRow reads, and applies what planApply applies", { skip }, () => {
  const table = lookups().perils;
  for (const d66 of D66)
    for (const ones of [1, 2, 3, 4, 6]) {
      const { row } = perilsRow(table, d66, ones - 1);
      const dice = row!.apply.filter((a) => "dice" in a);
      const harm = dice.find((a) => a.kind !== "corruption");
      const corruption = dice.find((a) => a.kind === "corruption");
      const typed = {
        harm: harm ? diceRange(harm.dice).max : 0,
        corruption: corruption ? diceRange(corruption.dice).min : 0,
      };
      const plan = L.planLookup({
        compiled: compiled(),
        tableId: TABLES.perils,
        result: d66,
        inputs: { ones, ...typed },
        scope: agent(),
      });
      assert.ok(plan.ok);
      assert.equal(tableOf(TABLES.perils).entries[plan.entry]!.label, row!.name, `${d66} with ${ones}`);
      const want = planApply({
        row: row!,
        target: { kind: "pc", id: "a", conditions: [] },
        typed: dice.map((a) => (a.kind === "corruption" ? typed.corruption : typed.harm)),
      });
      assert.deepEqual(ofSteps(plan.steps), ofActions(want.actions), `${row!.name}`);
    }
});

test("a Mutation table reads the row mutationRow reads, +10 per Mutation held", { skip }, () => {
  const tables = mutationTables();
  for (const t of tables)
    for (let held = 0; held <= 4; held++)
      for (const d66 of D66) {
        const mutations = Array.from({ length: held }, (_, i) => `held-${i}`);
        const plan = L.planLookup({
          compiled: compiled(),
          tableId: TABLES[t.severity],
          result: d66,
          inputs: {},
          scope: agent({ mutations }),
        });
        assert.ok(plan.ok);
        const want = mutationRow(t, d66, held);
        const id = "forward" in want ? idOf(`to ${want.forward}`) : idOf(want.id);
        assert.equal(tableOf(TABLES[t.severity]).entries[plan.entry]!.id, id, `${t.severity} ${d66} + ${held}`);
      }
  // The severity d6 (p.287) sends the GM to the table severityFor names.
  const severity = buildRuleset().tables[TABLES.severity]!;
  for (let d6 = 1; d6 <= 6; d6++) {
    const line = severity.entries.find((e) => d6 >= e.range[0]! && d6 <= e.range[1]!)!;
    assert.equal(line.next, TABLES[severityFor(d6)]);
  }
});

test("The Warp Made Manifest grants what it includes, unless held already", { skip }, () => {
  const grants = (mutations: string[]) =>
    L.planLookup({ compiled: compiled(), tableId: TABLES.severe, result: 66, inputs: {}, scope: agent({ mutations }) });
  const all = grants([]);
  assert.ok(all.ok);
  assert.deepEqual(
    all.steps.map((s) => s.kind === "grant" && s.entry),
    ["the-warp-made-manifest", "wings", "wyrdling", "horns-spines-fangs-or-claws"],
  );
  const some = grants(["wings"]);
  assert.ok(some.ok);
  // Held already: "wings" is left out, and +10 for it reads the same top row.
  assert.deepEqual(
    some.steps.map((s) => s.kind === "grant" && s.entry),
    ["the-warp-made-manifest", "wyrdling", "horns-spines-fangs-or-claws"],
  );
});

const dir = new URL("../fixtures/pregens/", import.meta.url);
const PREGENS = readdirSync(dir)
  .filter((f) => f.endsWith(".json"))
  .sort()
  .map(
    (f) =>
      JSON.parse(readFileSync(new URL(f, dir), "utf8")) as { name: string; stats: unknown; build: { tier: number } },
  )
  .map((c) => ({ ...c, stats: CharacterStats.parse(c.stats) }));
const fieldsOf = (stats: CharacterStats) => ({
  baseSpeed: stats.speed,
  "armour.ar": stats.armour.ar,
  "armour.powered": stats.armour.powered,
  ...Object.fromEntries(ATTRIBUTES.map((a) => [`attr.${idOf(a)}`, stats.attributes[a]])),
  ...Object.fromEntries(Object.entries(stats.skills).map(([s, v]) => [`skill.${idOf(s)}`, v])),
  ...Object.fromEntries(Object.entries(stats.mods).map(([k, v]) => [`mod.${k}`, v])),
});

test("a held Mutation moves the Traits and Skill totals as withMutations does", { skip }, () => {
  const pack = buildMutationPack();
  // Each entry as the sheet holds it: a printed row, or a d6 table's row folded into its parent (sheetMutation).
  const sheets = mutationTables().flatMap((t) =>
    t.rows.flatMap((r) =>
      "forward" in r ? [] : [sheetMutation(r), ...(r.sub?.rows ?? []).map((s) => sheetMutation(r, s))],
    ),
  );
  assert.equal(sheets.length, pack.entries.length);
  let moved = 0;
  for (const m of sheets) {
    const entry = pack.entries.find((e) => e.key === heldKeyOf(m))!;
    assert.ok(entry, m.name);
    for (const { name, stats, build } of PREGENS) {
      const held = { ...stats, mutations: [m] };
      const derived = L.deriveValues({
        compiled: compiled(),
        entity: "agent",
        values: {
          fields: fieldsOf(stats),
          campaign: engine!.campaignValues({ compiled: compiled(), stored: { tier: build.tier } }),
          entries: [
            {
              type: "mutation",
              key: entry.key,
              name: entry.name,
              effects: entry.effects.map((e) => ({ phase: "base", ...e })),
            },
          ],
        },
      });
      const want = deriveStats({ stats: held, overrides: {}, tier: build.tier });
      for (const [trait, value] of Object.entries(want))
        assert.equal(derived[trait], value, `${m.name}, ${name}: ${trait}`);
      for (const skill of Object.keys(SKILLS) as Skill[])
        assert.equal(derived[idOf(skill)], skillTotal(held, skill), `${m.name}, ${name}: ${skill}`);
    }
    if (entry.effects.length > 0) moved++;
  }
  assert.equal(moved, 19);
});

test("the Mutation pack carries no printed text and a cite on every entry", () => {
  const { entries } = buildMutationPack();
  for (const e of entries) {
    assert.match(e.cite, /^Core p\.\d+$/);
    assert.ok((e.body.summary?.length ?? 0) <= 200, e.key);
  }
  assert.equal(entries.length, 48);
});

test("sustaining adds sustainPenalty's DN to every Test, and Manifest opens Perils once a Round", { skip }, () => {
  for (const r of [buildRuleset(), buildRuleset({ builder: "ledger" })]) {
    const c = engine!.compileRuleset(r);
    assert.ok(c.ok);
    for (const powers of [[], ["Smite"], ["Smite", "Psychic Shriek", "Quickening"]]) {
      const derived = engine!.deriveValues({
        compiled: c.compiled,
        entity: "agent",
        values: { fields: { ...fieldsOf(PREGENS[0]!.stats), sustaining: powers }, campaign: { tier: 1 } },
      });
      const want = sustainPenalty(powers.map(sustainEntry));
      assert.equal(derived.sustainDn, want);
      for (const [id, t] of Object.entries(r.tests))
        if ("target" in t) assert.match(t.target, /derived\.sustainDn/, `${r.version} ${id}`);
    }
    const manifest = (
      r.spends as { id: string; if?: string; limit?: object; then?: object; inputs: { ones: { min: number } } }[]
    ).find((s) => s.id === "manifest")!;
    assert.deepEqual(manifest.limit, { per: "round", max: 1 });
    assert.deepEqual(manifest.then, { table: TABLES.perils, inputs: { ones: "ones" } });
    // A Manifest with no Wrath Die showing 1 is recorded as 0; Perils, which starts at 1, is offered all the same and
    // left unapplied by the GM (§11.191).
    const perils = (r.tables as Record<string, { inputs: { id: string; min: number }[] }>)[TABLES.perils]!;
    assert.equal(manifest.inputs.ones.min, 0);
    assert.equal(perils.inputs.find((x) => x.id === "ones")!.min, 1);
    const ev = (fields: Record<string, unknown>) =>
      engine!.evaluate({ node: engine!.parseExpr(manifest.if!), scope: engine!.actorScope({ fields }) });
    assert.equal(ev({ skill: { psychicMastery: 2 } }), true);
    assert.equal(ev({ keywords: ["IMPERIUM", "PSYKER"] }), true);
    assert.equal(ev({ keywords: ["IMPERIUM"] }), false);
  }
});
