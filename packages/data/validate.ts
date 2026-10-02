import { readdirSync, readFileSync } from "node:fs";
import { z } from "zod";
import {
  CREATION_TYPES,
  LINKED_RULE_KINDS,
  type CreationType,
  Pack,
  RuleEntry,
  archetypeXp,
  ratingsXp,
  ruleKey,
  SOURCES,
  THREAT_SOURCES,
  Threat,
  Wargear,
  SKILLS,
  SkillDn,
  EventTable,
  FactionPreset,
  NpcPreset,
  PoolEntry,
  PoolPresetTable,
  PoolSpend,
  presetLine,
} from "@wg/shared";
import {
  eventTableFiles,
  factionPresetFiles,
  loadPackRaw,
  npcPresetFiles,
  packNames,
  poolPresetFiles,
} from "./index.ts";

// Core blocks with one GM wargear swap (docs/kill-team.md, Kommandos), so not part of the printed bestiary.
const HOUSE_VARIANTS = ["kommando-breacha-boy", "kommando-slasha-boy", "kommando-snipa-boy"];

// Bestiary entries from the Core Rulebook contents page (pp.326-371).
const EXPECTED = [
  "imperial-citizen",
  "astra-militarum-trooper",
  "tactical-space-marine",
  "enforcer",
  "chrono-gladiator",
  "mutant",
  "scum",
  "combat-servitor",
  "servo-skull",
  "cultist",
  "cult-leader",
  "rogue-psyker",
  "possessed-mortal",
  "chaos-space-marine",
  "possessed-chaos-space-marine",
  "bloodletter",
  "daemonette",
  "pink-horror",
  "plaguebearer",
  "poxwalker",
  "chaos-spawn",
  "ork-boy",
  "kommando",
  "ork-nob",
  "painboy",
  "grot",
  "killa-kan",
  "guardian-defender",
  "wraithguard",
  "ranger",
  "corsair",
  "genestealer",
  "genestealer-patriarch",
  "acolyte-hybrid",
  "neophyte-hybrid",
  "cult-magus",
];

// Every other book's expected ids, from its contents pages and a scan for stat blocks (GitHub issue #44). It lives
// outside threats/, which is read as all threats. A book is added when its transcription lands.
const THREAT_MANIFEST: Record<string, string[]> = JSON.parse(
  readFileSync(new URL("./threat-manifest.json", import.meta.url), "utf8"),
);

const dir = new URL("./threats/", import.meta.url);
let failed = false;
const found: string[] = [];
const variantsOf = new Map<string, Set<string>>(); // a threat's `variant` options, for followers
const threatKeywords = new Set<string>(); // Keywords printed on stat blocks, which the glossary doesn't list them all of

for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
  const r = Threat.safeParse(JSON.parse(readFileSync(new URL(file, dir), "utf8")));
  if (!r.success) {
    failed = true;
    console.error(`✖ ${file}\n${z.prettifyError(r.error)}`);
    continue;
  }
  if (`${r.data.id}.json` !== file) {
    failed = true;
    console.error(`✖ ${file}: id "${r.data.id}" doesn't match filename`);
    continue;
  }
  if (r.data.source === "core" && !EXPECTED.includes(r.data.id) && !HOUSE_VARIANTS.includes(r.data.id))
    console.warn(`? ${file}: core source but not in the core bestiary list`);
  if (THREAT_MANIFEST[r.data.source] && !THREAT_MANIFEST[r.data.source]!.includes(r.data.id))
    console.warn(`? ${file}: not in threat-manifest.json for ${r.data.source}`);
  found.push(r.data.id);
  for (const k of r.data.keywords) threatKeywords.add(k.toUpperCase());
  variantsOf.set(r.data.id, new Set(r.data.options.filter((o) => o.kind === "variant").map((o) => o.name)));
}

