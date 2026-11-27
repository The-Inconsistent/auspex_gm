import assert from "node:assert/strict";
import { test } from "node:test";
import { SOURCES, type Source } from "@wg/shared";
import { creationCatalogue, wargearList } from "../index.ts";
import { TEXT_KEYS, TYPES, remapApproval } from "./build-catalogue.ts";
import { buildParams } from "./build-params.ts";
import { buildCreationPacks, entryKey, type CatalogueEntry } from "./creation-packs.ts";
import { checksBuild, checksPlay, checksRecord, loadEngine, type Compiled } from "./engine.ts";
import type { Pack } from "./pack.ts";
import { CATALOGUE_KINDS, buildRuleset, withoutBuildReaders } from "./ruleset.ts";

// The creation and wargear packs and the ledger ruleset (InconsisTable's ADR 0011, stage 2). The packs are built from
// the builder's own schemas, so everything but the ruleset's shape is skipped when InconsisTable is not checked out
// beside this repo, or its checkout has no ledger builder.
const engine = await loadEngine();
const skip =
  engine === null
    ? "InconsisTable is not checked out beside this repo"
    : !engine.BuildParams || !engine.buildSchemas
      ? "this InconsisTable checkout has no ledger builder"
      : false;
const built = skip ? null : buildCreationPacks(engine!.buildSchemas!(engine!.BuildParams!.parse(buildParams())));
const packs = () => [built!.creation, built!.wargear];
const ledger = buildRuleset({ builder: "ledger" }) as Extract<ReturnType<typeof buildRuleset>, { build: unknown }>;

// The builder's schema of each entity type.
const SCHEMA_OF: Record<string, string> = {
  ...Object.fromEntries(
    Object.entries(TYPES).map(([kind, schema]) => [CATALOGUE_KINDS[kind as keyof typeof TYPES], schema]),
  ),
  wargear: "Wargear",
};
const KIND_OF = Object.fromEntries(Object.entries(CATALOGUE_KINDS).map(([k, t]) => [t, k])) as Record<
  string,
  keyof typeof TYPES
>;
const MAX_PACK_BYTES = 5 * 1024 * 1024;
const MAX_ENTRIES = 5000;
const MAX_RECORD_BYTES = 32 * 1024;
const MAX_BODY_BYTES = 16 * 1024;
const bytes = (x: unknown) => Buffer.byteLength(JSON.stringify(x));

test("every record parses with its kind's schema, matches its entry, and fits the limits", { skip }, () => {
  const schemas = engine!.buildSchemas!(engine!.BuildParams!.parse(buildParams()));
  for (const pack of packs()) {
    const size = bytes(pack);
    assert.ok(size <= MAX_PACK_BYTES, `${pack.id}: ${size} bytes`);
    assert.ok(pack.entries.length <= MAX_ENTRIES, `${pack.id}: ${pack.entries.length} entries`);
    assert.equal(new Set(pack.entries.map((e) => e.key)).size, pack.entries.length, `${pack.id}: keys are unique`);
    const byType: Record<string, number> = {};
    let largest = { at: "", bytes: 0 };
    for (const e of pack.entries) {
      const at = `${pack.id}/${e.key}`;
      byType[e.type] = (byType[e.type] ?? 0) + 1;
      const parsed = schemas[SCHEMA_OF[e.type]!]!.safeParse(e.record);
      assert.ok(parsed.success, `${at}: the builder's ${SCHEMA_OF[e.type]} refuses its record`);
      // A creation key carries its type: record ids repeat across kinds (creation-packs.ts, `entryKey`).
      assert.equal(e.key, e.type === "wargear" ? e.record.id : entryKey(KIND_OF[e.type]!, e.record.id as string), at);
      assert.equal(e.record.name, e.name, at);
      assert.equal(e.cite, `${SOURCES[e.record.source as Source].cite} p.${e.record.page as number}`, at);
      // A wargear entry's kind is its item kind (ruleset.ts, ITEM_KINDS); Matched Pair is the GM's to fit.
      const kind =
        e.type === "wargear"
          ? [e.record.kind, ...((e.record.upgrade as { gmOnly?: boolean } | undefined)?.gmOnly ? ["pair"] : [])]
          : [];
      assert.deepEqual(e.tags, [
        ...(SOURCES[e.record.source as Source].official ? [e.record.source] : [e.record.source, "homebrew"]),
        ...kind,
      ]);
      assert.ok(!("summary" in e.record), `${at}: no summary is written`);
      const size = bytes(e.record);
      assert.ok(size <= MAX_RECORD_BYTES, `${at}: its record is ${size} bytes`);
      assert.ok(bytes(e.body) <= MAX_BODY_BYTES, `${at}: its body is over ${MAX_BODY_BYTES} bytes`);
      if (size > largest.bytes) largest = { at: `${e.type}/${e.record.id as string}`, bytes: size };
    }
    console.log(JSON.stringify({ pack: pack.id, bytes: size, entries: pack.entries.length, byType, largest }));
  }
  // Why a creation key carries its type.
  const kindsOf = new Map<string, Set<string>>();
  for (const e of built!.creation.entries)
    kindsOf.set(e.record.id as string, (kindsOf.get(e.record.id as string) ?? new Set()).add(e.type));
  console.log(
    `record ids shared by more than one creation kind: ${[...kindsOf.values()].filter((k) => k.size > 1).length}`,
  );
});

