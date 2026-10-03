import {
  BeatTest,
  roll,
  rowsFor,
  threatCite,
  type HazardRow,
  type HazardTable,
  type LocationHazard,
  type PresetTest,
} from "@wg/shared";

// A place's hazards on screen (issue #49): the CODEX editor's list and the PREP scene card read them the same way.

// A book hazard's table and row, by the row id a place stores. Null for an id the catalogue doesn't have (the GM page
// loaded no presets).
export function findHazard({ tables, hazardId }: { tables: readonly HazardTable[]; hazardId: string }) {
  for (const table of tables) {
    const row = table.rows.find((r) => r.id === hazardId);
    if (row) return { table, row };
  }
  return null;
}

// A printed Test as the scene Tests the app shows: one per Skill it offers, at its DN, or the Tier plus `tierDn` (TA
// pp.11, 21), or none for the GM to set (§11.75).
export const hazardTests = ({ tests, tier }: { tests: readonly PresetTest[]; tier: number }): BeatTest[] =>
  tests.flatMap((t) => {
    const dn = t.dn ?? (t.tierDn === undefined ? null : tier + t.tierDn);
    const tierNote = t.tierDn === undefined ? "" : ` (DN: the Tier${t.tierDn ? ` + ${t.tierDn}` : ""})`;
    const base = { kind: t.kind, attribute: t.attribute, dn, purpose: `${t.purpose}${tierNote}` };
    const one = t.skills.length ? t.skills.map((skill) => ({ ...base, skill, attribute: null })) : [base];
    return one.map((x) => BeatTest.parse(x));
  });

export type HazardView = {
  name: string;
  own: boolean; // the GM's own, not a book row
  cite: string; // "Space Hulk Battlezone Hazards · TA p.11", or "Your own"
  tests: BeatTest[];
  conditions: string[]; // rule ids
  threats: HazardRow["threats"];
  text: string; // the printed result, or the GM's effect
  note: string; // what the book's fields can't hold: a Wrath trigger, Rounds, Influence lost
  intensities: HazardRow["variants"]; // what the GM can pick from (Core pp.201–202)
};

// What a place's entry shows: a book row with the intensity picked (its Tests and damage join the row's), or the GM's
// own. Null for a book row the catalogue doesn't have.
export function hazardView({
  entry,
  tables,
  tier,
}: {
  entry: LocationHazard;
  tables: readonly HazardTable[];
  tier: number;
}): HazardView | null {
  if (entry.kind === "custom")
    return {
      name: entry.name,
      own: true,
      cite: "Your own",
      tests: entry.tests,
      conditions: [],
      threats: [],
      text: entry.effect,
      note: "",
      intensities: [],
    };
  const found = findHazard({ tables, hazardId: entry.hazardId });
  if (!found) return null;
  const { table, row } = found;
  const variant = row.variants.find((v) => v.name === entry.variant);
  const printed = [...row.tests, ...(variant?.tests ?? [])];
  return {
    name: variant ? `${row.name} · ${variant.name}` : row.name,
    own: false,
    cite: `${table.name} · ${threatCite({ source: table.source, page: row.page })}`,
    tests: hazardTests({ tests: printed, tier }),
    conditions: row.conditions,
    threats: row.threats,
    text: variant ? `${row.text}\n\n${variant.name}: ${variant.text}` : row.text,
    note: [row.gm, ...printed.map((t) => t.gm)].filter(Boolean).join(" · "),
    intensities: row.variants,
  };
}

// ×TIER: one roll per Tier of the game (TA p.9, §11.94), each landing on a row. A result the book prints no row for
// rolls again (the Space Hulk's 66, §11.93). `d6` is Math.random's die by default, a fixed sequence in tests.
export function rollHazards({ table, times, d6 }: { table: HazardTable; times: number; d6?: () => number }) {
  const rows = table.rows.flatMap((r) =>
    r.from === undefined || r.to === undefined ? [] : [{ ...r, from: r.from, to: r.to }],
  );
  if (!table.dice || !rows.length) return [];
  const picked: HazardRow[] = [];
  // ponytail: a cap in case a table ever lands on nothing (tableProblems rules that out at load); 50 tries per pick.
  for (let tries = 0; picked.length < times && tries < times * 50; tries++) {
    const hit = rowsFor(rows, roll(table.dice, d6))[0];
    if (hit) picked.push(hit);
  }
  return picked;
}
