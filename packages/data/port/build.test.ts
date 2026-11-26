import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import {
  SOURCES,
  ATTRIBUTES,
  BACKGROUND_ROWS,
  MAX_BOUGHT_WEALTH,
  Mods,
  SKILLS,
  resolveBuild,
  wargearMatches,
  type CharacterBuildInput,
  type ResolvedBuild,
  type Skill,
} from "@wg/shared";
import { creationCatalogue, wargear } from "../index.ts";
import { PHRASE, PHRASE_KIND, buildCatalogue, remapApproval, type PortCatalogue } from "./build-catalogue.ts";
import { buildParams } from "./build-params.ts";
import { buildCreationPacks, catalogueOf } from "./creation-packs.ts";
import { loadEngine } from "./engine.ts";

// The acceptance test of InconsisTable's ledger builder (its ADR 0011, decision 4): on this repo's real catalogue, the
// port resolves every build to what this repo's own `resolveBuild` gives, up to what the port changed on purpose
// (`normalise`). Each test runs on two catalogues: `parity`, the conversion in memory, and `pack`, the records read back
// from the creation and wargear packs (creation-packs.ts), which carry no printed wording, with every GM approval moved
// to the packs' ids through `remapApproval`. Skipped when InconsisTable is not checked out beside this repo, or its
// checkout has no ledger builder.
const engine = await loadEngine();
const skip =
  engine === null
    ? "InconsisTable is not checked out beside this repo"
    : !engine.resolveBuild || !engine.BuildParams || !engine.buildSchemas
      ? "this InconsisTable checkout has no ledger builder"
      : false;

const creation = creationCatalogue();
const setup = skip
  ? null
  : (() => {
      const params = engine!.BuildParams!.parse(buildParams());
      const schemas = engine!.buildSchemas!(params);
      const packs = buildCreationPacks(schemas);
      // As an import reads them: the packs as JSON, then their records by entity type.
      // A pack keeps no file order (the platform serves entries by slug and key): each kind is put back in the
      // catalogue's order, which the builder's lists follow.
      const read = (p: unknown[]) => {
        const c = catalogueOf(JSON.parse(JSON.stringify(p)) as never);
        for (const [kind, list] of Object.entries(c.creation)) {
          const at = new Map(packs.port.creation[kind as keyof typeof c.creation].map((r, i) => [r.id, i]));
          list.sort((a, b) => at.get(a.id as string)! - at.get(b.id as string)!);
        }
        return c;
      };
      // A room that allows no homebrew attaches the official packs only (#325, rules-flow §11.198).
      return {
        params,
        parity: buildCatalogue(schemas),
        pack: { ...packs.port, ...read([packs.creation, packs.wargear, packs.homebrew]) },
        official: { ...packs.port, ...read([packs.creation, packs.wargear]) },
      };
    })();
type Mode = "parity" | "pack" | "official";

type Play = { tier: number; xpEarned: number; packageWaived?: boolean };
type Run = { build: CharacterBuildInput; homebrew: boolean; play?: Play };
type Outcome = { ok: true; r: unknown } | { ok: false; threw: string };
const attempt = (f: () => unknown): Outcome => {
  try {
    return { ok: true, r: f() };
  } catch (e) {
    return { ok: false, threw: e instanceof Error ? e.message : String(e) };
  }
};
const auspex = ({ build, homebrew, play }: Run) =>
  resolveBuild({ catalogue: { creation, wargear, homebrew }, build, play });

// ── what the port changed on purpose ──

const catalogue = (mode: Mode): PortCatalogue => setup![mode];

// The build the port is given: the same, with each GM approval of a reworded requirement at the port's own path.
const forPort = (build: CharacterBuildInput, mode: Mode): CharacterBuildInput => {
  const approved = build.gm?.approved;
  if (!approved?.length) return build;
  const { reworded } = catalogue(mode);
  return { ...build, gm: { ...build.gm, approved: approved.map((p) => remapApproval(p, reworded, "auspex", "port")) } };
};
const port = ({ build, homebrew, play }: Run, mode: Mode) => {
  return engine!.resolveBuild!({
    params: setup!.params,
    catalogue: { creation: catalogue(mode).creation, wargear: catalogue(mode).wargear, homebrew },
    build: forPort(build, mode),
    play,
  });
};