test("every GM approval moves to the packs' ids and back, and no two requirements share an id", { skip }, () => {
  const { reworded, phrases, converted } = built!.port;
  console.log(JSON.stringify({ converted, reworded: reworded.length }));
  const ids = new Map<string, string>();
  for (const r of reworded) {
    if (r.port.startsWith("gm-")) assert.match(r.port, /^gm-[0-9a-f]{12}$/, r.where);
    assert.ok((ids.get(r.port) ?? r.auspex) === r.auspex, `${r.where}: two requirements share ${r.port}`);
    ids.set(r.port, r.auspex);
    const path = `talent/x/requires/${r.auspex}`.slice(0, 200);
    const there = remapApproval(path, reworded, "auspex", "port");
    assert.notEqual(there, path, r.where);
    assert.equal(remapApproval(there, reworded, "port", "auspex"), path, r.where);
  }
  // Every plain `gm` requirement is reworded: in a pack its id never is this repo's segment.
  assert.equal(reworded.filter((r) => r.port.startsWith("gm-")).length > 0, true);
  // Phrases tell apart the strings of one record.
  const seen = new Set<string>();
  for (const p of phrases) {
    assert.ok(!seen.has(`${p.where} ${p.phrase}`), `${p.where}: ${p.phrase} twice`);
    seen.add(`${p.where} ${p.phrase}`);
  }
});

// ── the leak test ──
//
// Every string the port drops or neutralises, from the whole source catalogue (the twelve kinds, Patrons, Frameworks,
// the flavour tables and the wargear): anything under a `TEXT_KEYS` field (rule and record text, effects, potency,
// notes, background row text, objectives, a `gm` requirement's text; not an archetype's suggested build, which holds
// ids and ratings), and every `story`, `when`,
// `plus`, `condition` and `upgrade` string, and a weapon mod's `gm.what`. No string value anywhere in either pack
// (entry fields, body, record, at any depth) may equal one, contain one of two words or more, or share a run of more
// than 40 characters with one, after lower-casing and collapsing white space. Names are exempt by field (`NAME_FIELDS`),
// whatever they hold.
//
// What it cannot catch: a dropped string of one word inside a longer pack string (only equality is checked for one);
// printed wording that this repo never put in one of those fields (a long name, a power's `dn`,
// `activation`, `duration`, `range` or `multiTarget`, a wargear `category`, a weapon trait); wording inside a name
// field; a paraphrase, or wording reordered or re-spaced in more than white space; a run of 40 characters or fewer
// shared with dropped text, unless the whole dropped string is inside the pack's string; and text in the books that
// this repo never transcribed at all.
const NAME_FIELDS = new Set(["name", "options", "anyOf", "variant", "nameIncludes", "traits", "weaponTraits"]);
const normal = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
const RUN = 41;

function droppedStrings(): Map<string, string> {
  const out = new Map<string, string>();
  const add = (s: string, why: string) => {
    const n = normal(s);
    if (n) out.set(n, why);
  };
  const all = (x: unknown, why: string): void => {
    if (typeof x === "string") add(x, why);
    else if (Array.isArray(x)) x.forEach((y) => all(y, why));
    else if (x && typeof x === "object") Object.values(x).forEach((y) => all(y, why));
  };
  const walk = (x: unknown): void => {
    if (Array.isArray(x)) return x.forEach(walk);
    if (!x || typeof x !== "object") return;
    const o = x as Record<string, unknown>;
    for (const [k, v] of Object.entries(o)) {
      if (k === "suggested") continue; // ids and ratings, not wording
      if (TEXT_KEYS.has(k)) all(v, k);
      else if (["story", "when", "plus", "condition", "upgrade"].includes(k) && typeof v === "string") add(v, k);
      else if (k === "what" && o.kind === "gm" && typeof v === "string") add(v, "gm.what");
      else walk(v);
    }
  };
  walk(Object.values(creationCatalogue()));
  walk(wargearList());
  return out;
}