const missing = EXPECTED.filter((id) => !found.includes(id));
const core = EXPECTED.length - missing.length;
console.log(`core bestiary: ${core}/${EXPECTED.length}${missing.length ? ` (missing: ${missing.join(", ")})` : ""}`);
console.log(`supplements: ${found.length - core} threats`);
for (const [source, expected] of Object.entries(THREAT_MANIFEST)) {
  const gone = expected.filter((id) => !found.includes(id));
  console.log(
    `threats ${source}: ${expected.length - gone.length}/${expected.length}${gone.length ? ` (missing: ${gone.join(", ")})` : ""}`,
  );
}
// A follower names its stat block, and a variant only of that threat; nothing else names a stat block.
function followerError(follower: boolean, threatId?: string, variant?: string) {
  if (follower !== (threatId !== undefined))
    return follower ? "a follower needs a threatId" : "only a follower has a threatId";
  if (threatId && !variantsOf.has(threatId)) return `unknown threat "${threatId}"`;
  if (variant && !variantsOf.get(threatId!)?.has(variant)) return `"${threatId}" has no variant "${variant}"`;
}
// Wargear catalogue: schema per file, ids unique across files.
const wargearDir = new URL("./wargear/", import.meta.url);
const wargearIds = new Set<string>();
const wargearRequires: { where: string; requires: unknown }[] = []; // resolved once the creation ids are known
const wargearUpgrades: { where: string; upgrade: unknown }[] = []; // its trait ids resolve against the rules reference
for (const file of readdirSync(wargearDir)
  .filter((f) => f.endsWith(".json"))
  .sort()) {
  const r = Wargear.array().safeParse(JSON.parse(readFileSync(new URL(file, wargearDir), "utf8")));
  if (!r.success) {
    failed = true;
    console.error(`✖ wargear/${file}\n${z.prettifyError(r.error)}`);
    continue;
  }
  for (const w of r.data) {
    if (wargearIds.has(w.id)) {
      failed = true;
      console.error(`✖ wargear/${file}: duplicate id "${w.id}"`);
    }
    wargearIds.add(w.id);
    if (w.requires) wargearRequires.push({ where: `wargear/${file} "${w.id}"`, requires: w.requires });
    // Every upgrade carries its slot, what it fits and its structured effect (rules-flow.md §11.64), and nothing else
    // does: an `upgrade` block on another kind would never be read.
    if ((w.kind === "upgrade") !== (w.upgrade !== undefined)) {
      failed = true;
      console.error(
        `✖ wargear/${file} "${w.id}": ${w.kind === "upgrade" ? "an upgrade needs an `upgrade` block (slot, fits, mods)" : `kind "${w.kind}" can't carry an \`upgrade\` block`}`,
      );
    }
    if (w.upgrade) wargearUpgrades.push({ where: `wargear/${file} "${w.id}"`, upgrade: w.upgrade });
    // A per-host slot can only name a host the entry fits, or it would describe something it can never go on (§11.64).
    for (const host of Object.keys(w.upgrade?.slotOn ?? {}))
      if (!(w.upgrade!.fits.kinds ?? ["weapon"]).some((k) => k === host)) {
        failed = true;
        console.error(`✖ wargear/${file} "${w.id}": slotOn names "${host}", which isn't in fits.kinds`);
      }
    const err = followerError(w.kind === "follower", w.threatId, w.variant);
    if (err) {
      failed = true;
      console.error(`✖ wargear/${file} "${w.id}": ${err}`);
    }
  }
  console.log(`wargear/${file}: ${r.data.length} entries`);
}

// Rules reference: schema per file, ids unique across files.
const rulesDir = new URL("./rules/", import.meta.url);
const ruleIds = new Set<string>();
const weaponTraitIds = new Set<string>();
const itemTraitIds = new Set<string>(); // weapon and armour Traits together: an upgrade mod names either
const traitKeys = new Set<string>(); // ruleKey of every Condition and trait, for the trait-name check at the end
for (const file of readdirSync(rulesDir)
  .filter((f) => f.endsWith(".json"))
  .sort()) {
  const r = RuleEntry.array().safeParse(JSON.parse(readFileSync(new URL(file, rulesDir), "utf8")));
  if (!r.success) {
    failed = true;
    console.error(`✖ rules/${file}\n${z.prettifyError(r.error)}`);
    continue;
  }
  for (const e of r.data) {
    if (ruleIds.has(e.id)) {
      failed = true;
      console.error(`✖ rules/${file}: duplicate id "${e.id}"`);
    }
    ruleIds.add(e.id);
    if (e.kind === "weapon-trait") weaponTraitIds.add(e.id);
    if (e.kind === "weapon-trait" || e.kind === "armour-trait") itemTraitIds.add(e.id);
    if (LINKED_RULE_KINDS.includes(e.kind)) traitKeys.add(ruleKey(e.name));
  }
  console.log(`rules/${file}: ${r.data.length} entries`);
}

