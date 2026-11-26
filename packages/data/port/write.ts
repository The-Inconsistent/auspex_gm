// Writes the Wrath & Glory ruleset, and optionally its Threat pack, for InconsisTable:
// `bun packages/data/port/write.ts <ruleset file> [<pack file>]`; and, for its ledger builder, the ledger ruleset and
// the creation and wargear packs: `... [--ledger <file>] [--creation <file>] [--wargear <file>]` (with or without the
// ruleset file), and the homebrew books' pack (`--homebrew <file>`); and the World, this app's look: `... [--world <file>]`. Import the files through InconsisTable's
// /library; the Mutation and codex packs (`--mutations <file>`, `--codex <file>`); and a campaign export of this app as a room document (`--room <export file> <room file>`, room.ts), which
// InconsisTable's IMPORT A ROOM takes. All are private content: keep them out of both repos (`port-out/` is ignored).
import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { buildParams } from "./build-params.ts";
import { buildCreationPacks } from "./creation-packs.ts";
import {
  checksBuild,
  checksCodex,
  checksPlay,
  checksRecord,
  loadCoreSchema,
  loadEngine,
  type Problem,
} from "./engine.ts";
import { CampaignExport } from "@wg/shared";
import { buildCodexPack } from "./codex-packs.ts";
import { buildMutationPack } from "./mutations.ts";
import { buildCustomThreatPack, buildPack, type LeftOut, type Pack } from "./pack.ts";
import { buildRoomDocument, Refusal } from "./room.ts";
import { buildRuleset, withoutBuildReaders } from "./ruleset.ts";
import { buildWorld } from "./world.ts";

// `--custom-threats` and `--room` take two values, which parseArgs cannot say: taken out first.
const args = process.argv.slice(2);
const pair = (flag: string) => {
  const at = args.indexOf(flag);
  return at === -1 ? undefined : args.splice(at, 3).slice(1);
};
const custom = pair("--custom-threats");
const room = pair("--room");
const { values: flags, positionals } = parseArgs({
  args,
  allowPositionals: true,
  options: {
    ledger: { type: "string" },
    creation: { type: "string" },
    wargear: { type: "string" },
    homebrew: { type: "string" },
    world: { type: "string" },
    mutations: { type: "string" },
    codex: { type: "string" },
  },
});
const [out, packOut] = positionals;
const ledgerOut = flags.ledger;
const catalogueOut = { creation: flags.creation, wargear: flags.wargear, homebrew: flags.homebrew };
if (
  (!out &&
    !ledgerOut &&
    !catalogueOut.creation &&
    !catalogueOut.wargear &&
    !catalogueOut.homebrew &&
    !flags.world &&
    !flags.mutations &&
    !flags.codex &&
    !custom &&
    !room) ||
  (custom && custom.length !== 2) ||
  (room && room.length !== 2)
) {
  console.error(
    "usage: bun packages/data/port/write.ts [<ruleset file> [<pack file>]] [--ledger <file>] [--creation <file>] [--wargear <file>] [--homebrew <file>] [--world <file>] [--mutations <file>] [--codex <file>] [--custom-threats <export file> <pack file>] [--room <export file> <room file>]",
  );
  process.exit(2);
}
const refuse = (problems: Problem[]) => {
  for (const p of problems) console.error(`${p.path}: ${p.message}`);
  process.exit(1);
};
const engine = await loadEngine();
// The size the platform caps a manifest at (its MAX_MANIFEST_BYTES, 512 KiB), measured as it measures it: compact JSON.
const manifestBytes = (r: unknown) => `${Buffer.byteLength(JSON.stringify(r))} bytes of ${512 * 1024}`;
if (engine === null) console.warn("InconsisTable is not checked out beside this repo: written without validating");