// Every string value of a pack that is not in a name field, with where it is.
function packStrings(pack: Pack<CatalogueEntry>): { at: string; value: string }[] {
  const out: { at: string; value: string }[] = [];
  const walk = (x: unknown, at: string, key: string): void => {
    if (typeof x === "string") {
      if (!NAME_FIELDS.has(key)) out.push({ at, value: x });
    } else if (Array.isArray(x)) x.forEach((y, i) => walk(y, `${at}[${i}]`, key));
    else if (x && typeof x === "object") for (const [k, v] of Object.entries(x)) walk(v, `${at}.${k}`, k);
  };
  walk(pack, pack.id, "");
  return out;
}

let droppedOnce: Map<string, string> | null = null;
// The leaks of the packs, each as where it is and what kind of dropped string it matches (never the text itself).
function leaksIn(list: Pack<CatalogueEntry>[]): { leaks: string[]; checked: number } {
  const dropped = (droppedOnce ??= droppedStrings());
  // Containment is looked for with dropped strings of two words or more: a single word (an upgrade's name, one) is
  // inside many ids and keywords without being wording.
  const lengths = [...new Set([...dropped.keys()].filter((d) => d.includes(" ")).map((d) => d.length))].sort(
    (a, b) => a - b,
  );
  const long = [...dropped.keys()].filter((d) => d.length >= RUN);
  const leaks: string[] = [];
  let checked = 0;
  for (const pack of list) {
    // The windows of RUN characters of every long pack string, to find a shared run.
    const windows = new Map<string, string>();
    for (const { at, value } of packStrings(pack)) {
      checked++;
      const n = normal(value);
      const hit = dropped.get(n);
      if (hit) {
        leaks.push(`${at}: equals a dropped ${hit}`);
        continue;
      }
      for (const len of lengths) {
        if (len >= n.length) break;
        for (let i = 0; i + len <= n.length; i++) {
          const inside = dropped.get(n.slice(i, i + len));
          if (inside) {
            leaks.push(`${at}: contains a dropped ${inside}`);
            i = n.length;
          }
        }
      }
      for (let i = 0; i + RUN <= n.length; i++) windows.set(n.slice(i, i + RUN), at);
    }
    if (windows.size)
      for (const d of long)
        for (let i = 0; i + RUN <= d.length; i++) {
          const at = windows.get(d.slice(i, i + RUN));
          if (at) {
            leaks.push(`${at}: shares more than 40 characters with a dropped ${dropped.get(d)}`);
            break;
          }
        }
  }
  return { leaks, checked };
}

test("no string in either pack carries wording the port drops", { skip }, () => {
  const { leaks, checked } = leaksIn(packs());
  console.log(JSON.stringify({ dropped: droppedOnce!.size, checked, leaks: leaks.length }));
  assert.deepEqual(leaks.slice(0, 30), []);
});

test("the leak test finds wording planted in a pack", { skip }, () => {
  const dropped = [...(droppedOnce ??= droppedStrings()).keys()];
  const long = dropped.find((d) => d.length > 60)!;
  const words = dropped.find((d) => d.includes(" ") && d.length < 30)!;
  const plant = (f: (r: Record<string, unknown>) => void) => {
    const pack = structuredClone(built!.wargear);
    f(pack.entries[0]!.record);
    return leaksIn([pack]).leaks.length;
  };
  assert.equal(
    plant(() => {}),
    0,
  );
  assert.ok(plant((r) => (r.category = words.toUpperCase())) > 0, "equal");
  assert.ok(plant((r) => (r.keywords = [`x ${words} y`])) > 0, "contained");
  assert.ok(plant((r) => (r.category = `x ${long.slice(5, 47)} y`)) > 0, "a run of 42");
  assert.equal(
    plant((r) => (r.category = `x ${long.slice(5, 45)} y`)),
    0,
    "a run of 40 is let through",
  );
});

// ── the ruleset ──

test("the default ruleset is the by-hand one, unchanged", () => {
  const plain = buildRuleset();
  assert.equal(plain.version, "0.1.20");
  assert.ok(!("build" in plain));
  assert.ok(plain.creation.length > 0);
  assert.deepEqual(
    plain.entities.map((e) => e.id),
    [
      "agent",
      "threat",
      "weapon",
      "mutation",
      "hazard",
      "place",
      "framework",
      "patron",
      "combatAction",
      "npcPreset",
      "factionPreset",
      "quickNpc",
      "sceneEvent",
    ],
  );
});