// Scene presets (docs/data.md, "Scene presets"): the sample DNs per Skill, one row per Skill and printed DN (Core
// pp.122–126 print DN 1, 3, 5, 7 and 9 for every Skill but Psychic Mastery).
{
  const r = SkillDn.array().safeParse(
    JSON.parse(readFileSync(new URL("./scene-presets/skill-dns.json", import.meta.url), "utf8")),
  );
  if (!r.success) {
    failed = true;
    console.error(`✖ scene-presets/skill-dns.json\n${z.prettifyError(r.error)}`);
  } else {
    // Every Skill but Psychic Mastery prints exactly DN 1, 3, 5, 7 and 9, so a dropped, doubled or stray row fails.
    const printed = [1, 3, 5, 7, 9].join();
    for (const skill of Object.keys(SKILLS) as (keyof typeof SKILLS)[]) {
      const dns = r.data
        .filter((d) => d.skill === skill)
        .map((d) => d.dn)
        .sort((a, b) => a - b)
        .join();
      const want = skill === "Psychic Mastery" ? "" : printed;
      if (dns !== want) {
        failed = true;
        console.error(`✖ scene-presets/skill-dns.json: ${skill} has DNs [${dns}], expected [${want}]`);
      }
    }
    const skills = new Set(r.data.map((d) => d.skill));
    console.log(`scene-presets/skill-dns.json: ${r.data.length} sample DNs, ${skills.size} Skills`);
  }
}

// Event tables (scene-presets/<source>.json): the filename names the book, ids are unique across files, and
// EventTable's own check holds every range to the dice, with print gaps and overlaps listed rather than missed. Each
// planned table (issue #39) must hold the events the book prints.
const EXPECTED_EVENTS: Record<string, number> = {
  "church-of-steel-battlefield-events": 12, // pp.36–39
  "church-of-steel-urban-travel-events": 12, // pp.39–40
  "church-of-steel-wasteland-events": 12, // pp.41–42
  "redacted-records-internal-events": 11, // p.13
  "redacted-records-external-events": 11, // p.14
  "redacted-records-high-tier-events": 11, // p.15
  "darktide-lattice-encounters": 6, // p.74
  "litanies-of-the-lost-random-encounters": 11, // pp.117–120
};
const tableIds = new Set<string>();
{
  for (const file of eventTableFiles()) {
    const r = EventTable.array().safeParse(
      JSON.parse(readFileSync(new URL(`./scene-presets/${file}`, import.meta.url), "utf8")),
    );
    if (!r.success) {
      failed = true;
      console.error(`✖ scene-presets/${file}\n${z.prettifyError(r.error)}`);
      continue;
    }
    for (const t of r.data) {
      if (`${t.source}.json` !== file) {
        failed = true;
        console.error(`✖ scene-presets/${file}: table "${t.id}" is from ${t.source}`);
      }
      if (tableIds.has(t.id)) {
        failed = true;
        console.error(`✖ scene-presets/${file}: duplicate table id "${t.id}"`);
      }
      tableIds.add(t.id);
      if (EXPECTED_EVENTS[t.id] !== t.rows.length) {
        failed = true;
        console.error(
          `✖ scene-presets/${file} ${t.id}: ${t.rows.length} events, expected ${EXPECTED_EVENTS[t.id] ?? "none (not a planned table)"}`,
        );
      }
      const tests = t.rows.flatMap((e) => e.tests);
      const escapes = (t.gm ? 1 : 0) + tests.filter((x) => x.gm).length;
      console.log(
        `scene-presets/${file} ${t.id}: ${t.rows.length}/${EXPECTED_EVENTS[t.id]} events, ${tests.length} Tests (${tests.filter((x) => x.dn !== null).length} with a printed DN), ${escapes} gm notes` +
          (t.gaps.length || t.overlaps.length
            ? `, as printed: gaps ${t.gaps.join(",") || "none"}, overlaps ${t.overlaps.join(",") || "none"}`
            : ""),
      );
    }
  }
}
const pendingTables = Object.keys(EXPECTED_EVENTS).filter((id) => !tableIds.has(id));
if (pendingTables.length) console.log(`scene-presets: not transcribed yet: ${pendingTables.join(", ")}`);