const ruleset = buildRuleset();
let compiled: ReturnType<NonNullable<typeof engine>["compileRuleset"]> | null = null;
if (engine !== null) {
  compiled = engine.compileRuleset(ruleset);
  if (!compiled.ok) refuse(compiled.problems);
  else if (!checksCodex(engine, ruleset))
    console.warn("this InconsisTable checkout does not check the codex block yet");
}
if (out) {
  writeFileSync(out, `${JSON.stringify(ruleset, null, 2)}\n`);
  console.log(`${ruleset.id} ${ruleset.version} → ${out}: ${manifestBytes(ruleset)}`);
}

// A Threat pack, validated against the by-hand ruleset, written, and counted.
function writeThreatPack(
  file: string,
  { pack, leftOut, normalised }: { pack: Pack; leftOut: LeftOut[]; normalised: Record<string, number> },
) {
  if (engine !== null && compiled?.ok) {
    const result = engine.validatePack({ input: pack, ruleset: compiled.compiled.ruleset });
    for (const w of result.warnings) console.warn(`warning ${w.path}: ${w.message}`);
    if (!result.ok) refuse(result.problems);
  } else console.warn("the pack was not validated");
  writeFileSync(file, `${JSON.stringify(pack)}\n`);
  const types = pack.entries.reduce<Record<string, number>>((n, e) => ({ ...n, [e.type]: (n[e.type] ?? 0) + 1 }), {});
  console.log(`${pack.id} ${pack.version} → ${file}: ${JSON.stringify(types)}`);
  for (const [from, uses] of Object.entries(normalised)) console.log(`normalised Skill name ${from}: ${uses}`);
  const groups = new Map<string, string[]>();
  for (const { reason, id } of leftOut) groups.set(reason, [...(groups.get(reason) ?? []), id]);
  for (const [reason, ids] of [...groups].sort())
    console.log(`left out, ${reason}: ${ids.length} (e.g. ${[...new Set(ids)].slice(0, 5).join(", ")})`);
}
if (packOut) writeThreatPack(packOut, buildPack());
if (custom) {
  const [exportFile, file] = custom as [string, string];
  const exported = CampaignExport.safeParse(JSON.parse(readFileSync(exportFile, "utf8")));
  if (!exported.success)
    refuse(exported.error.issues.map((i) => ({ path: i.path.map(String).join("."), message: i.message })));
  else {
    if (exported.data.codex.customThreats.length === 0) console.warn(`${exportFile} has no custom Threats`);
    writeThreatPack(file, buildCustomThreatPack(exported.data));
  }
}

