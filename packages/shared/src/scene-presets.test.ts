import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BeatTest,
  EventTable,
  HazardTable,
  PoolPresetTable,
  PresetTest,
  presetLine,
  presetScene,
  rowsFor,
} from "./index.ts";

// Placeholders only: book text never goes in tests (docs/data.md, Copyright).
const event = (from: number, to: number, extra: object = {}) => ({
  from,
  to,
  name: `[event ${from}]`,
  page: 36,
  text: "[event text]",
  ...extra,
});
const table = (extra: object = {}) => ({
  id: "placeholder-events",
  name: "[Events]",
  source: "core",
  page: 36,
  dice: "d6",
  type: "travel",
  rows: [event(1, 2), event(3, 4), event(5, 6)],
  ...extra,
});

test("an event Test names the pool its kind rolls, with a choice of Skills at one DN", () => {
  const ok = (t: object) => PresetTest.safeParse({ purpose: "[purpose]", ...t }).success;
  assert.ok(ok({ kind: "skill", skills: ["Awareness", "Leadership", "Survival"] }));
  assert.ok(ok({ kind: "attribute", attribute: "T", dn: 3 }));
  assert.ok(ok({ kind: "opposed", skills: ["Stealth"] }));
  assert.ok(ok({ kind: "resolve", dn: 3 }));
  assert.equal(ok({ kind: "skill" }), false, "a Skill Test names its Skills");
  assert.equal(ok({ kind: "opposed", skills: ["Stealth"], dn: 3 }), false, "an Opposed Test has no DN");
  assert.equal(ok({ kind: "resolve", skills: ["Insight"] }), false, "a trait Test names no Skill");
  // "a DN equal to the game's Tier" (TA p.11), "Tier + 3" (TA p.21): a Tier DN, never with a printed one.
  assert.ok(ok({ kind: "resolve", tierDn: 0 }));
  assert.equal(ok({ kind: "resolve", dn: 3, tierDn: 3 }), false, "a printed DN or a Tier DN");
  assert.equal(ok({ kind: "opposed", skills: ["Stealth"], tierDn: 0 }), false, "an Opposed Test has no DN");
});

test("an event table covers every result once, unless the book prints a gap or an overlap", () => {
  assert.ok(EventTable.safeParse(table()).success);
  assert.equal(EventTable.safeParse(table({ rows: [event(1, 2), event(3, 4)] })).success, false, "5 and 6 missed");
  assert.ok(EventTable.safeParse(table({ rows: [event(1, 2), event(3, 4)], gaps: [5, 6] })).success, "a print gap");
  const twice = { rows: [event(1, 3), event(3, 4), event(5, 6)] };
  assert.equal(EventTable.safeParse(table(twice)).success, false, "3 on two rows");
  assert.ok(EventTable.safeParse(table({ ...twice, overlaps: [3] })).success, "a print overlap");
  const d66 = table({ dice: "d66", rows: [event(11, 36), event(41, 66)] });
  assert.ok(EventTable.safeParse(d66).success, "d66 ranges skip 17 to 20");
});

test("a scene from an event: its name and text, one Test per Skill, the table's DN where none is printed", () => {
  const t = EventTable.parse(
    table({
      defaultDn: 5,
      rows: [
        event(1, 2, {
          readAloud: "[read aloud]",
          tests: [
            { kind: "skill", skills: ["Awareness", "Survival"], purpose: "[find the way]" },
            { kind: "attribute", attribute: "T", dn: 3, purpose: "[endure]" },
            { kind: "opposed", skills: ["Stealth"], purpose: "[slip past]" },
          ],
        }),
        event(3, 4, { type: "combat", tests: [{ kind: "skill", skills: ["Tech"], purpose: "[fix it]" }] }),
        event(5, 6),
      ],
    }),
  );
  const s = presetScene({ table: t, row: t.rows[0]! });
  assert.equal(s.title, "[event 1]");
  assert.equal(s.type, "travel");
  assert.equal(s.readAloud, "[read aloud]");
  assert.equal(s.gmNotes, "[event text]\n\n([Events], Core p.36)");
  assert.deepEqual(
    s.tests.map((x) => `${x.kind} ${x.skill ?? x.attribute} ${x.dn}`),
    ["skill Awareness 5", "skill Survival 5", "attribute T 3", "opposed Stealth null"],
  );
  assert.ok(
    s.tests.every((x) => BeatTest.safeParse(x).success),
    "every Test is a valid scene Test",
  );
  assert.equal(presetScene({ table: t, row: t.rows[1]! }).type, "combat");

  const noDefault = EventTable.parse({ ...t, defaultDn: undefined });
  assert.equal(presetScene({ table: noDefault, row: noDefault.rows[1]! }).tests[0]!.dn, null, "the GM sets it");
});