// Ruin and Glory lists (scene-presets/pools/<source>.json, issue #40): the filename names the book, ids are unique,
// each planned list holds the rows the book prints, and every row, copied into a scene, fits the scene's line. A
// cost the book doesn't print stays null (rules-flow.md §11.78), and the gm conditions are counted.
const EXPECTED_POOL_ROWS: Record<string, number> = {
  "core-ruin-triggers": 5, // pp.163, 319, 320
  "core-ruin-spends": 4, // p.320
  "core-glory-awards": 1, // p.316
  "threat-assessment-ruin-actions": 5, // p.7
  "bloody-gates-calling-for-support": 6, // pp.25–26
  "bloody-gates-battlefield-ruin": 6, // p.26
  "affliction-ascendant-rites-of-battle": 9, // p.23
  "affliction-ascendant-battlefield-ruin": 6, // p.24
};
const poolIds = new Set<string>();
for (const file of poolPresetFiles()) {
  const r = PoolPresetTable.array().safeParse(
    JSON.parse(readFileSync(new URL(`./scene-presets/pools/${file}`, import.meta.url), "utf8")),
  );
  if (!r.success) {
    failed = true;
    console.error(`✖ scene-presets/pools/${file}\n${z.prettifyError(r.error)}`);
    continue;
  }
  const problem = (message: string) => {
    failed = true;
    console.error(`✖ scene-presets/pools/${file}: ${message}`);
  };
  for (const table of r.data) {
    if (`${table.source}.json` !== file) problem(`list "${table.id}" is from ${table.source}`);
    if (poolIds.has(table.id)) problem(`duplicate list id "${table.id}"`);
    poolIds.add(table.id);
    if (EXPECTED_POOL_ROWS[table.id] !== table.rows.length)
      problem(
        `${table.id}: ${table.rows.length} rows, expected ${EXPECTED_POOL_ROWS[table.id] ?? "none (not a planned list)"}`,
      );
    for (const row of table.rows) {
      const { list, line } = presetLine({ table, row });
      const fits =
        list === "spends" ? PoolSpend.safeParse({ ...line, cost: line.cost ?? 1 }) : PoolEntry.safeParse(line);
      if (!fits.success) problem(`${table.id} "${row.name}" doesn't fit a scene line: ${z.prettifyError(fits.error)}`);
    }
  }
  const rows = r.data.flatMap((t) => t.rows);
  console.log(
    `scene-presets/pools/${file}: ${rows.length} presets in ${r.data.length} list${r.data.length === 1 ? "" : "s"} (${rows.filter((x) => x.gm).length} gm conditions, ${rows.filter((x) => x.n === null).length} with no printed amount)`,
  );
}
const pendingPools = Object.keys(EXPECTED_POOL_ROWS).filter((id) => !poolIds.has(id));
if (pendingPools.length) console.log(`scene-presets/pools: not transcribed yet: ${pendingPools.join(", ")}`);

