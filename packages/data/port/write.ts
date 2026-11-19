// Writes the Wrath & Glory ruleset for InconsisTable: `bun packages/data/port/write.ts <file>`.
// Import the file through InconsisTable's /library. It is private content: keep it out of the InconsisTable repo.
import { writeFileSync } from "node:fs";
import { loadEngine } from "./engine.ts";
import { buildRuleset } from "./ruleset.ts";

const out = process.argv[2];
if (!out) {
  console.error("usage: bun packages/data/port/write.ts <file>");
  process.exit(2);
}
const ruleset = buildRuleset();
const engine = await loadEngine();
if (engine === null) console.warn("InconsisTable is not checked out beside this repo: written without validating");
else {
  const result = engine.compileRuleset(ruleset);
  if (!result.ok) {
    for (const p of result.problems) console.error(`${p.path}: ${p.message}`);
    process.exit(1);
  }
}
writeFileSync(out, `${JSON.stringify(ruleset, null, 2)}\n`);
console.log(`${ruleset.id} ${ruleset.version} → ${out}`);
