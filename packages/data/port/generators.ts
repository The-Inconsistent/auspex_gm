// The book tables the GM rolls in prep and the generators that make codex entries from them (InconsisTable's house
// decision #98): the loot and bounty tables (Core pp.247-251, RR1 pp.17-22, Darktide pp.15-27; RR2 pp.20-31 and
// Bloody Gates as lists to pick from), the Space Hulk Generator (RR1 pp.6-11) and the Holy Relic creator (RR2
// pp.12-19). Built from packages/data/scene-presets through its schemas: a row's printed name, range and cite, never
// its text (the owner's decision 1 of 2026-11-26: the rows live in the ruleset's `tables`).
import { threatCite, type LootCount, type LootRow, type LootTable, type ThreatSource } from "@wg/shared";
import { relics, scenePresets, spaceHulk } from "../index.ts";
import { idOf } from "./ruleset.ts";
import type { Table, TableLine } from "./tables.ts";

type Rolled = Omit<Table, "die" | "entries"> & { die: string; entries: TableLine[] };
type Step = Record<string, unknown> & { id: string; label: string; kind: string };
export type Generator = {
  id: string;
  label: string;
  cite: string;
  steps: Step[];
  each?: { times: string; steps: Step[] };
  make: Record<string, unknown>;
};

const LABEL_MAX = 80;
const CHOICE_MAX = 60;
// A printed name as a line's label, cut at a word where it is longer than a label holds; the cite opens the page.
const label = (name: string, max = LABEL_MAX) =>
  name.length <= max ? name : `${name.slice(0, max - 1).replace(/\s+\S*$/, "")}…`;
const DIE: Record<string, string> = { d3: "1d3", d6: "1d6", "2d6": "2d6", "4d6": "4d6", d66: "d66" };
const cite = (source: ThreatSource, page: number) => threatCite({ source, page });

/** A rolled table of printed rows: each its name, range and cite; a range the book prints no row for says so. */
function rolled<R extends { id: string; from: number; to: number; name: string; page?: number }>(t: {
  title: string;
  dice: string;
  source: ThreatSource;
  page: number;
  rows: readonly R[];
  gaps?: readonly number[];
  line?: (r: R) => Partial<TableLine>;
}): Rolled {
  const lines: TableLine[] = t.rows.map((r) => ({
    id: idOf(r.id),
    label: label(r.name),
    range: [r.from, r.to],
    cite: cite(t.source, r.page ?? t.page),
    ...t.line?.(r),
  }));
  // A printed gap (no row for the result) is a line of its own, so the die's outcomes tile: the GM rolls again.
  const gaps = [...(t.gaps ?? [])].sort((a, b) => a - b);
  const runs: number[][] = [];
  for (const g of gaps) {
    const last = runs.at(-1);
    if (last && (last.at(-1)! + 1 === g || (t.dice === "d66" && last.at(-1)! + 1 === g))) last.push(g);
    else runs.push([g]);
  }
  for (const run of runs)
    lines.push({ id: `noRow${run[0]}`, label: "No row printed: roll again", range: [run[0]!, run.at(-1)!] });
  lines.sort((a, b) => a.range[0]! - b.range[0]!);
  return { title: label(t.title), die: DIE[t.dice]!, visibility: "gm", cite: cite(t.source, t.page), entries: lines };
}

// ── loot ──

/** The count a loot row prints as dice ("1d3 Hazard Suits"), rolled in the generator's count step (decision 3). */
const COUNT_TABLES = { d3: "lootCountD3", "2d6": "lootCount2d6" } as const;
const countTable = (dice: keyof typeof COUNT_TABLES): Rolled => {
  const [lo, hi] = dice === "d3" ? [1, 3] : [2, 12];
  return {
    title: `Loot count (${DIE[dice]})`,
    die: DIE[dice]!,
    visibility: "gm",
    cite: "Core p.247",
    entries: Array.from({ length: hi - lo + 1 }, (_, i) => ({
      id: `n${lo + i}`,
      label: String(lo + i),
      range: [lo + i, lo + i],
    })),
  };
};
const countsOf = (r: LootRow) =>
  [...r.items.map((i) => i.count), ...r.ammo.map((a) => a.count)].filter(
    (c): c is Exclude<LootCount, number> => typeof c === "string",
  );

