import { test } from "node:test";
import assert from "node:assert/strict";
import { icsDate, icsText, toIcs } from "./calendar.ts";

const start = new Date("2026-10-12T16:00:00.000Z");
const ics = toIcs({
  uid: "c1-1791820800@auspex",
  start,
  summary: "Seals, Lies; Ash \\ Session 4",
  location: "Mike's flat\nbuzz 3",
  stamp: new Date("2026-10-09T08:00:00.000Z"),
});

test("toIcs: UTC times, a 3-hour event, CRLF line ends (issue #197)", () => {
  assert.equal(icsDate(start), "20261012T160000Z");
  const lines = ics.split("\r\n");
  assert.equal(lines.at(-1), "", "the file ends with CRLF");
  assert.ok(!ics.replace(/\r\n/g, "").includes("\n"), "no bare LF");
  assert.deepEqual(lines.slice(0, 2), ["BEGIN:VCALENDAR", "VERSION:2.0"]);
  assert.ok(lines.includes("DTSTART:20261012T160000Z"));
  assert.ok(lines.includes("DTEND:20261012T190000Z"));
  assert.ok(lines.includes("DTSTAMP:20261009T080000Z"));
  assert.ok(lines.includes("UID:c1-1791820800@auspex"));
  assert.deepEqual(lines.slice(-3, -1), ["END:VEVENT", "END:VCALENDAR"]);
});

test("toIcs: commas, semicolons, backslashes and line breaks escaped", () => {
  assert.equal(icsText("a,b;c\\d\ne"), "a\\,b\\;c\\\\d\\ne");
  assert.ok(ics.includes("SUMMARY:Seals\\, Lies\\; Ash \\\\ Session 4"));
  assert.ok(ics.includes("LOCATION:Mike's flat\\nbuzz 3"));
});

test("toIcs: no place, no LOCATION; a long line folds at 75 octets", () => {
  const plain = toIcs({ uid: "u", start, summary: "x".repeat(200), location: "" });
  assert.ok(!plain.includes("LOCATION"));
  const lines = plain.split("\r\n");
  assert.ok(lines.every((l) => new TextEncoder().encode(l).length <= 75));
  const unfolded = plain.replace(/\r\n /g, "");
  assert.ok(unfolded.includes(`SUMMARY:${"x".repeat(200)}`));
});