// What InconsisTable's validator of the `build` block will check (decided with it, not yet on its `main`), here.
test("the ledger ruleset's build block meets the rules the platform checks", () => {
  const { build, entities, creation, campaignFields } = ledger;
  const params = buildParams();
  assert.equal(ledger.version, "0.2.21");
  assert.equal(build.libraryLine, "archetypes");
  assert.equal(build.strategy, "ledger");
  const agent = entities.find((e) => e.id === build.actor)!;
  assert.equal(agent.base, "actor");
  assert.deepEqual(
    (creation as { actor: string }[]).filter((s) => s.actor === build.actor),
    [],
    "an actor the ledger builder builds takes no creation steps",
  );
  // Kinds: the builder's `Creation` keys and `wargear`, each its own non-actor entity type.
  assert.deepEqual(Object.keys(build.kinds), [...Object.keys(TYPES), "wargear"]);
  const kinds = Object.values(build.kinds);
  assert.equal(new Set(kinds).size, kinds.length);
  for (const id of kinds) assert.notEqual(entities.find((e) => e.id === id)?.base ?? "actor", "actor", id);
  // The sheet: one field per Attribute, Skill and mod of the vocabulary, of the right type, and no field twice.
  const fields = agent.fields as Record<string, { type: string }>;
  const { sheet } = build;
  const want = (map: Record<string, string>, keys: string[]) =>
    assert.deepEqual(Object.keys(map).sort(), [...keys].sort());
  want(
    sheet.attributes,
    params.vocabulary.attributes.map((a) => a.id),
  );
  want(
    sheet.skills,
    params.vocabulary.skills.map((s) => s.name),
  );
  want(
    sheet.mods,
    params.vocabulary.mods.map((m) => m.key),
  );
  const ints = [
    ...Object.values(sheet.attributes),
    ...Object.values(sheet.skills),
    ...Object.values(sheet.mods),
    sheet.armourRating,
    sheet.powered,
    sheet.speed,
  ];
  const all = [...ints, sheet.species, sheet.archetype, sheet.keywords];
  assert.equal(new Set(all).size, all.length, "no field twice");
  for (const f of ints) assert.equal(fields[f]?.type, "int", f);
  assert.equal(fields[sheet.species]?.type, "text");
  assert.equal(fields[sheet.archetype]?.type, "text");
  assert.equal(fields[sheet.keywords]?.type, "list");
  assert.equal(fields[build.xp]?.type, "int");
  for (const r of [sheet.wealth, sheet.corruption])
    assert.ok(
      ledger.resources.some((x) => x.id === r),
      r,
    );
  const tier = campaignFields[build.tier as keyof typeof campaignFields];
  assert.equal(tier.type, "int");
  assert.ok(tier.min >= params.tiers.min && tier.max <= params.tiers.max);
  assert.ok(build.cite);
});

test("the ledger ruleset compiles, and both packs pass validatePack against it", { skip }, () => {
  const compiled = engine!.compileRuleset(ledger);
  if (!compiled.ok) assert.fail(compiled.problems.map((p) => `${p.path}: ${p.message}`).join("\n"));
  for (const pack of packs()) {
    const result = engine!.validatePack({ input: pack, ruleset: compiled.compiled.ruleset });
    if (!result.ok) assert.fail(result.problems.map((p) => `${p.path}: ${p.message}`).join("\n"));
    assert.deepEqual(result.warnings, []);
  }
});

// Only where the engine reads the `build` block and the entries' `record`s; an older checkout strips both unread, so
// the test above passes there without checking them.
const compiledLedger = (): Compiled["ruleset"] | null => {
  const c = engine?.compileRuleset(ledger);
  return c?.ok ? c.compiled.ruleset : null;
};
const checked =
  skip ||
  // What reads the saved build (cards, folds, ledger strikes) goes with it in the probe.
  (!checksBuild(engine!, withoutBuildReaders(ledger))
    ? "this InconsisTable checkout does not check a ruleset's build block yet"
    : !checksRecord(engine!, compiledLedger()!, built!.wargear)
      ? "this InconsisTable checkout does not check a pack entry's record yet"
      : false);
test("InconsisTable's validator accepts the build block and every record", { skip: checked }, () => {
  const ruleset = compiledLedger();
  assert.ok(ruleset, "the ledger ruleset compiles");
  for (const pack of packs()) {
    const result = engine!.validatePack({ input: pack, ruleset });
    if (!result.ok) assert.fail(result.problems.map((p) => `${p.path}: ${p.message}`).join("\n"));
  }
});

// The play keys are optional, so a validator that does not know them accepts the ledger ruleset like any other (the
// test above); only one that reads them refuses a broken one.
const playChecked =
  checked ||
  (!checksPlay(engine!, ledger) ? "this InconsisTable checkout does not check the build block's play keys yet" : false);
test("InconsisTable's validator checks the ascension, gone and award keys", { skip: playChecked }, () => {
  const refused = (build: object) => !engine!.compileRuleset({ ...ledger, build: { ...ledger.build, ...build } }).ok;
  assert.ok(!refused({}));
  assert.ok(refused({ ascension: { ...ledger.build.ascension, xp: 0 } }), "ascension.xp is at least 1");
  assert.ok(refused({ gone: [...ledger.build.gone, "nobody"] }), "gone names health states");
  assert.ok(refused({ award: { ...ledger.build.award, suggested: [...ledger.build.award.suggested].reverse() } }));
});
