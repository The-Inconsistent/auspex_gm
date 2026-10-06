import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import type { CharacterStats } from "@wg/shared";
import { creationCatalogue } from "./index.ts";

// The pregen fixtures (fixtures/pregens) were built by hand from the books; every piece they use must resolve in the
// creation catalogue, at the XP their ledgers charge.
const c = creationCatalogue();
const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/\s*\(.*?\)\s*/g, "")
    .replace(/[^a-z0-9]/g, "");
const byName = <T extends { name: string }>(list: T[], name: string) => list.find((r) => norm(r.name) === norm(name));

// Each fixture's `parts`: the XP its ledger charges for its archetype, Ascension and packages, by normalised name.
const dir = new URL("./fixtures/pregens/", import.meta.url);
const fixtures: { name: string; stats: CharacterStats; parts: Record<string, number> }[] = readdirSync(dir)
  .filter((f) => f.endsWith(".json"))
  .sort()
  .map((f) => JSON.parse(readFileSync(new URL(f, dir), "utf8")));
for (const { name, stats, parts } of fixtures) {
  test(`${name}: species, archetype, packages, talents and chapter resolve`, () => {
    assert.ok(
      c.species.find((s) => s.name === stats.species),
      stats.species,
    );

    const [archetype, ...packages] = stats.archetype.split(" + ");
    const a = byName(c.archetypes, archetype!);
    assert.ok(a, archetype);
    assert.equal(a.xp, parts[norm(archetype!)]);
    for (const p of packages) {
      const pkg = byName(c.packages, p);
      assert.ok(pkg, p);
      assert.equal(pkg.xp, parts[norm(p)]);
    }

    for (const t of stats.talents) assert.ok(byName(c.talents, t.name), t.name);

    // A sub-faction (Chapter, Order, Forge World…) is the keyword it fills in; the sheet carries its traits, bar the
    // Gene-seed ones a Primaris ignores (Core p.71). A [CHAPTER] archetype must have its Chapter.
    const subs = c["sub-factions"].filter((s) => stats.keywords.includes(s.keyword));
    // The Red Scorpions have no catalogue record and, by GM ruling, no Chapter Traits.
    if (a.keywords.includes("[CHAPTER]") && !stats.keywords.includes("RED SCORPIONS"))
      assert.ok(
        subs.some((s) => s.type === "chapter"),
        stats.keywords.join(", "),
      );
    const abilities = stats.abilities.map((r) => norm(r.name));
    for (const trait of subs.flatMap((s) => s.traits).filter((t) => !t.geneSeed))
      assert.ok(abilities.includes(norm(trait.name)), trait.name);
  });
}

test("pregen ledgers cover every archetype and package the pregens use", () => {
  for (const { stats, parts } of fixtures)
    for (const part of stats.archetype.split(" + ")) assert.ok(norm(part) in parts, part);
});