// Creation catalogue (docs/data.md, "Creation catalogue"): creation/<type>/<source>.json. Schema per file, the
// filename names the book, ids unique per type, every id reference resolves, one record per thing across books.
const creationDir = new URL("./creation/", import.meta.url);
const creation = new Map<CreationType, { file: string; r: Record<string, unknown> }[]>();
for (const type of Object.keys(CREATION_TYPES) as CreationType[]) {
  const dir = new URL(`${type}/`, creationDir);
  const rows: { file: string; r: Record<string, unknown> }[] = [];
  creation.set(type, rows);
  let files: string[] = [];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  } catch {} // not transcribed yet
  for (const file of files.sort()) {
    const where = `creation/${type}/${file}`;
    if (!(file.replace(/\.json$/, "") in SOURCES)) {
      failed = true;
      console.error(`✖ ${where}: filename must be a source id (${Object.keys(SOURCES).join(", ")})`);
      continue;
    }
    const parsed = CREATION_TYPES[type].array().safeParse(JSON.parse(readFileSync(new URL(file, dir), "utf8")));
    if (!parsed.success) {
      failed = true;
      console.error(`✖ ${where}\n${z.prettifyError(parsed.error)}`);
      continue;
    }
    for (const r of parsed.data as Record<string, unknown>[]) {
      if (`${r.source}.json` !== file) {
        failed = true;
        console.error(`✖ ${where}: "${r.id}" has source "${r.source}"`);
      }
      if (rows.some((x) => x.r.id === r.id)) {
        failed = true;
        console.error(`✖ ${where}: duplicate id "${r.id}"`);
      }
      rows.push({ file: where, r });
    }
  }
}
// Coverage: creation/manifest.json lists the expected ids per type and source, from each book's contents pages.
// `done` lists the types whose transcription wave is finished: a reference into any other type counts as pending, not
// an error, until its wave lands.
let manifest: { done?: string[]; expected?: Record<string, Record<string, string[]>> } = {};
try {
  manifest = JSON.parse(readFileSync(new URL("manifest.json", creationDir), "utf8"));
} catch {}
const done = new Set(["wargear", "weapon-traits", "item-traits", ...(manifest.done ?? [])]);
const pending = new Map<string, number>();
const creationIds = (type: CreationType) => new Set(creation.get(type)!.map((x) => x.r.id as string));
// A sub-faction defines the keyword it fills in ("SPACE WOLVES"), so only glossary keywords need a keyword record.
const keywordNames = new Set(
  [...creation.get("keywords")!, ...creation.get("sub-factions")!].map((x) => (x.r.keyword ?? x.r.name) as string),
);
const known: Record<string, Set<string>> = {
  factions: creationIds("factions"),
  species: creationIds("species"),
  "sub-factions": creationIds("sub-factions"),
  archetypes: creationIds("archetypes"),
  talents: creationIds("talents"),
  powers: creationIds("powers"),
  disciplines: creationIds("disciplines"),
  "option-groups": creationIds("option-groups"),
  keywords: keywordNames,
  wargear: wargearIds,
  "weapon-traits": weaponTraitIds,
  "item-traits": itemTraitIds,
  threats: new Set(found),
};
// Which catalogue an id-holding key points into. The schema keeps these key names unambiguous.
const REF_KEYS: Record<string, string> = {
  factionId: "factions",
  backgroundsFrom: "factions",
  speciesId: "species",
  speciesIds: "species",
  countsAs: "species",
  successorOf: "sub-factions",
  groupId: "option-groups",
  subFactionId: "sub-factions",
  disciplineId: "disciplines",
  alsoIn: "disciplines",
  fromDisciplines: "disciplines",
  disciplineAccess: "disciplines",
  threatId: "threats",
  onlyDisciplines: "disciplines",
  asKeyword: "keywords",
  loseKeyword: "keywords",
  neverKeyword: "keywords",
  optionAccess: "option-groups",
  becomesArchetypeId: "archetypes",
  talentIds: "talents",
  powerIds: "powers",
  talent: "talents",
  power: "powers",
  keyword: "keywords",
  keywords: "keywords",
  wargearId: "wargear",
  upgrades: "wargear",
  traitIds: "weapon-traits",
  traitId: "item-traits", // an upgrade mod's Trait (wargear.ts, UpgradeMod)
};
const REQUIREMENT_REFS: Record<string, string> = {
  keyword: "keywords",
  notKeyword: "keywords",
  species: "species",
  notSpecies: "species",
  archetype: "archetypes",
  notArchetype: "archetypes",
  subFaction: "sub-factions",
  talent: "talents",
  notTalent: "talents",
  power: "powers",
};
let storyConditions = 0; // `gm` requirements and `story` grants: judged by the GM by design
const wargearCategories = new Set(
  readdirSync(wargearDir).flatMap((f) =>
    (JSON.parse(readFileSync(new URL(f, wargearDir), "utf8")) as Wargear[]).map((w) => w.category),
  ),
);
let unresolvedWargear = 0;
let mundaneWargear = 0; // printed possessions with no catalogue entry by design (rules-flow.md §11.43)
// Walks one record, checking every reference and counting the not-yet-structured bits.
function checkRefs(v: unknown, where: string) {
  if (Array.isArray(v)) return v.forEach((x) => checkRefs(x, where));
  if (typeof v !== "object" || v === null) return;
  const o = v as Record<string, unknown>;
  if (o.kind === "gm" || typeof o.story === "string") storyConditions++;
  for (const cat of Array.isArray(o.categories) ? (o.categories as string[]) : [])
    if (!wargearCategories.has(cat)) {
      failed = true;
      console.error(`✖ ${where}: unknown wargear category "${cat}"`);
    }
  if (typeof o.chooseDisciplines === "number" && Array.isArray(o.from))
    for (const ref of o.from as string[]) miss("disciplines", ref, where);
  const reqType = typeof o.kind === "string" ? REQUIREMENT_REFS[o.kind] : undefined;
  if (reqType && Array.isArray(o.anyOf)) for (const ref of o.anyOf as string[]) miss(reqType, ref, where);
  if (o.followers !== undefined && o.variant !== undefined) {
    const err = followerError(true, o.threatId as string | undefined, o.variant as string);
    if (err) {
      failed = true;
      console.error(`✖ ${where}: ${err}`);
    }
  }
  if (o.mundane === true) {
    mundaneWargear++;
    if (o.wargearId || o.upgrades || o.traitIds) {
      failed = true;
      console.error(`✖ ${where}: "${o.name}" is mundane but links the catalogue`);
    }
  } else if (typeof o.qty === "number" && typeof o.name === "string" && !o.wargearId) unresolvedWargear++;
  if ((o.upgrades || o.traitIds) && !o.wargearId) {
    failed = true;
    console.error(`✖ ${where}: "${o.name}" has upgrades or traitIds but no base wargearId`);
  }
  for (const [k, x] of Object.entries(o)) {
    const type = REF_KEYS[k];
    if (type && typeof x === "string") miss(type, x, where);
    else if (type && Array.isArray(x)) x.forEach((ref) => typeof ref === "string" && miss(type, ref, where));
    else checkRefs(x, where);
  }
}
function miss(type: string, ref: string, where: string) {
  if (known[type]?.has(ref)) return;
  if (!done.has(type)) return void pending.set(type, (pending.get(type) ?? 0) + 1);
  failed = true;
  console.error(`✖ ${where}: unknown ${type} "${ref}"`);
}
// One record per thing: the same name twice in a type means a duplicate printing (keep the newest, docs/data.md).
// Species-bound records only clash when their species overlap.
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
for (const [type, rows] of creation) {
  const seen = new Map<string, { file: string; r: Record<string, unknown> }>();
  for (const row of rows) {
    checkRefs(row.r, `${row.file} "${row.r.id}"`);
    const species = (row.r.speciesIds as string[] | undefined)?.join("|") ?? "";
    // An Exarch Power and a talent may share a name, and so may powers of two disciplines.
    const key = `${row.r.category ?? ""}:${row.r.disciplineId ?? ""}:${norm(row.r.name as string)}`;
    const prev = seen.get(key);
    const prevSpecies = (prev?.r.speciesIds as string[] | undefined) ?? [];
    if (prev && (!species || prevSpecies.some((s) => species.split("|").includes(s)))) {
      failed = true;
      console.error(`✖ creation/${type}: "${row.r.name}" in ${prev.file} and ${row.file}; keep the newest printing`);
    }
    seen.set(key, row);
  }
}
// A weapon effect's `chosen` is a Talent's choice, and `granted` the record's own weapon grant (rules-flow.md §11.68):
// on any other record they would reach nothing, silently.
const weaponGrant = (v: unknown): boolean =>
  Array.isArray(v)
    ? v.some(weaponGrant)
    : !!v && typeof v === "object" && ("wargear" in v || "wargearOf" in v || Object.values(v).some(weaponGrant));