// The pack's phrases are numbered within their record, so one can't be put back by its number: a string of this repo
// is equal to the port's when it is the port's with each phrase standing for one of the originals of its kind (the
// same phrase for the same one). Built lazily: the originals of each kind, and a matcher per port string.
const originalsOf = new Map<string, Set<string>>();
function samePhrased(auspex: string, port: string): boolean {
  const parts = port.split(PHRASE); // text, words, number, text, words, number, …, text
  if (parts.length === 1) return false;
  if (!originalsOf.size)
    for (const p of setup!.pack.phrases)
      originalsOf.set(p.kind, (originalsOf.get(p.kind) ?? new Set()).add(p.original));
  const escape = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  let source = `^${escape(parts[0]!)}`;
  for (let i = 1; i < parts.length; i += 3) source += `([\\s\\S]+?)${escape(parts[i + 2]!)}`;
  const m = new RegExp(`${source}$`).exec(auspex);
  if (!m) return false;
  const seen = new Map<string, string>();
  for (let i = 1, g = 1; i < parts.length; i += 3, g++) {
    const phrase = `${parts[i]} ‹${parts[i + 1]}›`;
    const original = m[g]!;
    if (!originalsOf.get(PHRASE_KIND[parts[i]!]!)?.has(original)) return false;
    if ((seen.get(phrase) ?? original) !== original) return false;
    seen.set(phrase, original);
  }
  return true;
}

const deepStrings = (x: unknown, f: (s: string) => string): unknown =>
  typeof x === "string"
    ? f(x)
    : Array.isArray(x)
      ? x.map((y) => deepStrings(y, f))
      : x && typeof x === "object"
        ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, deepStrings(v, f)]))
        : x;

