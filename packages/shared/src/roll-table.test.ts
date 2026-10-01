import { test } from "node:test";
import assert from "node:assert/strict";
import { results, roll, rowsFor, tableProblems } from "./roll-table.ts";

const dice =
  (...faces: number[]) =>
  () =>
    faces.shift()!;

test("each kind of dice shows the results it can roll (Core p.170)", () => {
  assert.deepEqual(results("d3"), [1, 2, 3]);
  assert.equal(results("2d6").length, 11);
  assert.equal(results("4d6").length, 21);
  assert.equal(results("d66").length, 36);
  assert.ok(!results("d66").includes(17) && results("d66").includes(16) && results("d66").includes(21));
});

test("a roll reads its dice as the book does", () => {
  assert.equal(roll("d3", dice(5)), 3, "a 5 or 6 counts as 3");
  assert.equal(roll("d3", dice(2)), 1);
  assert.equal(roll("d66", dice(3, 4)), 34, "first die tens, second units");
  assert.equal(roll("2d6", dice(6, 5)), 11);
  for (let i = 0; i < 200; i++) assert.ok(results("d66").includes(roll("d66")));
});

test("a result lands on the rows whose range holds it", () => {
  const rows = [
    { from: 11, to: 16, name: "a" },
    { from: 16, to: 24, name: "b" },
  ];
  assert.deepEqual(
    rowsFor(rows, 21).map((r) => r.name),
    ["b"],
  );
  assert.deepEqual(
    rowsFor(rows, 16).map((r) => r.name),
    ["a", "b"],
  );
  assert.deepEqual(rowsFor(rows, 25), []);
});

test("a table's problems tell a printed gap or overlap from a missed row", () => {
  const rows = [
    { from: 2, to: 6 },
    { from: 6, to: 10 },
  ];
  assert.deepEqual(tableProblems({ dice: "2d6", rows, gaps: [11, 12], overlaps: [6] }), []);
  assert.deepEqual(tableProblems({ dice: "2d6", rows, gaps: [11], overlaps: [] }), ["6 is on 2 rows", "no row for 12"]);
  assert.deepEqual(tableProblems({ dice: "d66", rows: [{ from: 11, to: 17 }], gaps: [], overlaps: [] }).slice(0, 1), [
    "11–17 isn't a range of d66 results",
  ]);
});