const checkEffects = (r: Record<string, unknown>, where: string, talent: boolean) => {
  const bad = (why: string) => {
    failed = true;
    console.error(`✖ ${where}: ${why}`);
  };
  for (const e of (r.weapons as { fits: { chosen?: true; granted?: true } }[] | undefined) ?? []) {
    if (e.fits.chosen && !talent) bad("`chosen` is for a Talent's choice");
    if (e.fits.granted && !weaponGrant(r.grants)) bad("`granted` but its grants give no wargear");
  }
};
for (const [type, rows] of creation)
  for (const { file, r } of rows) {
    const where = `${file} "${r.id}"`;
    checkEffects(r, where, type === "talents");
    for (const key of ["abilities", "traits", "rules"])
      for (const rule of (r[key] as Record<string, unknown>[] | undefined) ?? [])
        checkEffects(rule, `${where} › ${String(rule.name)}`, false);
  }
for (const [type, bySource] of Object.entries(manifest.expected ?? {}))
  for (const [source, expected] of Object.entries(bySource)) {
    const have = creationIds(type as CreationType);
    const missing = expected.filter((e) => !have.has(e));
    console.log(
      `creation ${type} ${source}: ${expected.length - missing.length}/${expected.length}${missing.length ? ` (missing: ${missing.join(", ")})` : ""}`,
    );
  }