// What a row hands over beyond the item the GM makes, in this repo's words: ammunition, Wealth, a count in dice.
function lootNote(r: LootRow): string | undefined {
  const ammo = r.ammo.map((a) => `${a.count} ${a.kind} ammo`);
  const parts = [
    ...(r.items.length > 1 ? [`${r.items.length} items`] : []),
    ...ammo,
    ...(r.wealth ? [`${r.wealth} Wealth`] : []),
    ...(countsOf(r).length > 0 ? [`counts rolled: ${countsOf(r).join(", ")}`] : []),
  ];
  return parts.length > 0 ? label(`Also: ${parts.join("; ")}`, 200) : undefined;
}

const lootTableId = (t: LootTable) => idOf(`loot ${t.id}`);
const lootTable = (t: LootTable): Rolled =>
  rolled({
    title: t.name,
    dice: t.dice!,
    source: t.source,
    page: t.page,
    rows: t.rows.map((r) => ({ ...r, from: r.from!, to: r.to! })),
    gaps: t.gaps,
    line: (r) => {
      const note = lootNote(r as LootRow);
      return note ? { note } : {};
    },
  });

// One generator per loot table: roll it, roll a count where the row prints dice (decision 3), and a fault where its
// book has one (RR1 p.22); the item is made with the row's name and the count. A list to pick from is a choice.
function lootGenerator(t: LootTable, faults: LootTable | undefined): Generator {
  const id = idOf(`loot ${t.id}`);
  const at = cite(t.source, t.page);
  if (!t.dice) {
    const options = t.rows.map((r) => idOf(r.id));
    return {
      id,
      label: label(t.name),
      cite: at,
      steps: [
        {
          id: "find",
          label: label(t.name, CHOICE_MAX),
          kind: "choice",
          options,
          labels: Object.fromEntries(t.rows.map((r) => [idOf(r.id), label(r.name, CHOICE_MAX)])),
        },
      ],
      make: { kind: "item", title: "find" },
    };
  }
  const byDice = (d: string) =>
    t.rows.filter((r) => countsOf(r).includes(d as never)).map((r) => `steps.find == "${idOf(r.id)}"`);
  const counts = (Object.keys(COUNT_TABLES) as (keyof typeof COUNT_TABLES)[])
    .map((d) => ({ d, when: byDice(d) }))
    .filter((c) => c.when.length > 0);
  const steps: Step[] = [
    { id: "find", label: label(t.name), kind: "roll", table: lootTableId(t) },
    ...counts.map((c, i) => ({
      id: i === 0 ? "count" : `count${i + 1}`,
      label: `How many (${DIE[c.d]})`,
      kind: "roll",
      table: COUNT_TABLES[c.d],
      when: c.when.join(" || "),
    })),
    ...(faults ? [{ id: "fault", label: label(faults.name), kind: "roll", table: lootTableId(faults) }] : []),
  ];
  return {
    id,
    label: label(t.name),
    cite: at,
    steps,
    make: {
      kind: "item",
      title: "find",
      fields: { ...(counts.length > 0 && { found: "count" }), ...(faults && { fault: "fault" }) },
    },
  };
}

// ── the Space Hulk (RR1 pp.6-11) ──

const HULK = {
  origin: "hulkOrigin",
  occupants: "hulkOccupants",
  objectives: "hulkObjectives",
  rooms: "hulkRooms",
} as const;
const MAX_ROOMS = 20;

// ── the Holy Relic (RR2 pp.12-19) ──

const RELIC = {
  form: "relicForm",
  owners: "relicOwner",
  anointments: "relicAnointment",
  oddities: "relicOddity",
  enemies: "relicEnemy",
} as const;
const relicPowerTable = (kind: string) => idOf(`relic power ${kind}`);

