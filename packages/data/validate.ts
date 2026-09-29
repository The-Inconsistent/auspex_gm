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
  Threat,
  Wargear,
} from "@wg/shared";
import { loadPackRaw, packNames } from "./index.ts";

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

const dir = new URL("./threats/", import.meta.url);
let failed = false;
const found: string[] = [];
const variantsOf = new Map<string, Set<string>>(); // a threat's `variant` options, for followers

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
  found.push(r.data.id);
  variantsOf.set(r.data.id, new Set(r.data.options.filter((o) => o.kind === "variant").map((o) => o.name)));
}

const missing = EXPECTED.filter((id) => !found.includes(id));
const core = EXPECTED.length - missing.length;
console.log(`core bestiary: ${core}/${EXPECTED.length}${missing.length ? ` (missing: ${missing.join(", ")})` : ""}`);
console.log(`supplements: ${found.length - core} threats`);
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
    // Every upgrade carries its slot, what it fits and its structured effect (rules-flow.md §11.61), and nothing else
    // does: an `upgrade` block on another kind would never be read.
    if ((w.kind === "upgrade") !== (w.upgrade !== undefined)) {
      failed = true;
      console.error(
        `✖ wargear/${file} "${w.id}": ${w.kind === "upgrade" ? "an upgrade needs an `upgrade` block (slot, fits, mods)" : `kind "${w.kind}" can't carry an \`upgrade\` block`}`,
      );
    }
    if (w.upgrade) wargearUpgrades.push({ where: `wargear/${file} "${w.id}"`, upgrade: w.upgrade });
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