// A Species' XP is the cost of its granted ratings (Core p.29): a mismatch is a transcription error or a misprint.
for (const { file, r } of creation.get("species")!) {
  const cost = ratingsXp(r as Parameters<typeof ratingsXp>[0]);
  if (cost !== r.xp && !String(r.note ?? "").includes("XP as printed"))
    console.warn(
      `? ${file} "${r.id}": XP ${r.xp}, but its ratings cost ${cost} (note "XP as printed" if it's a misprint)`,
    );
}
for (const { file, r } of creation.get("archetypes")!) {
  const cost = archetypeXp(r as Parameters<typeof archetypeXp>[0]);
  if (cost !== r.xp && !String(r.note ?? "").includes("XP as printed"))
    console.warn(
      `? ${file} "${r.id}": XP ${r.xp}, but ratings + (Tier − 1) × 10 = ${cost} (note "XP as printed" if it's a misprint)`,
    );
}
for (const { where, requires } of wargearRequires) checkRefs(requires, where);
for (const { where, upgrade } of wargearUpgrades) checkRefs(upgrade, where);
for (const [type, rows] of creation) if (rows.length) console.log(`creation/${type}: ${rows.length} records`);
console.log(
  `creation: ${storyConditions} GM-judged story conditions, ${mundaneWargear} mundane possessions, ${unresolvedWargear} wargear items not in the catalogue`,
);
for (const [type, n] of pending) console.log(`creation: ${n} references to ${type} pending its wave`);

// Packs: schema, internal references, and every prepared-encounter threat must exist.
for (const name of packNames()) {
  const r = Pack.safeParse(loadPackRaw(name));
  if (!r.success) {
    failed = true;
    console.error(`✖ pack ${name}\n${z.prettifyError(r.error)}`);
    continue;
  }
  const unknown = r.data.adventures
    .flatMap((a) => a.beats.flatMap((b) => b.encounter.map((e) => e.threatId)))
    .filter((id) => !found.includes(id));
  const bestiaryNpcs = r.data.npcs
    .flatMap((n) => (n.statSource.kind === "bestiary" ? [n.statSource.threatId] : []))
    .filter((id) => !found.includes(id));
  for (const id of [...unknown, ...bestiaryNpcs]) {
    failed = true;
    console.error(`✖ pack ${name}: unknown threat "${id}"`);
  }
  console.log(
    `pack ${name}: ${r.data.characters.length} characters, ${r.data.npcs.length} NPCs, ${r.data.adventures.reduce((n, a) => n + a.beats.length, 0)} beats`,
  );
}