/** The tables the generators roll on, and the generators. */
export function prepTables(): { tables: Record<string, Rolled>; generators: Generator[] } {
  const { loot } = scenePresets();
  const [g, r] = [spaceHulk, relics];
  const tables: Record<string, Rolled> = {
    [COUNT_TABLES.d3]: countTable("d3"),
    [COUNT_TABLES["2d6"]]: countTable("2d6"),
  };
  for (const t of loot) if (t.dice) tables[lootTableId(t)] = lootTable(t);
  for (const [k, id] of Object.entries(HULK)) {
    const t = g[k as keyof typeof HULK];
    tables[id] = rolled({ title: t.name, dice: t.dice, source: g.source, page: t.page, rows: t.rows, gaps: t.gaps });
  }
  // A Form sends the GM to its kind's Powers (RR2 p.13), so the Power is the roll's last line; a Power that names an
  // enemy asks the Enemy Keyword Table (RR2 p.18).
  const relicRolled = <R extends { id: string; from: number; to: number; name: string }>(
    t: { name: string; dice: string; page: number; rows: readonly R[]; gaps?: readonly number[] },
    line?: (row: R) => Partial<TableLine>,
  ) => rolled({ title: t.name, dice: t.dice, source: r.source, page: t.page, rows: t.rows, gaps: t.gaps, line });
  tables[RELIC.form] = relicRolled(r.form, (row) => ({ next: relicPowerTable(row.kind) }));
  for (const p of r.powers) tables[relicPowerTable(p.kind)] = relicRolled(p);
  tables[RELIC.owners] = relicRolled(r.owners);
  tables[RELIC.anointments] = relicRolled(r.anointments);
  tables[RELIC.oddities] = relicRolled(r.oddities);
  tables[RELIC.enemies] = relicRolled(r.enemies);
  const enemyPowers = r.powers.flatMap((p) =>
    p.rows.filter((x) => x.enemy).map((x) => `steps.power == "${idOf(x.id)}"`),
  );

  const faults = loot.find((t) => t.fault);
  const generators: Generator[] = [
    ...loot.filter((t) => !t.fault).map((t) => lootGenerator(t, t.faults ? faults : undefined)),
    {
      id: "spaceHulk",
      label: "Space Hulk",
      cite: cite(g.source, g.page),
      steps: [
        { id: "name", label: "The hulk's name", kind: "text", maxLength: 100 },
        { id: "origin", label: label(g.origin.name), kind: "roll", table: HULK.origin },
        { id: "occupants", label: label(g.occupants.name), kind: "roll", table: HULK.occupants },
        { id: "objective", label: label(g.objectives.name), kind: "roll", table: HULK.objectives },
        { id: "rooms", label: "How many rooms", kind: "number", min: 0, max: MAX_ROOMS },
      ],
      each: {
        times: "steps.rooms",
        steps: [{ id: "room", label: label(g.rooms.name), kind: "roll", table: HULK.rooms }],
      },
      make: {
        kind: "location",
        title: "name",
        fields: { origin: "origin", occupants: "occupants", objective: "objective" },
        each: { title: "room" },
      },
    },
    {
      id: "holyRelic",
      label: "Holy Relic",
      cite: cite(r.source, r.page),
      steps: [
        { id: "name", label: "The relic's name", kind: "text", maxLength: 100 },
        { id: "power", label: "Form, then its Power", kind: "roll", table: RELIC.form },
        { id: "owner", label: label(r.owners.name), kind: "roll", table: RELIC.owners },
        { id: "anointment", label: label(r.anointments.name), kind: "roll", table: RELIC.anointments },
        { id: "oddity", label: label(r.oddities.name), kind: "roll", table: RELIC.oddities },
        {
          id: "enemy",
          label: label(r.enemies.name),
          kind: "roll",
          table: RELIC.enemies,
          when: enemyPowers.join(" || "),
        },
      ],
      make: {
        kind: "item",
        title: "name",
        fields: {
          relicPower: "power",
          relicOwner: "owner",
          relicAnointment: "anointment",
          relicOddity: "oddity",
          relicEnemy: "enemy",
        },
      },
    },
  ];
  return { tables, generators };
}
