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
for (const { name, stats } of loadPack("volkus").characters) {
  test(`${name}: species, archetype, packages, talents and chapter resolve`, () => {
    assert.ok(
      c.species.find((s) => s.name === stats.species),
      stats.species,
    );

    const [archetype, ...packages] = stats.archetype.split(" + ");
    const a = byName(c.archetypes, archetype!);
    assert.ok(a, archetype);
    assert.equal(a.xp, ledger.get(norm(archetype!)));
    for (const p of packages) {
      const pkg = byName(c.packages, p);
      assert.ok(pkg, p);
      assert.equal(pkg.xp, ledger.get(norm(p)));
    }

    for (const t of stats.talents) assert.ok(byName(c.talents, t.name), t.name);

    // A sub-faction (Chapter, Order, Forge World…) is the keyword it fills in; the sheet carries its traits, bar the
    // Gene-seed ones a Primaris ignores (Core p.71). A [CHAPTER] archetype must have its Chapter.
    const subs = c["sub-factions"].filter((s) => stats.keywords.includes(s.keyword));
    // The Red Scorpions have no catalogue record and, by GM ruling, no Chapter Traits (kill-team.md ruling 13).
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
  for (const { stats } of loadPack("volkus").characters)
    for (const part of stats.archetype.split(" + ")) assert.ok(ledger.has(norm(part)), part);
});
