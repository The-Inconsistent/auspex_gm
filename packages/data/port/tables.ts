// The book tables the GM reads at the table, as InconsisTable's lookups (its house decisions #87 and #88): Critical
// Hits (Core p.198), Perils of the Warp (Core pp.263-264) and the Mutation tables (Core pp.287-295). Built from this
// repo's own data (packages/data/lookups, packages/data/mutations) through its schemas, so no number or page is retyped.
// Each line keeps the printed row's name and range and what it does to the target, never its text: the cite opens the
// page (the owner's decision 1 of 2026-11-26: book-derived rows live in the ruleset's `tables`).
import type { CritGlory, LookupApply, MutationRow, MutationTable, Severity } from "@wg/shared";
import { lookups, mutationTables } from "../index.ts";
import { idOf } from "./ruleset.ts";

type Effect = Record<string, unknown> & { kind: string };
export type TableLine = {
  id: string;
  label: string;
  range: number[];
  apply?: Effect[];
  note?: string;
  cite?: string;
  next?: string;
};
export type Table = {
  title: string;
  die: string;
  entries: TableLine[];
  visibility: "gm";
  cite: string;
  typedOnly?: boolean;
  inputs?: { id: string; label: string; type: "bool" | "int"; min?: number; max?: number; cite?: string }[];
  modifier?: string;
  entities?: string[];
};

/** The tables' ids, which spends, strikes and the converter name. */
export const TABLES = {
  criticalHits: "criticalHits",
  perils: "perils",
  severity: "mutationSeverity",
  ...({ subtle: "mutationsSubtle", minor: "mutationsMinor", severe: "mutationsSevere" } satisfies Record<
    Severity,
    string
  >),
} as const;
const SEVERITY_TABLE = (s: Severity) => TABLES[s];

/** The pack key of a Mutation entry: the book row's id, as the sheet holds it (`SheetMutation.id`). */
export const mutationKey = (id: string) => id;
/** A Mutation's own d6 table, by the id of the row that sends the GM to it. */
const subTableId = (rowId: string) => idOf(`mutation ${rowId}`);

const range = (from: number, to: number | null, open: boolean) => (open || to === null ? [from] : [from, to]);

// An amount as the lookup reads it: a printed number, or the dice total the GM types into `input` (the platform cannot
// roll an amount, issue #324 question 5). Mortal Wounds are plain Wounds, as planApply counts them: they ignore
// Resilience (p.193) and the table's Wounds are counted after it.
function amount(a: Extract<LookupApply, { kind: "wounds" | "shock" | "mortal" | "corruption" }>, input: string) {
  return "amount" in a ? String(a.amount) : `ctx.${input}`;
}

/** One printed effect as the platform's effect; a Condition's printed rating is its stacks (p.197). */
function effectOf(a: LookupApply, input: (a: LookupApply) => string, when?: string): Effect[] {
  const w = when === undefined ? {} : { when };
  if (a.kind === "mutation") return [];
  if (a.kind === "condition") {
    const m = /^(.*?) \((\d+)\)$/.exec(a.condition);
    const [name, stacks] = m ? [m[1]!, Number(m[2])] : [a.condition, 1];
    return [{ kind: "condition", condition: idOf(name), ...(stacks > 1 && { times: String(stacks) }), ...w }];
  }
  // Corruption is the Agent's alone (p.285); a Threat carries none, so the GM leaves its dice at 0 there (a 0 is no
  // step), as planApply skips it: an effect cannot ask whether its target carries a resource.
  if (a.kind === "corruption") return [{ kind: "resource", resource: "corruption", by: amount(a, input(a)), ...w }];
  return [{ kind: "harm", [a.kind === "shock" ? "shock" : "wounds"]: amount(a, input(a)), ...w }];
}

