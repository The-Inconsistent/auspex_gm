// Writes the Wrath & Glory ruleset, and optionally its Threat pack, for InconsisTable:
// `bun packages/data/port/write.ts <ruleset file> [<pack file>]`. Import the files through InconsisTable's /library.
// Both are private content: keep them out of both repos.
import { writeFileSync } from "node:fs";
import { loadEngine } from "./engine.ts";
import { buildPack } from "./pack.ts";
import { buildRuleset } from "./ruleset.ts";

const [out, packOut] = process.argv.slice(2);
if (!out) {
  console.error("usage: bun packages/data/port/write.ts <ruleset file> [<pack file>]");
  process.exit(2);
}
const ruleset = buildRuleset();
const engine = await loadEngine();
let compiled: ReturnType<NonNullable<typeof engine>["compileRuleset"]> | null = null;
if (engine === null) console.warn("InconsisTable is not checked out beside this repo: written without validating");
else {
  compiled = engine.compileRuleset(ruleset);
  if (!compiled.ok) {
    for (const p of compiled.problems) console.error(`${p.path}: ${p.message}`);
    process.exit(1);
  }
}
writeFileSync(out, `${JSON.stringify(ruleset, null, 2)}\n`);
console.log(`${ruleset.id} ${ruleset.version} → ${out}`);

if (packOut) {
  const { pack, leftOut, normalised } = buildPack();
  if (engine !== null && compiled?.ok) {
    const result = engine.validatePack({ input: pack, ruleset: compiled.compiled.ruleset });
    for (const w of result.warnings) console.warn(`warning ${w.path}: ${w.message}`);
    if (!result.ok) {
      for (const p of result.problems) console.error(`${p.path}: ${p.message}`);
      process.exit(1);
    }
  } else console.warn("the pack was not validated");
  writeFileSync(packOut, `${JSON.stringify(pack)}\n`);
  const types = pack.entries.reduce<Record<string, number>>((n, e) => ({ ...n, [e.type]: (n[e.type] ?? 0) + 1 }), {});
  console.log(`${pack.id} ${pack.version} → ${packOut}: ${JSON.stringify(types)}`);
  for (const [from, uses] of Object.entries(normalised)) console.log(`normalised Skill name ${from}: ${uses}`);
  const groups = new Map<string, string[]>();
  for (const { reason, id } of leftOut) groups.set(reason, [...(groups.get(reason) ?? []), id]);
  for (const [reason, ids] of [...groups].sort())
    console.log(`left out, ${reason}: ${ids.length} (e.g. ${[...new Set(ids)].slice(0, 5).join(", ")})`);
}