type Json = Record<string, unknown>;
// Every difference the port made on purpose, and nothing else. Both sides go through it; JSON drops `undefined` keys.
// `fired` collects the rules that changed something, for the counts.
function normalise(o: Outcome, side: "auspex" | "port", fired: Set<string>, mode: Mode): unknown {
  // A throw on both sides is the same outcome: the message is zod's, worded by each side's own schema.
  if (!o.ok) return { threw: true };
  let r = JSON.parse(JSON.stringify(o.r)) as Json;
  if (side === "port") {
    // 1. The importer's words: the port holds a neutral phrase where this repo holds the record's own (a `gm`
    //    requirement's label, a `story` grant, a `when`, a price's `plus`, a filter's `condition` or `upgrade`). In
    //    parity mode each is put back by its number, so everything around it compares exactly; in pack mode
    //    `samePhrased` compares the strings that hold one.
    const { phrases, reworded } = catalogue(mode);
    if (mode === "parity")
      r = deepStrings(r, (s) =>
        s.replace(PHRASE, (_, _words: string, n: string) => (fired.add("phrase"), phrases[Number(n)]!.original)),
      ) as Json;
    // 2. A requirement serialised into an approval path with the port's `{ kind: "gm", id }` (in parity mode only
    //    inside an `all` or `either`; resolve.ts, deferred requirements): its segment is put back to this repo's.
    for (const p of r.problems as { path?: string }[]) {
      if (!p.path) continue;
      const path = remapApproval(p.path, reworded, "port", "auspex");
      if (path !== p.path) fired.add("compound gm path");
      p.path = path;
    }
  } else {
    // 3. Wording the port changed in its own sentences: the Advanced kit's effect keeps its cite in `cite` only, and the
    //    [ANY 2] problem names no species.
    const reword = (x: { what: string }, from: RegExp, to: string, rule: string) => {
      if (from.test(x.what)) fired.add(rule);
      x.what = x.what.replace(from, to);
    };
    for (const e of r.effects as { what: string }[])
      reword(e, /^(Common clothing and one trinket from the Trinkets Table) \(Core p\.247\)$/, "$1", "kit effect");
    for (const p of r.problems as { what: string }[])
      reword(p, /: a Human's two Keywords differ$/, ": the two Keywords differ", "[ANY 2] wording");
  }
  // 4. The removed text: this repo's sheet carries the book's text on each ability and Talent line and a power's
  //    potency; the port carries a `summary` the converted catalogue never fills. The one line both write themselves,
  //    the Background's rows and bonus, moved from `text` to `summary`, and is compared.
  const sheet = r.sheet as Json;
  const line = ({ text, summary, ...rest }: Json) => {
    if (rest.name === "Background") return { ...rest, rows: text ?? summary };
    if (text || summary) fired.add(`removed text (${side})`);
    return rest;
  };
  sheet.abilities = (sheet.abilities as Json[]).map(line);
  sheet.talents = (sheet.talents as Json[]).map(line);
  if (sheet.powers) sheet.powers = (sheet.powers as Json[]).map(({ potency: _, ...rest }) => line(rest));
  return r;
}

// The first place two values differ, as `path: auspex ≠ port`; null when they are equal. `same` may accept two
// strings that differ.
function firstDiff(a: unknown, b: unknown, same: (a: string, b: string) => boolean, at = ""): string | null {
  if (Object.is(a, b)) return null;
  if (typeof a === "string" && typeof b === "string" && same(a, b)) return null;
  const show = (x: unknown) => JSON.stringify(x)?.slice(0, 300);
  if (typeof a !== "object" || typeof b !== "object" || !a || !b || Array.isArray(a) !== Array.isArray(b))
    return `${at || "(root)"}: ${show(a)} ≠ ${show(b)}`;
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
  for (const k of keys) {
    const d = firstDiff((a as Json)[k], (b as Json)[k], same, Array.isArray(a) ? `${at}[${k}]` : `${at}.${k}`);
    if (d) return d;
  }
  if (!Array.isArray(a) && Object.keys(a).join() !== Object.keys(b).join())
    return `${at || "(root)"}: key order ${Object.keys(a).join()} ≠ ${Object.keys(b).join()}`;
  return null;
}

// Both sides on one build: the normalised outcomes and the first difference.
function compare(run: Run, mode: Mode) {
  const a = attempt(() => auspex(run));
  const p = attempt(() => port(run, mode));
  const fired = new Set<string>();
  const { reworded } = catalogue(mode);
  if (run.build.gm?.approved?.some((x) => remapApproval(x, reworded, "auspex", "port") !== x))
    fired.add(mode === "parity" ? "compound gm approval" : "gm approval");
  const same =
    mode !== "parity" ? (x: string, y: string) => samePhrased(x, y) && (fired.add("phrase"), true) : () => false;
  const diff = firstDiff(normalise(a, "auspex", fired, mode), normalise(p, "port", fired, mode), same);
  return { a, p, diff, rules: [...fired] };
}

// ── counting ──

// Which parts of `CharacterBuild` (and of the call) a build exercises.
function partsOf({ build: b, play, homebrew }: Run): string[] {
  const has = (x: unknown) =>
    Array.isArray(x) ? x.length > 0 : x && typeof x === "object" ? Object.keys(x).length > 0 : !!x;
  const fills = Object.values(b.fills ?? {});
  const adv = b.advancement ?? {};
  return Object.entries({
    archetype: b.archetypeId,
    advanced: b.advanced,
    "advanced.factionId": b.advanced?.factionId,
    "advanced.abilityOf": b.advanced?.abilityOf,
    "advanced.wargear": b.advanced?.wargear,
    speciesId: b.speciesId,
    budget: b.budget !== undefined,
    "fills.id": fills.some((f) => "id" in f),
    "fills.writeIn": fills.some((f) => "writeIn" in f),
    background: b.background,
    "background.bonus": b.background?.bonus,
    options: b.options,
    attributes: b.attributes,
    skills: b.skills,
    talents: b.talents,
    "talents.choice": b.talents?.some((t) => t.choice),
    powers: b.powers,
    packages: b.packages,
    "languages.picks": b.languages?.picks,
    "languages.bought": b.languages?.bought,
    wealth: b.wealth,
    choices: b.choices,
    "gm.approved": b.gm?.approved,
    "gm.keywords": b.gm?.keywords,
    "gm.species": b.gm?.species,
    "gm.gear.remove": b.gm?.gear?.remove,
    "gm.gear.add": b.gm?.gear?.add,
    "gm.mods": b.gm?.mods,
    "advancement.attributes": adv.attributes,
    "advancement.skills": adv.skills,
    "advancement.talents": adv.talents,
    "advancement.powers": adv.powers,
    "advancement.packages": adv.packages,
    "advancement.languages": adv.languages,
    "advancement.archetypeAscension": adv.archetypeAscension,
    "advancement.boughtIn": adv.boughtIn,
    play,
    "play.ascended": play && play.tier > b.tier,
    "play.packageWaived": play?.packageWaived,
    homebrew,
  })
    .filter(([, v]) => has(v))
    .map(([k]) => k);
}

// The counts a test ends with, and the parts it must have exercised at least once.
function tally(runs: { run: Run; a: Outcome; rules: string[] }[], must: string[]) {
  const parts = Object.fromEntries(must.map((k) => [k, 0]));
  let ready = 0;
  let problems = 0;
  let threw = 0;
  const normalised: Record<string, number> = {};
  for (const { run, a, rules } of runs) {
    for (const k of partsOf(run)) parts[k] = (parts[k] ?? 0) + 1;
    for (const k of rules) normalised[k] = (normalised[k] ?? 0) + 1;
    if (!a.ok) threw++;
    else if ((a.r as ResolvedBuild).problems.length) problems++;
    else if ((a.r as ResolvedBuild).pending.length === 0) ready++;
  }
  const counts = { builds: runs.length, ready, problems, threw, normalised, parts };
  console.log(JSON.stringify(counts));
  const zero = must.filter((k) => !parts[k]);
  assert.deepEqual(zero, [], `parts never exercised: ${zero.join(", ")}`);
  return counts;
}

// Each build that differs, with the first difference; grouped by where it differs, for the failure message.
function report(fails: { name: string; diff: string }[], total: number) {
  if (!fails.length) return;
  const groups = new Map<string, string[]>();
  for (const f of fails) {
    const where = f.diff.split(":")[0]!.replace(/\[\d+\]/g, "[]");
    groups.set(where, [...(groups.get(where) ?? []), f.name]);
  }
  assert.fail(
    `${fails.length} of ${total} builds differ\n` +
      [...groups].map(([where, names]) => `${names.length} at ${where}, first ${names[0]}`).join("\n") +
      `\n\nfirst differences:\n${fails
        .slice(0, 15)
        .map((f) => `${f.name}: ${f.diff}`)
        .join("\n")}`,
  );
}

// ── the pregens ──

const dir = new URL("../fixtures/pregens/", import.meta.url);
const PREGENS = readdirSync(dir)
  .filter((f) => f.endsWith(".json"))
  .sort()
  .map(
    (f) =>
      JSON.parse(readFileSync(new URL(f, dir), "utf8")) as {
        name: string;
        homebrew: boolean;
        build: CharacterBuildInput;
        ledger: number[];
      },
  );

// The tests' names in each mode.
const FROM: Record<Mode, string> = {
  parity: "",
  pack: " (from the packs' records)",
  official: " (from the official packs alone)",
};
const MODES = ["parity", "pack"] as const;

for (const mode of MODES)
  test(
    `the port rebuilds every pregen as this repo does: ready, the same ledger and the same sheet${FROM[mode]}`,
    { skip },
    () => {
      assert.equal(PREGENS.length, 11);
      const fails: { name: string; diff: string }[] = [];
      const runs = [];
      for (const g of PREGENS) {
        const run = { build: g.build, homebrew: g.homebrew };
        const { a, p, diff, rules } = compare(run, mode);
        assert.ok(p.ok, `${g.name}: the port throws: ${p.ok ? "" : p.threw}`);
        const r = p.r as ResolvedBuild;
        assert.deepEqual(r.pending, [], `${g.name}: nothing left to choose`);
        assert.deepEqual(
          r.problems.map((x) => x.what),
          [],
          `${g.name}: no problems`,
        );
        assert.equal(
          r.spent,
          g.ledger.reduce((n, x) => n + x, 0),
          `${g.name}: spent`,
        );
        if (diff) fails.push({ name: g.name, diff });
        runs.push({ run, a, rules });
      }
      report(fails, PREGENS.length);
      tally(runs, ["archetype", "packages", "fills.id", "fills.writeIn", "background", "talents", "gm.approved"]);
    },
  );

// ── every archetype ──

for (const mode of MODES)
  test(
    `every archetype resolves the same at its own Tier and at each higher Tier${FROM[mode]}`,
    { skip, timeout: 120_000 },
    () => {
      const fails: { name: string; diff: string }[] = [];
      const runs = [];
      for (const arch of creation.archetypes)
        for (let tier = arch.tier; tier <= 5; tier++)
          for (const homebrew of [false, true]) {
            const run = { build: { tier, archetypeId: arch.id }, homebrew };
            const { a, diff, rules } = compare(run, mode);
            if (diff) fails.push({ name: `${arch.id} at Tier ${tier}${homebrew ? ", homebrew" : ""}`, diff });
            runs.push({ run, a, rules });
          }
      report(fails, runs.length);
      tally(runs, ["archetype", "homebrew"]);
    },
  );

// A room that allows no homebrew attaches the creation and wargear packs alone (#325, rules-flow §11.198): every
// official archetype resolves as this repo does with homebrew off.
test(`every official archetype resolves the same without homebrew${FROM.official}`, { skip }, () => {
  const fails: { name: string; diff: string }[] = [];
  const official = creation.archetypes.filter((a) => SOURCES[a.source].official);
  let runs = 0;
  for (const arch of official)
    for (let tier = arch.tier; tier <= 5; tier++, runs++) {
      const { diff } = compare({ build: { tier, archetypeId: arch.id }, homebrew: false }, "official");
      if (diff) fails.push({ name: `${arch.id} at Tier ${tier}`, diff });
    }
  assert.ok(official.length > 0);
  report(fails, runs);
});

// ── generated builds ──

const BUILDS: Record<(typeof MODES)[number], number> = {
  parity: Number(process.env.PORT_BUILDS ?? 5000),
  pack: Number(process.env.PORT_PACK_BUILDS ?? 1000),
};

// mulberry32: a small seeded generator, so a failure's seed rebuilds the same build.
const random = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const SKILL_NAMES = Object.keys(SKILLS) as Skill[];
const MOD_KEYS = Mods.keyof().options;
const WARGEAR = [...wargear.values()];
// What a careful Advanced build carries: common, cheap, and not an upgrade.
const CHEAP = WARGEAR.filter((w) => w.kind !== "upgrade" && w.rarity === "Common" && w.value !== null && w.value <= 3);
const ascensionPackages = creation.packages.filter((p) => p.kind === "ascension");
const advancementPackages = creation.packages.filter((p) => p.kind === "advancement");
const keywordNames = creation.keywords.map((k) => k.name).filter((k) => !k.startsWith("["));
// Who a Background table or option group belongs to, as the build's species, faction or sub-faction ids.
const owns = (o: Record<string, unknown>, ids: Set<string>) =>
  Object.values(o).some((v) => (Array.isArray(v) ? v.some((x) => ids.has(x as string)) : ids.has(v as string)));

type Mutable = {
  tier: number;
  budget?: number;
  archetypeId?: string;
  advanced?: { factionId?: string; abilityOf?: string; wargear: string[] };
  speciesId?: string;
  fills: Record<string, { id: string } | { writeIn: string }>;
  background?: Record<string, string>;
  options: { groupId: string; name: string }[];
  attributes: Record<string, number>;
  skills: Record<string, number>;
  talents: { id: string; choice?: string }[];
  powers: string[];
  packages: string[];
  languages: { picks: string[]; bought: string[] };
  wealth: number;
  choices: Record<string, (string | number)[]>;
  advancement: {
    attributes: Record<string, number>;
    skills: Record<string, number>;
    talents: { id: string; choice?: string }[];
    powers: string[];
    packages: string[];
    languages: string[];
    archetypeAscension?: { archetypeId: string };
    boughtIn: Record<string, number>;
  };
  gm: {
    species?: string;
    keywords: string[];
    gear: { remove: string[]; add: { name: string; wargearId?: string; mundane?: true }[] };
    approved: string[];
    mods: Record<string, number>;
  };
};

// One build mixing every part of `CharacterBuild`. Its choices are answered from what a first resolve still asks for,
// twice (an answer can open the next choice), and the GM's ticks are taken from what the last one flags. Half the
// builds are careless (unknown ids, answers off the list, anything bought); the other half are careful and, after
// each resolve, drop what it refused, so many of them end ready.
function generate(seed: number): Run {
  const r = random(seed);
  const int = (lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
  const chance = (p: number) => r() < p;
  const careful = chance(0.5);
  const wrong = (p: number) => !careful && chance(p);
  const one = <T>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!;
  const some = <T>(xs: readonly T[], n: number): T[] => {
    const left = [...xs];
    const out: T[] = [];
    while (out.length < n && left.length) out.push(left.splice(Math.floor(r() * left.length), 1)[0]!);
    return out;
  };
  const bogus = (p: number, real: string) => (wrong(p) ? `no-such-${seed}` : real);
  const choiceOf = (t: (typeof creation.talents)[number]) =>
    t.options
      ? wrong(0.1)
        ? "Not an option"
        : one(t.options)
      : t.repeatable === "perChoice" || wrong(0.05)
        ? one(["Orks", "Tyranids", "Bolt Pistol", "Strength", "Tech"])
        : undefined;
  const talent = () => {
    const t = one(creation.talents);
    const choice = choiceOf(t);
    return { id: bogus(0.03, t.id), ...(choice && { choice }) };
  };

  const homebrew = careful || chance(0.7);
  const tier = int(1, 5);
  const b: Mutable = {
    tier,
    fills: {},
    options: [],
    attributes: {},
    skills: {},
    talents: [],
    powers: [],
    packages: [],
    languages: { picks: [], bought: [] },
    wealth: 0,
    choices: {},
    advancement: {
      attributes: {},
      skills: {},
      talents: [],
      powers: [],
      packages: [],
      languages: [],
      boughtIn: {},
    },
    gm: { keywords: [], gear: { remove: [], add: [] }, approved: [], mods: {} },
  };
  const arch = chance(0.82)
    ? one(wrong(0.1) ? creation.archetypes : creation.archetypes.filter((a) => a.tier <= tier))
    : undefined;
  if (arch) {
    b.archetypeId = bogus(0.01, arch.id);
    if (arch.speciesIds.length > 1 && chance(0.7)) b.speciesId = one(arch.speciesIds);
    else if (wrong(0.04)) b.speciesId = one(creation.species).id;
  } else {
    b.advanced = { wargear: some(careful ? CHEAP : WARGEAR, int(0, careful ? 2 : 5)).map((w) => bogus(0.03, w.id)) };
    if (chance(0.5)) b.advanced.factionId = bogus(0.05, one(creation.factions).id);
    if (chance(0.3)) b.advanced.abilityOf = bogus(0.05, one(creation.archetypes).id);
    if (chance(0.85)) b.speciesId = bogus(0.02, one(creation.species).id);
  }
  if (chance(0.05)) b.budget = int(50, 600);
  if (wrong(0.25)) b.packages.push(bogus(0.1, one(ascensionPackages).id));
  if (wrong(0.12)) b.packages.push(one(advancementPackages).id);

  // Background tables and option groups mostly of the character's own species or faction, so the rows apply.
  const mine = new Set([b.speciesId ?? arch?.speciesIds[0] ?? "", arch?.factionId ?? b.advanced?.factionId ?? ""]);
  const tables = creation.backgrounds.filter((t) => owns(t.owner, mine));
  if (careful || chance(0.6)) {
    const table = one(tables.length && !wrong(0.25) ? tables : creation.backgrounds);
    b.background = { tableId: bogus(0.02, table.id) };
    const rows = BACKGROUND_ROWS.filter((row) => table[row].length);
    for (const row of rows)
      if (careful || chance(0.85)) b.background[row] = wrong(0.05) ? "Not a row" : one(table[row]).name;
    if (careful || chance(0.8)) b.background.bonus = one(rows.length ? rows : BACKGROUND_ROWS);
  }
  const groups = creation["option-groups"].filter((g) => owns(g.owner, mine));
  if (careful ? groups.length && chance(0.5) : chance(0.25))
    for (let i = int(1, careful ? 1 : 3); i > 0; i--) {
      const g = one(groups.length && !wrong(0.3) ? groups : creation["option-groups"]);
      b.options.push({ groupId: g.id, name: wrong(0.03) ? "Not an option" : one(g.options).name });
    }
  if (chance(0.6)) for (const a of some(ATTRIBUTES, int(1, 3))) b.attributes[a] = int(1, careful ? 4 : 8);
  if (chance(0.7)) for (const k of some(SKILL_NAMES, int(1, 5))) b.skills[k] = int(0, careful ? 3 : 6);
  if (chance(0.5)) for (let i = int(1, careful ? 1 : 3); i > 0; i--) b.talents.push(talent());
  if (chance(0.25)) b.powers.push(...some(creation.powers, int(1, 2)).map((p) => bogus(0.03, p.id)));
  if (chance(0.15)) b.languages.bought.push(wrong(0.2) ? "Gutter Cant" : one(creation.languages).id);
  if (chance(0.3)) b.wealth = int(0, MAX_BOUGHT_WEALTH);
  // A build neither side accepts: both throw.
  if (wrong(0.01)) b.wealth = MAX_BOUGHT_WEALTH + 1;
  if (wrong(0.01) && arch) b.advanced = { wargear: [] };
  if (chance(0.1)) b.gm.keywords.push(...some(keywordNames, int(1, 2)));
  if (chance(0.04)) b.gm.species = one(creation.species).id;
  if (chance(0.05)) b.gm.gear.remove.push(one(WARGEAR).name);
  if (chance(0.08))
    b.gm.gear.add.push(
      chance(0.8) ? (({ name, id }) => ({ name, wargearId: id }))(one(WARGEAR)) : { name: "Bedroll", mundane: true },
    );
  if (chance(0.08)) b.gm.mods[one(MOD_KEYS)] = int(-1, 2);

  const play = chance(0.35)
    ? { tier: Math.min(5, tier + int(0, 2)), xpEarned: int(careful ? 100 : 0, 200), packageWaived: chance(0.3) }
    : undefined;
  if (play && chance(0.8)) {
    const adv = b.advancement;
    if (chance(0.5)) for (const a of some(ATTRIBUTES, int(1, 2))) adv.attributes[a] = int(2, 8);
    if (chance(0.5)) for (const k of some(SKILL_NAMES, int(1, 3))) adv.skills[k] = int(1, 6);
    if (chance(0.4)) adv.talents.push(talent());
    if (chance(0.2)) adv.powers.push(one(creation.powers).id);
    for (let i = careful ? 0 : int(0, play.tier - tier + (chance(0.2) ? 1 : 0)); i > 0; i--)
      adv.packages.push(one(ascensionPackages).id);
    if (chance(0.15)) adv.packages.push(one(advancementPackages).id);
    if (chance(0.15)) adv.languages.push(wrong(0.2) ? "Gutter Cant" : one(creation.languages).id);
    if (chance(0.15)) {
      const to = creation.archetypes.filter(
        (a) => a.factionId === arch?.factionId && a.tier > tier && a.tier <= play.tier,
      );
      if (to.length || !careful)
        adv.archetypeAscension = { archetypeId: one(to.length && !wrong(0.2) ? to : creation.archetypes).id };
    }
  }

  const run: Run = { build: b as CharacterBuildInput, homebrew, play };
  for (let round = 0; round < (careful ? 6 : 2); round++) {
    const first = attempt(() => auspex(run));
    if (!first.ok) return run;
    if (careful) repair(first.r as ResolvedBuild);
    answer(first.r as ResolvedBuild);
  }
  const last = attempt(() => auspex(run));
  if (!last.ok) return run;
  const res = last.r as ResolvedBuild;
  for (const p of res.problems)
    if (p.severity === "gm" && p.path && (careful || chance(0.6))) b.gm.approved.push(p.path);
  if (wrong(0.03)) b.gm.approved.push("not/a/path");
  for (const l of res.ledger) if (l.key && chance(0.5)) b.advancement.boughtIn[l.key] = int(1, 30);
  return run;

  // What a careful build drops after a resolve: whatever a refusal names, and the purchases behind a refused total.
  function repair(res: ResolvedBuild) {
    const errors = res.problems.filter((p) => p.severity === "error").map((p) => p.what);
    const refused = (name: string | undefined) => !!name && errors.some((w) => w.startsWith(name));
    const any = (re: RegExp) => errors.some((w) => re.test(w));
    const nameOf = <T extends { id: string; name: string }>(list: T[], id: string) =>
      list.find((x) => x.id === id)?.name;
    const adv = b.advancement;
    b.talents = b.talents.filter((t) => !refused(nameOf(creation.talents, t.id)));
    adv.talents = adv.talents.filter((t) => !refused(nameOf(creation.talents, t.id)));
    b.packages = b.packages.filter((id) => !refused(nameOf(creation.packages, id)));
    adv.packages = adv.packages.filter((id) => !refused(nameOf(creation.packages, id)));
    b.powers = b.powers.filter((id) => !refused(nameOf(creation.powers, id)));
    adv.powers = adv.powers.filter((id) => !refused(nameOf(creation.powers, id)));
    b.options = b.options.filter((o) => !refused(o.name) && !refused(nameOf(creation["option-groups"], o.groupId)));
    const to = adv.archetypeAscension && nameOf(creation.archetypes, adv.archetypeAscension.archetypeId);
    if (refused(to) || any(/^Archetype Ascension/)) delete adv.archetypeAscension;
    if (any(/over the budget/)) Object.assign(b, { attributes: {}, skills: {}, wealth: 0, talents: [], powers: [] });
    if (any(/earned in play/))
      Object.assign(adv, { attributes: {}, skills: {}, talents: [], powers: [], languages: [] });
    if (any(/free language/)) b.languages.picks = [];
    if (any(/Tree of Learning/)) [b.skills, adv.skills] = [{}, {}];
    if (any(/maximum of/)) [b.attributes, adv.attributes] = [{}, {}];
    if (any(/^(Origin|Accomplishment|Goal) |has no (Origin|Accomplishment|Goal)/)) delete b.background;
    if (b.advanced && any(/Value|pieces|Unique/)) b.advanced.wargear = [];
  }

  // What a resolve asks for, answered mostly right and sometimes wrong.
  function answer(res: ResolvedBuild) {
    for (const p of res.pending) {
      if (p.pick || !(careful || chance(0.9))) continue;
      const [head, , last] = p.path.split("/");
      if (p.path === "advanced/species" || last === "species")
        b.speciesId = arch && !wrong(0.1) ? one(arch.speciesIds) : one(creation.species).id;
      else if (p.path === "ascension") b.packages.push(one(ascensionPackages).id);
      else if (p.path === "advance/ascension") b.advancement.packages.push(one(ascensionPackages).id);
      else if (p.path === "background")
        b.background = { tableId: one(tables.length ? tables : creation.backgrounds).id };
      else if (head === "background" && b.background) {
        const row = p.path.split("/")[2]!;
        b.background[row] = one(p.options);
      } else if (head === "fill") {
        const k = /^Choose your (\[.+\])$/.exec(p.what)![1]!;
        const kw = creation.keywords.find((x) => x.name === k);
        const fit = creation["sub-factions"].filter((s) => s.type === kw?.placeholder);
        b.fills[k] =
          fit.length && (careful || chance(0.85))
            ? { id: one(fit).id }
            : kw?.writeIn || chance(0.5)
              ? { writeIn: "IRON HALO" }
              : { id: one(creation["sub-factions"]).id };
      } else if (p.path === "languages") {
        // The languages its Keywords allow, by the names the pending choice lists.
        const allowed = creation.languages.filter((l) => p.of?.split(", ").includes(l.name));
        b.languages.picks.push(
          ...some(allowed.length && !wrong(0.3) ? allowed : creation.languages, p.choose).map((l) =>
            wrong(0.1) ? "Gutter Cant" : l.id,
          ),
        );
      }
    }
    for (const c of res.choices) {
      if (b.choices[c.path] !== undefined || !(careful || chance(0.85))) continue;
      const n = c.choose;
      const pick = c.pick;
      const ans: (string | number)[] =
        pick.kind === "option"
          ? some(
              c.options.map((_, i) => i),
              n,
            )
          : pick.kind === "wargear"
            ? some(
                wrong(0.1) ? WARGEAR : WARGEAR.filter((w) => wargearMatches(w, pick.filter, { tier, newTier: tier })),
                n,
              ).map((w) => w.id)
            : pick.kind === "skill" || pick.kind === "attribute"
              ? some(pick.from as string[], n)
              : pick.kind === "discipline"
                ? some(pick.from ?? creation.disciplines.map((d) => d.id), n)
                : pick.kind === "power"
                  ? some(
                      creation.powers.filter((pw) => wrong(0.1) || pick.disciplines.includes(pw.disciplineId)),
                      n,
                    ).map((pw) => pw.id)
                  : res.who.keywords.length
                    ? [one(res.who.keywords)]
                    : [];
      if (wrong(0.04) && ans.length) ans.push(ans[0]!); // the same answer twice
      b.choices[c.path] = ans.slice(0, 20);
    }
  }
}

// Every part `partsOf` knows: a build with all of them.
const ALL_PARTS = partsOf({
  build: {
    tier: 2,
    archetypeId: "x",
    advanced: { factionId: "x", abilityOf: "x", wargear: ["x"] },
    speciesId: "x",
    budget: 1,
    fills: { "[A]": { id: "x" }, "[B]": { writeIn: "X" } },
    background: { tableId: "x", bonus: "origin" },
    options: [{ groupId: "x", name: "x" }],
    attributes: { S: 2 },
    skills: { Tech: 1 },
    talents: [{ id: "x", choice: "x" }],
    powers: ["x"],
    packages: ["x"],
    languages: { picks: ["x"], bought: ["x"] },
    wealth: 1,
    choices: { x: [0] },
    advancement: {
      attributes: { S: 2 },
      skills: { Tech: 1 },
      talents: [{ id: "x" }],
      powers: ["x"],
      packages: ["x"],
      languages: ["x"],
      archetypeAscension: { archetypeId: "x" },
      boughtIn: { x: 1 },
    },
    gm: {
      species: "x",
      keywords: ["X"],
      gear: { remove: ["x"], add: [{ name: "x" }] },
      approved: ["x"],
      mods: { influence: 1 },
    },
  },
  play: { tier: 3, xpEarned: 1, packageWaived: true },
  homebrew: true,
});

for (const mode of MODES)
  test(
    `${BUILDS[mode]} generated builds resolve the same on both sides${FROM[mode]}`,
    { skip, timeout: 600_000 },
    () => {
      const fails: { name: string; diff: string }[] = [];
      const runs = [];
      const started = performance.now();
      for (let seed = 1; seed <= BUILDS[mode]; seed++) {
        const run = generate(seed);
        const { a, diff, rules } = compare(run, mode);
        if (diff) fails.push({ name: `seed ${seed}`, diff });
        runs.push({ run, a, rules });
      }
      console.log(`${BUILDS[mode]} builds in ${Math.round(performance.now() - started)} ms`);
      tally(runs, ALL_PARTS);
      report(fails, BUILDS[mode]);
    },
  );