/** Sums the hits of a list of effects into one harm effect each for Wounds and Shock, keeping the others. */
function merge(effects: Effect[]): Effect[] {
  const out: Effect[] = [];
  for (const e of effects) {
    const same = out.find(
      (o) => o.kind === "harm" && e.kind === "harm" && o.when === e.when && o.times === undefined && !e.times,
    );
    if (!same) {
      out.push({ ...e });
      continue;
    }
    for (const k of ["wounds", "shock"] as const)
      if (e[k] !== undefined) same[k] = same[k] === undefined ? e[k] : `${same[k] as string} + ${e[k] as string}`;
  }
  return out;
}

// Critical Hits (p.198): typed only. A Critical Hit that does not beat Resilience deals 1 Wound and nothing else
// (p.197, planApply's `beatResilience`). Glorious Criticals (pp.197-198): each Glory spent adds the row's `each`, the
// first adds its `first`, and the Glory comes off the pool; only a row whose Glory line is one effect has a stepper
// reading (rules-flow §11.156).
const UNDER = "ctx.under";
const OVER = `!${UNDER}`;
function glory(g: CritGlory | undefined): Effect[] {
  if (!g) return [];
  const per = (a: LookupApply, n: string): Effect[] =>
    effectOf(a, () => "", OVER).map((e) => {
      if (e.kind !== "harm") return { ...e, times: n };
      const k = e.wounds !== undefined ? "wounds" : "shock";
      return { ...e, [k]: `${e[k] as string} * ${n}` };
    });
  return [
    ...(g.first ?? []).flatMap((a) => effectOf(a, () => "", `${OVER} && ctx.glory >= 1`)),
    ...g.each.flatMap((a) => per(a, "ctx.glory")),
    { kind: "pool", pool: "glory", by: "-ctx.glory", when: OVER },
  ];
}

function criticalHits(): Table {
  const t = lookups().criticalHits;
  return {
    title: "Critical Hits",
    die: t.dice,
    visibility: "gm",
    cite: `Core p.${t.page}`,
    typedOnly: true,
    entities: ["agent", "threat"],
    inputs: [
      { id: "under", label: "Damage did not beat Resilience", type: "bool", cite: "Core p.197" },
      // The row's dice (1d3, 1d3+1, 1d6...) rolled at the table, the total as the GM reads it.
      { id: "rolled", label: "Dice rolled (total)", type: "int", min: 0, max: 6, cite: "Core p.198" },
      { id: "glory", label: "Glory spent", type: "int", min: 0, max: 10, cite: "Core p.197" },
    ],
    entries: t.rows.map((r) => ({
      id: idOf(r.name),
      label: r.name,
      range: [r.from, r.to],
      apply: [
        { kind: "harm", wounds: "1", when: UNDER },
        ...merge([...r.apply.flatMap((a) => effectOf(a, () => "rolled", OVER)), ...glory(r.glory)]),
      ],
      ...(!r.glory && { note: "No Glory stepper: the Glorious Critical is read from the page" }),
    })),
  };
}

// Perils of the Warp (pp.263-264): typed only, the d66 plus 10 for each extra Wrath Die showing 1 (§8, perilsResult).
// The GM enters the Wrath Dice that showed 1, as MANIFEST asks; a total past the top reads the top line (§11.155).
function perils(): Table {
  const t = lookups().perils;
  const last = t.rows.length - 1;
  return {
    title: "Perils of the Warp",
    die: t.dice,
    visibility: "gm",
    cite: "Core pp.263-264",
    typedOnly: true,
    entities: ["agent", "threat"],
    inputs: [
      { id: "ones", label: "Wrath Dice showing 1", type: "int", min: 1, max: 10, cite: "Core p.263" },
      { id: "harm", label: "Dice rolled: Wounds or Shock", type: "int", min: 0, max: 12, cite: "Core p.264" },
      { id: "corruption", label: "Dice rolled: Corruption", type: "int", min: 0, max: 6, cite: "Core p.264" },
    ],
    modifier: "max(0, ctx.ones - 1) * 10",
    entries: t.rows.map((r, i) => {
      const apply = merge(
        r.apply.flatMap((a) => effectOf(a, (x) => (x.kind === "corruption" ? "corruption" : "harm"))),
      );
      const mutation = r.apply.find((a) => a.kind === "mutation");
      return {
        id: idOf(r.name),
        label: r.name,
        range: range(r.from, r.to, i === last && r.to === null),
        ...(apply.length > 0 && { apply }),
        ...(mutation && { next: SEVERITY_TABLE(mutation.severity), note: "Then a roll on the Mutations table" }),
      };
    }),
  };
}

