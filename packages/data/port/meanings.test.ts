import assert from "node:assert/strict";
import { test } from "node:test";
import { SHEET_TERMS, type SheetTermKey } from "../../../apps/web/lib/sheet-terms/sheet-terms.ts";
import { AS_WRITTEN, english } from "./labels-vi.ts";
import { meaningPlaces, NO_DEFINITION } from "./meanings.ts";
import { buildRuleset } from "./ruleset.ts";

// The sheet's meanings on tap and the GM's labels in Vietnamese (rules-flow §11.206).
const rulesets = [buildRuleset(), buildRuleset({ builder: "ledger" })];

type Def = { label: unknown; cite?: string; summary?: string };
const definitions = (r: unknown): Def[] => {
  const x = r as {
    entities: { fields?: Record<string, Def>; derived?: Def[] }[];
    resources: Def[];
    conditions: Def[];
    campaignFields: Record<string, Def>;
  };
  return [
    ...x.entities.flatMap((e) => [...Object.values(e.fields ?? {}), ...(e.derived ?? [])]),
    ...x.resources,
    ...x.conditions,
    ...Object.values(x.campaignFields),
  ];
};

test("every sheet meaning is the summary of a definition both rulesets hold, or is listed as naming none", () => {
  const places = meaningPlaces();
  for (const term of Object.keys(SHEET_TERMS) as SheetTermKey[])
    assert.equal(places[term].length === 0, NO_DEFINITION.includes(term), term);
  for (const r of rulesets) {
    const summaries = new Set(definitions(r).map((d) => d.summary));
    for (const term of Object.keys(SHEET_TERMS) as SheetTermKey[])
      assert.equal(summaries.has(SHEET_TERMS[term].meaning), !NO_DEFINITION.includes(term), term);
  }
});

test("each summary is short words of this repo's own with a cite, never a book's paragraph", () => {
  for (const r of rulesets)
    for (const d of definitions(english(r)).filter((d) => d.summary !== undefined)) {
      const s = d.summary!;
      // 280 is the platform's guidance under its hard 300 (InconsisTable's house decision #126).
      assert.ok(s.length <= 280, `${d.label}: ${s.length}`);
      assert.ok(s.split(/[.!?](\s|$)/).filter((x) => x?.trim()).length <= 3, `${d.label}: more than three sentences`);
      assert.ok(d.cite, `${d.label} has a summary and no cite`);
    }
});

test("the GM's codex fields, tables and generators read in Vietnamese, but for the names kept as written", () => {
  const left: string[] = [];
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (typeof v !== "object" || v === null) return;
    for (const [k, x] of Object.entries(v)) {
      const labels = k === "label" ? [x] : k === "labels" && typeof x === "object" && x ? Object.values(x) : [];
      for (const l of labels) if (typeof l === "string" && !AS_WRITTEN.has(l) && !/^\d+$/.test(l)) left.push(l);
      walk(x);
    }
  };
  for (const r of rulesets) {
    const { codex, generators, tables } = r as unknown as { codex: unknown; generators: unknown; tables: object };
    walk(codex);
    walk(generators);
    // The relic's enemy table lists Keywords, which stay as the sheet's Keywords do.
    for (const [id, t] of Object.entries(tables)) if (id !== "relicEnemy") walk((t as { entries: unknown }).entries);
  }
  assert.deepEqual(left, []);
});