// Faction presets (faction-presets/<source>.json, issue #46): the filename names the book, ids are unique across files
// and the creation factions (the endpoint serves both), and every Keyword is in the glossary or printed on a stat block.
const factionPresetIds = new Set(creationIds("factions"));
for (const file of factionPresetFiles()) {
  const r = FactionPreset.array().safeParse(
    JSON.parse(readFileSync(new URL(`./faction-presets/${file}`, import.meta.url), "utf8")),
  );
  if (!r.success) {
    failed = true;
    console.error(`✖ faction-presets/${file}\n${z.prettifyError(r.error)}`);
    continue;
  }
  const problem = (message: string) => {
    failed = true;
    console.error(`✖ faction-presets/${file}: ${message}`);
  };
  for (const p of r.data) {
    if (`${p.source}.json` !== file) problem(`"${p.id}" is from ${p.source}`);
    if (!THREAT_SOURCES[p.source].official)
      problem(`"${p.id}": homebrew, but /faction-presets serves these files to every campaign`);
    if (factionPresetIds.has(p.id)) problem(`duplicate id "${p.id}"`);
    factionPresetIds.add(p.id);
    for (const k of p.keywords)
      if (!keywordNames.has(k) && !threatKeywords.has(k)) problem(`"${p.id}": unknown Keyword "${k}"`);
  }
  console.log(
    `faction-presets/${file}: ${r.data.length} factions (${r.data.filter((p) => p.keywords.length).length} with Keywords, ${r.data.filter((p) => p.secrets).length} with secrets)`,
  );
}

// NPC presets (npc-presets/<source>.json, issue #47): the filename names the first cite's book, ids are unique across
// files (one may reuse a patron's id, to replace that patron), every bestiary stat source resolves, and DESCRIPTION
// stays empty, because players read it once the NPC is revealed and printed text stays GM-side.
const patronIds = creationIds("patrons");
const npcPresetIds = new Set<string>();
for (const file of npcPresetFiles()) {
  const r = NpcPreset.array().safeParse(
    JSON.parse(readFileSync(new URL(`./npc-presets/${file}`, import.meta.url), "utf8")),
  );
  if (!r.success) {
    failed = true;
    console.error(`✖ npc-presets/${file}\n${z.prettifyError(r.error)}`);
    continue;
  }
  const problem = (message: string) => {
    failed = true;
    console.error(`✖ npc-presets/${file}: ${message}`);
  };
  for (const p of r.data) {
    if (`${p.cites[0]!.source}.json` !== file) problem(`"${p.id}" is first cited from ${p.cites[0]!.source}`);
    for (const c of p.cites)
      if (!THREAT_SOURCES[c.source].official)
        problem(`"${p.id}": homebrew, but /npc-presets serves these files to every campaign`);
    if (npcPresetIds.has(p.id)) problem(`duplicate id "${p.id}"`);
    npcPresetIds.add(p.id);
    if (p.description) problem(`"${p.id}": DESCRIPTION reaches players; printed text goes in gmNotes`);
    if (p.statSource.kind === "bestiary" && !found.includes(p.statSource.threatId))
      problem(`"${p.id}": unknown threat "${p.statSource.threatId}"`);
  }
  console.log(
    `npc-presets/${file}: ${r.data.length} NPCs (${r.data.filter((p) => p.statSource.kind !== "none").length} with stats, ${r.data.filter((p) => patronIds.has(p.id)).length} replacing a patron)`,
  );
}

// Trait names the app can't link to a rule (the web's RuleLink leaves them as plain text). A warning, not a failure:
// some are real traits missing from rules/ or a new spelling for the ruleKey aliases, others aren't traits at all.
const unlinked = new Set<string>();
const collectTraits = (v: unknown): void => {
  if (Array.isArray(v)) return v.forEach(collectTraits);
  if (!v || typeof v !== "object") return;
  for (const [k, x] of Object.entries(v)) {
    if (k === "traits" && Array.isArray(x)) {
      for (const t of x) if (typeof t === "string" && !traitKeys.has(ruleKey(t))) unlinked.add(t);
    } else collectTraits(x);
  }
};
for (const d of [dir, wargearDir])
  for (const f of readdirSync(d).filter((f) => f.endsWith(".json")))
    collectTraits(JSON.parse(readFileSync(new URL(f, d), "utf8")));
for (const name of packNames()) collectTraits(loadPackRaw(name));
if (unlinked.size) console.warn(`? ${unlinked.size} trait names match no rule: ${[...unlinked].sort().join(", ")}`);

process.exit(failed ? 1 : 0);