type Printed = Extract<MutationRow, { includes: string[] }>;
const isPrinted = (r: MutationRow): r is Printed => !("forward" in r);
const grant = (entry: string, when?: string): Effect => ({
  kind: "grant",
  held: "mutations",
  entry: mutationKey(entry),
  ...(when && { when }),
});

// A severity table (p.288): d66 plus 10 for each Mutation held (p.287, rules-flow §11.136), on every table a chain
// reaches; the top row sends the GM on (`forward`), or is the top line a modified total past 66 reads. A row with its
// own d6 table sends the GM there, whose rows grant the combined Mutation. The Warp Made Manifest brings three more,
// each unless held already, and two further rolls (p.295).
function severityTable(t: MutationTable, names: Record<Severity, string>): [string, Table] {
  const last = t.rows.length - 1;
  return [
    SEVERITY_TABLE(t.severity),
    {
      title: t.name,
      die: "d66",
      visibility: "gm",
      cite: `Core p.${t.page}`,
      entities: ["agent"],
      modifier: "count(mutations) * 10",
      entries: t.rows.map((r, i) => {
        const line = { range: range(r.from, r.to, i === last), cite: `Core p.${isPrinted(r) ? r.page : t.page}` };
        if (!isPrinted(r))
          return {
            id: idOf(`to ${r.forward}`),
            label: `On to ${names[r.forward]}`,
            ...line,
            next: SEVERITY_TABLE(r.forward),
          };
        if (r.sub) return { id: idOf(r.id), label: r.name, ...line, next: subTableId(r.id) };
        return {
          id: idOf(r.id),
          label: r.name,
          ...line,
          apply: [grant(r.id), ...r.includes.map((k) => grant(k, `!contains(mutations, "${mutationKey(k)}")`))],
          ...(r.extraRolls > 0 && { note: `Then roll ${r.extraRolls} more Mutations` }),
        };
      }),
    },
  ];
}

function subTables(t: MutationTable): [string, Table][] {
  return t.rows.filter(isPrinted).flatMap((r) =>
    r.sub
      ? [
          [
            subTableId(r.id),
            {
              title: r.sub.name,
              die: r.sub.dice,
              visibility: "gm",
              cite: `Core p.${r.page}`,
              entities: ["agent"],
              entries: r.sub.rows.map((s) => ({
                id: idOf(s.id),
                label: s.name,
                range: [s.from, s.to],
                apply: [grant(s.id)],
                cite: `Core p.${s.page}`,
              })),
            } satisfies Table,
          ] as [string, Table],
        ]
      : [],
  );
}

/** Every table of the ruleset: Critical Hits, Perils and the Mutation tables. */
export function bookTables(): Record<string, Table> {
  const mutations = mutationTables();
  const names = Object.fromEntries(mutations.map((t) => [t.severity, t.name])) as Record<Severity, string>;
  return {
    [TABLES.criticalHits]: criticalHits(),
    [TABLES.perils]: perils(),
    // A failed Mutation Test's severity (p.287, severityFor): 1-2 Subtle, 3-4 Minor, 5-6 Severe.
    [TABLES.severity]: {
      title: "Mutation severity",
      die: "d6",
      visibility: "gm",
      cite: "Core p.287",
      entities: ["agent"],
      entries: (["subtle", "minor", "severe"] as const).map((s, i) => ({
        id: s,
        label: mutations.find((t) => t.severity === s)!.name,
        range: [2 * i + 1, 2 * i + 2],
        next: SEVERITY_TABLE(s),
      })),
    },
    ...Object.fromEntries(mutations.flatMap((t) => [severityTable(t, names), ...subTables(t)])),
  };
}
