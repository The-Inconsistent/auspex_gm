// Writes the Wrath & Glory ruleset, and optionally its Threat pack, for InconsisTable:
// `bun packages/data/port/write.ts <ruleset file> [<pack file>]`; and, for its ledger builder, the ledger ruleset and
// the creation and wargear packs: `... [--ledger <file>] [--creation <file>] [--wargear <file>]` (with or without the
// ruleset file). Import the files through InconsisTable's /library. All are private content: keep them out of both
// repos.
import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { buildParams } from "./build-params.ts";
import { buildCreationPacks } from "./creation-packs.ts";
import { checksBuild, checksRecord, loadEngine, type Problem } from "./engine.ts";
import { buildPack } from "./pack.ts";
import { buildRuleset } from "./ruleset.ts";

const { values: flags, positionals } = parseArgs({
  allowPositionals: true,
  options: { ledger: { type: "string" }, creation: { type: "string" }, wargear: { type: "string" } },
});
const [out, packOut] = positionals;
const ledgerOut = flags.ledger;
const catalogueOut = { creation: flags.creation, wargear: flags.wargear };
if (!out && !ledgerOut && !catalogueOut.creation && !catalogueOut.wargear) {
  console.error(
    "usage: bun packages/data/port/write.ts [<ruleset file> [<pack file>]] [--ledger <file>] [--creation <file>] [--wargear <file>]",
  );
  process.exit(2);
}
const refuse = (problems: Problem[]) => {
  for (const p of problems) console.error(`${p.path}: ${p.message}`);
  process.exit(1);
};
const engine = await loadEngine();
if (engine === null) console.warn("InconsisTable is not checked out beside this repo: written without validating");

const ruleset = buildRuleset();
let compiled: ReturnType<NonNullable<typeof engine>["compileRuleset"]> | null = null;
if (engine !== null) {
  compiled = engine.compileRuleset(ruleset);
  if (!compiled.ok) refuse(compiled.problems);
}
if (out) {
  writeFileSync(out, `${JSON.stringify(ruleset, null, 2)}\n`);
  console.log(`${ruleset.id} ${ruleset.version} → ${out}`);
}

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

if (ledgerOut || catalogueOut.creation || catalogueOut.wargear) {
  const ledger = buildRuleset({ builder: "ledger" });
  let ledgerRuleset = null;
  if (engine !== null) {
    const c = engine.compileRuleset(ledger);
    if (!c.ok) refuse(c.problems);
    else ledgerRuleset = c.compiled.ruleset;
    if (!checksBuild(engine, ledger)) console.warn("this InconsisTable checkout does not check the build block yet");
  }
  if (ledgerOut) {
    writeFileSync(ledgerOut, `${JSON.stringify(ledger, null, 2)}\n`);
    console.log(`${ledger.id} ${ledger.version} (ledger) → ${ledgerOut}`);
  }
  if (catalogueOut.creation || catalogueOut.wargear) {
    if (!engine?.BuildParams || !engine.buildSchemas) {
      console.error("the packs are built with InconsisTable's ledger builder: check out a version that has it");
      process.exit(1);
    }
    const packs = buildCreationPacks(engine.buildSchemas(engine.BuildParams.parse(buildParams())));
    for (const kind of ["creation", "wargear"] as const) {
      const file = catalogueOut[kind];
      if (!file) continue;
      const pack = packs[kind];
      if (ledgerRuleset !== null) {
        const result = engine.validatePack({ input: pack, ruleset: ledgerRuleset });
        for (const w of result.warnings) console.warn(`warning ${w.path}: ${w.message}`);
        if (!result.ok) refuse(result.problems);
        if (!checksRecord(engine, ledgerRuleset, pack))
          console.warn(`${pack.id}: this InconsisTable checkout does not check the entries' records yet`);
      }
      const json = `${JSON.stringify(pack)}\n`;
      writeFileSync(file, json);
      const types = pack.entries.reduce<Record<string, number>>(
        (n, e) => ({ ...n, [e.type]: (n[e.type] ?? 0) + 1 }),
        {},
      );
      console.log(`${pack.id} ${pack.version} → ${file}: ${Buffer.byteLength(json)} bytes, ${JSON.stringify(types)}`);
    }
  }
}