// Placeholders only, as above.
const poolTable = (rows: object[]) => ({
  id: "placeholder-pools",
  name: "[List]",
  source: "bloody-gates",
  page: 26,
  rows,
});

test("a book's Ruin and Glory list names each row's pool, and its number only where the book prints one", () => {
  const ok = (row: object) => PoolPresetTable.safeParse(poolTable([{ name: "[row]", ...row }])).success;
  assert.ok(ok({ kind: "spend", pool: "ruin", n: 2 }));
  assert.ok(ok({ kind: "spend", pool: "ruin", n: null }), "no printed cost (§11.78)");
  assert.equal(ok({ kind: "spend", n: 2 }), false, "a spend with no pool");
  assert.equal(ok({ kind: "spend", pool: "ruin" }), false, "n is printed or null, never left out");
  assert.equal(ok({ kind: "spend", pool: "ruin", n: 11 }), false);
  assert.equal(PoolPresetTable.safeParse(poolTable([])).success, false, "a list has rows");
});

test("a preset copies into its scene list with its cite, never inventing a cost", () => {
  const t = PoolPresetTable.parse(
    poolTable([
      { kind: "spend", pool: "ruin", n: 2, name: "[spend]", text: "[effect]", gm: "[condition]" },
      { kind: "spend", pool: "ruin", n: null, name: "[unpriced]", page: 27 },
      { kind: "earn", pool: "glory", n: null, name: "[feat]" },
      { kind: "earn", pool: "ruin", n: 1, name: "[trigger]" },
    ]),
  );
  const [spend, unpriced, feat, trigger] = t.rows.map((row) => presetLine({ table: t, row }));
  assert.deepEqual(spend, {
    list: "spends",
    line: { pool: "ruin", name: "[spend]", cost: 2, text: "[effect] [condition] (BG p.26)" },
  });
  assert.deepEqual(unpriced!.line, { pool: "ruin", name: "[unpriced]", cost: null, text: "(BG p.27)" });
  assert.deepEqual(feat, { list: "glory", line: { text: "[feat] (BG p.26)", amount: 1 } }, "an award starts at 1");
  assert.equal(trigger!.list, "ruin");
});

// Placeholders, as above: a d66 hazard table with the ranges Threat Assessment prints (pp.11–21).
const D66 = [
  [11, 15],
  [16, 24],
  [25, 33],
  [34, 42],
  [43, 44],
  [45, 46],
  [51, 52],
  [53, 54],
  [55, 56],
  [61, 62],
  [63, 64],
  [65, 65],
  [66, 66],
];
const hazard = (from?: number, to?: number) => ({
  id: `ph-${from ?? "x"}`,
  from,
  to,
  name: "[hazard]",
  page: 11,
  text: "[text]",
});
const hazards = (extra: object = {}) => ({
  id: "placeholder-hazards",
  name: "[Hazards]",
  source: "threat-assessment",
  page: 11,
  dice: "d66",
  rows: D66.map(([from, to]) => hazard(from, to)),
  ...extra,
});

test("a d66 hazard table covers every result once; a range like 16-24 reads as plain numbers", () => {
  const t = HazardTable.parse(hazards());
  assert.deepEqual(
    [16, 21, 24, 25].map((n) => rowsFor(t.rows as { from: number; to: number }[], n)[0]?.from),
    [16, 16, 16, 25],
  );
  const noSixtySix = { rows: D66.slice(0, -1).map(([from, to]) => hazard(from, to)) };
  assert.equal(HazardTable.safeParse(hazards(noSixtySix)).success, false, "66 missed");
  assert.ok(HazardTable.safeParse(hazards({ ...noSixtySix, gaps: [66] })).success, "the Space Hulk's print gap (p.11)");
  assert.equal(HazardTable.safeParse(hazards({ rows: [hazard()] })).success, false, "a rolled row has a range");
});

test("a list to pick from (Core pp.201-202) has no dice and no ranges, and a hazard may print intensities", () => {
  const variant = (name: string, dn: number) => ({
    name,
    tests: [{ kind: "attribute", attribute: "T", dn, purpose: "[p]" }],
    text: "[x]",
  });
  const list = { dice: null, rows: [{ ...hazard(), variants: [variant("Light", 3), variant("Intense", 7)] }] };
  assert.ok(HazardTable.safeParse(hazards(list)).success);
  assert.equal(HazardTable.safeParse(hazards({ dice: null })).success, false, "a list has no ranges");
  const bad = { dice: null, rows: [{ ...hazard(), variants: [variant("Searing", 3)] }] };
  assert.equal(HazardTable.safeParse(hazards(bad)).success, false, "Light, Moderate or Intense only");
});
