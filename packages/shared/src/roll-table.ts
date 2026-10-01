import { z } from "zod";

// Rolled book tables for the GM's prep (GitHub issue #39). The app rolls on a book table in prep only; a Test at the
// table stays physical dice (rules-flow.md §7). Rows hold inclusive ranges of printed results, so a d66 row 16–24
// covers 16 and 21–24: 17 to 20 aren't d66 results.

export const Dice = z.enum(["d3", "d6", "2d6", "4d6", "d66"]);
export type Dice = z.infer<typeof Dice>;

const D6 = [1, 2, 3, 4, 5, 6];
const span = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

// Every result the dice can show, in order. A d3 is a d6 halved and rounded up; a d66 reads one d6 as the tens and a
// second as the units (Core p.170).
export function results(dice: Dice): number[] {
  switch (dice) {
    case "d3":
      return [1, 2, 3];
    case "d6":
      return D6;
    case "2d6":
      return span(2, 12);
    case "4d6":
      return span(4, 24);
    case "d66":
      return D6.flatMap((tens) => D6.map((units) => tens * 10 + units));
  }
}

// One roll. `d6` gives one die's result: Math.random by default, a fixed sequence in tests.
export function roll(dice: Dice, d6 = () => 1 + Math.floor(Math.random() * 6)): number {
  const sum = (n: number) => Array.from({ length: n }, d6).reduce((a, b) => a + b, 0);
  switch (dice) {
    case "d3":
      return Math.ceil(d6() / 2);
    case "d6":
      return d6();
    case "2d6":
      return sum(2);
    case "4d6":
      return sum(4);
    case "d66":
      return d6() * 10 + d6();
  }
}

type Ranged = { from: number; to: number };

// The rows a result lands on: one, none in a printed gap, or two where the book prints overlapping ranges.
export const rowsFor = <R extends Ranged>(rows: R[], result: number): R[] =>
  rows.filter((r) => r.from <= result && result <= r.to);

// What's wrong with a transcribed table, so `validate` can tell a print gap or overlap (listed, kept as printed) from a
// missed or doubled row: each range runs between two results of the dice, in order, every result is covered by
// exactly one row, unless it's listed in `gaps` (no row) or `overlaps` (two rows).
export function tableProblems({
  dice,
  rows,
  gaps,
  overlaps,
}: {
  dice: Dice;
  rows: Ranged[];
  gaps: number[];
  overlaps: number[];
}): string[] {
  const all = results(dice);
  const problems: string[] = [];
  for (const r of rows)
    if (!all.includes(r.from) || !all.includes(r.to) || r.from > r.to)
      problems.push(`${r.from}–${r.to} isn't a range of ${dice} results`);
  for (const n of all) {
    const hits = rowsFor(rows, n).length;
    if (hits === 0 && !gaps.includes(n)) problems.push(`no row for ${n}`);
    if (hits > 0 && gaps.includes(n)) problems.push(`${n} is listed as a gap but has a row`);
    if (hits > 1 && !overlaps.includes(n)) problems.push(`${n} is on ${hits} rows`);
    if (hits < 2 && overlaps.includes(n)) problems.push(`${n} is listed as an overlap but isn't one`);
  }
  return problems;
}
