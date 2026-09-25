import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { creationCatalogue, loadPack } from "./index.ts";

// The volkus pregens (docs/pregens.md) were built by hand from the books; every piece they use must resolve in the
// creation catalogue, at the XP their ledgers charge.
const c = creationCatalogue();
const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/\s*\(.*?\)\s*/g, "")
    .replace(/[^a-z0-9]/g, "");
const byName = <T extends { name: string }>(list: T[], name: string) => list.find((r) => norm(r.name) === norm(name));

// Ledger rows: "| Archetype | Primaris Incursor (VoA p.33) | 273 | 273 |", and the same for Ascension / Package.
const ledger = new Map(
  [
    ...readFileSync(new URL("../../docs/pregens.md", import.meta.url), "utf8").matchAll(
      /^\| (?:Archetype|Ascension|Package) \| ([^(|]+?) \(.*?\| (\d+) \|/gm,
    ),
  ].map((m) => [norm(m[1]!), Number(m[2])]),
);
// Where a GM ruling moved the catalogue away from what the pregens were built on.
const RULED: Record<string, { xp: number; why: string }> = {
  // docs/rules-flow.md §11.34: VoA's printing (357) is kept; the pregen was built on Core p.117 (300).
  primarisintercessor: { xp: 357, why: "§11.34" },
};

for (const { name, stats } of loadPack("volkus").characters) {
  test(`${name}: species, archetype, packages, talents and chapter resolve`, () => {
    assert.ok(
      c.species.find((s) => s.name === stats.species),
      stats.species,
    );

    const [archetype, ...packages] = stats.archetype.split(" + ");
    const a = byName(c.archetypes, archetype!);
    assert.ok(a, archetype);
    assert.equal(a.xp, RULED[norm(a.name)]?.xp ?? ledger.get(norm(archetype!)));
    for (const p of packages) {
      const pkg = byName(c.packages, p);
      assert.ok(pkg, p);
      assert.equal(pkg.xp, ledger.get(norm(p)));
    }

    for (const t of stats.talents) assert.ok(byName(c.talents, t.name), t.name);

    // The Chapter is the keyword a chapter sub-faction fills in; the sheet carries its traits, bar the Gene-seed ones
    // a Primaris ignores (Core p.71).
    const chapter = c["sub-factions"].find((s) => s.type === "chapter" && stats.keywords.includes(s.keyword));
    assert.ok(chapter, stats.keywords.join(", "));
    const abilities = stats.abilities.map((r) => norm(r.name));
    for (const trait of chapter.traits.filter((t) => !t.geneSeed))
      assert.ok(abilities.includes(norm(trait.name)), trait.name);
  });
}

test("pregen ledgers cover every archetype and package the pregens use", () => {
  assert.ok(ledger.size >= 7, `${ledger.size} ledger rows`);
});