if (ledgerOut || catalogueOut.creation || catalogueOut.wargear) {
  const ledger = buildRuleset({ builder: "ledger" });
  let ledgerRuleset = null;
  if (engine !== null) {
    const c = engine.compileRuleset(ledger);
    if (!c.ok) refuse(c.problems);
    else ledgerRuleset = c.compiled.ruleset;
    // What reads the saved build (cards, folds, ledger strikes) goes with it in the probe.
    if (!checksBuild(engine, withoutBuildReaders(ledger)))
      console.warn("this InconsisTable checkout does not check the build block yet");
    else if (!checksPlay(engine, ledger))
      console.warn("this InconsisTable checkout does not check the build block's ascension, gone and award keys yet");
  }
  if (ledgerOut) {
    writeFileSync(ledgerOut, `${JSON.stringify(ledger, null, 2)}\n`);
    console.log(`${ledger.id} ${ledger.version} (ledger) → ${ledgerOut}: ${manifestBytes(ledger)}`);
  }
  if (catalogueOut.creation || catalogueOut.wargear || catalogueOut.homebrew) {
    if (!engine?.BuildParams || !engine.buildSchemas) {
      console.error("the packs are built with InconsisTable's ledger builder: check out a version that has it");
      process.exit(1);
    }
    const packs = buildCreationPacks(engine.buildSchemas(engine.BuildParams.parse(buildParams())));
    for (const kind of ["creation", "wargear", "homebrew"] as const) {
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

// The Mutation and codex packs, validated against both rulesets, which both read them (#325).
for (const [file, pack] of [
  [flags.mutations, flags.mutations ? buildMutationPack() : null],
  [flags.codex, flags.codex ? buildCodexPack() : null],
] as const) {
  if (!file || !pack) continue;
  if (engine !== null)
    for (const r of [buildRuleset(), buildRuleset({ builder: "ledger" })]) {
      const c = engine.compileRuleset(r);
      if (!c.ok) refuse(c.problems);
      else {
        const result = engine.validatePack({ input: pack, ruleset: c.compiled.ruleset });
        for (const w of result.warnings) console.warn(`warning ${w.path}: ${w.message}`);
        if (!result.ok) refuse(result.problems);
      }
    }
  else console.warn(`${pack.id} was not validated`);
  const json = `${JSON.stringify(pack)}\n`;
  writeFileSync(file, json);
  const types = (pack.entries as { type: string }[]).reduce<Record<string, number>>(
    (n, e) => ({ ...n, [e.type]: (n[e.type] ?? 0) + 1 }),
    {},
  );
  console.log(`${pack.id} ${pack.version} → ${file}: ${Buffer.byteLength(json)} bytes, ${JSON.stringify(types)}`);
}

if (flags.world) {
  const world = buildWorld();
  if (engine?.World) {
    const parsed = engine.World.safeParse(world);
    if (!parsed.success)
      refuse(parsed.error.issues.map((i) => ({ path: i.path.map(String).join("."), message: i.message })));
    if (engine.validateWorld) {
      const result = engine.validateWorld(world);
      if (!result.ok) refuse(result.problems);
    } else console.warn("this InconsisTable checkout has no World validator yet: checked against the contract only");
  } else console.warn("this InconsisTable checkout has no World contract: the World was not validated");
  writeFileSync(flags.world, `${JSON.stringify(world, null, 2)}\n`);
  console.log(`${world.id} ${world.version} (World) → ${flags.world}`);
}

if (room) {
  const [exportFile, file] = room as [string, string];
  const exported = CampaignExport.safeParse(JSON.parse(readFileSync(exportFile, "utf8")));
  if (!exported.success)
    refuse(exported.error.issues.map((i) => ({ path: i.path.map(String).join("."), message: i.message })));
  const core = await loadCoreSchema();
  if (!engine?.BuildParams || !engine.buildSchemas || !core?.RoomDocument) {
    console.error("the room document is checked with InconsisTable's: check out a version that has it");
    process.exit(1);
  }
  // A build's GM approvals move with the creation pack's wording (room.ts).
  const { reworded } = buildCreationPacks(engine.buildSchemas(engine.BuildParams.parse(buildParams()))).port;
  let made;
  try {
    made = buildRoomDocument(exported.data!, { reworded });
  } catch (e) {
    if (!(e instanceof Refusal)) throw e;
    refuse([{ path: e.path, message: e.message }]);
  }
  const { document, report } = made!;
  const parsed = core.RoomDocument.safeParse(document);
  if (!parsed.success)
    refuse(parsed.error.issues.map((i) => ({ path: i.path.map(String).join("."), message: i.message })));
  writeFileSync(file, `${JSON.stringify(document)}\n`);
  const count = (xs: string[]) =>
    JSON.stringify(xs.reduce<Record<string, number>>((n, x) => ({ ...n, [x]: (n[x] ?? 0) + 1 }), {}));
  console.log(`${document.room.name} → ${file}`);
  console.log(`actors: ${document.actors.length}, entries: ${count(document.codex.map((e) => e.kind))}`);
  const lines = document.codex.flatMap((e) => Object.entries(e.prep ?? {}).flatMap(([k, l]) => l.map(() => k)));
  console.log(
    `prepared lines: ${count(lines)}, sessions: ${document.sessions.length}, pictures: ${document.images.length}`,
  );
  const groups = new Map<string, number>();
  for (const n of report) groups.set(`${n.to}, ${n.reason}`, (groups.get(`${n.to}, ${n.reason}`) ?? 0) + 1);
  for (const [reason, n] of [...groups].sort()) console.log(`${reason}: ${n}`);
}
