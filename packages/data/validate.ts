import { readdirSync, readFileSync } from "node:fs";
import { z } from "zod";
import {
  CONDITIONS,
  CREATION_TYPES,
  type CritRow,
  LINKED_RULE_KINDS,
  type CreationType,
  Pack,
  RuleEntry,
  archetypeXp,
  ratingsXp,
  ruleKey,
  SOURCES,
  THREAT_SOURCES,
  customThreatId,
  isCustomThreatId,
  threatSlug,
  Threat,
  Wargear,
  SKILLS,
  SkillDn,
  EventTable,
  FactionPreset,
  HazardTable,
  NpcPreset,
  Place,
  placeNotes,
  PoolEntry,
  PoolPresetTable,
  PoolSpend,
  presetLine,
  HULK_HAZARDS,
  type HulkRow,
  hulkNotes,
  MAX_HULK_ORIGINS,
  openRangeProblems,
  tableProblems,
  SpaceHulkGenerator,
  LootTable,
  RelicCreator,
  wargearMatches,
} from "@wg/shared";
import {
  eventTableFiles,
  factionPresetFiles,
  hazardFiles,
  loadPackRaw,
  LOOKUP_FILES,
  lookups,
  lootFiles,
  npcPresetFiles,
  packNames,
  placeFiles,
  poolPresetFiles,
  RELICS_FILE,
  SPACE_HULK_FILE,
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
  // `custom` and the `custom-` prefix belong to a campaign's own stat blocks (issue #43). A file claiming either could
  // shadow one a GM wrote, and `loadThreats` resolves a `custom-` id against the database, never against this folder.
  if (r.data.source === "custom" || isCustomThreatId(r.data.id)) {
    failed = true;
    console.error(`✖ ${file}: "custom" is for a GM's own threats; a bestiary file can't use that source or id prefix`);
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
const wargearEntries: Wargear[] = []; // what a loot table's `pick` is matched against (issue #51)
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
    wargearEntries.push(w);
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
const conditionIds = new Set<string>(); // for the hazards' Conditions
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
    if (e.kind === "condition") conditionIds.add(e.id);
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

// Hazard tables (scene-presets/hazards/<source>.json, issue #49): the filename names the book, table and row ids are
// unique (a place's list points at a row id), each planned table holds the rows the book prints, and every Condition
// and Threat a row names exists. HazardTable's own check holds the ranges to the dice.
const EXPECTED_HAZARDS: Record<string, number> = {
  "threat-assessment-space-hulk": 12, // p.11, no row for 66
  "threat-assessment-hive-city": 13, // p.13
  "threat-assessment-deathworld": 13, // p.15
  "threat-assessment-volcanic-wastes": 13, // p.17
  "threat-assessment-frozen-tundra": 13, // p.19
  "threat-assessment-forgeworld": 13, // p.21
  "core-environmental-hazards": 6, // pp.201–202, a list to pick from
  "darktide-warrens-hazards": 9, // p.14
  "darktide-hab-settlement-hazards": 9, // p.16
  "darktide-industrial-works-hazards": 9, // p.18
  "darktide-gang-turf-hazards": 9, // p.20
  "darktide-militarum-depot-hazards": 9, // p.22
  "darktide-quarantine-zone-hazards": 9, // p.24
  "darktide-profaned-ground-hazards": 9, // p.26
  "redacted-records-space-hulk-hazards": 5, // p.11, Stage 4 of the Space Hulk Generator
};
const hazardIds = new Set<string>();
const hazardTableIds = new Set<string>();
{
  for (const file of hazardFiles()) {
    const r = HazardTable.array().safeParse(
      JSON.parse(readFileSync(new URL(`./scene-presets/hazards/${file}`, import.meta.url), "utf8")),
    );
    if (!r.success) {
      failed = true;
      console.error(`✖ scene-presets/hazards/${file}\n${z.prettifyError(r.error)}`);
      continue;
    }
    const problem = (message: string) => {
      failed = true;
      console.error(`✖ scene-presets/hazards/${file}: ${message}`);
    };
    for (const t of r.data) {
      if (`${t.source}.json` !== file) problem(`table "${t.id}" is from ${t.source}`);
      if (hazardTableIds.has(t.id)) problem(`duplicate table id "${t.id}"`);
      hazardTableIds.add(t.id);
      if (EXPECTED_HAZARDS[t.id] !== t.rows.length)
        problem(`${t.id}: ${t.rows.length} rows, expected ${EXPECTED_HAZARDS[t.id] ?? "none (not a planned table)"}`);
      for (const row of t.rows) {
        if (hazardIds.has(row.id)) problem(`duplicate hazard id "${row.id}"`);
        hazardIds.add(row.id);
        for (const c of row.conditions) if (!conditionIds.has(c)) problem(`${row.id}: unknown Condition "${c}"`);
        for (const x of row.threats)
          if (!found.includes(x.threatId)) problem(`${row.id}: unknown threat "${x.threatId}"`);
      }
      const tests = t.rows.flatMap((x) => [...x.tests, ...x.variants.flatMap((v) => v.tests)]);
      console.log(
        `scene-presets/hazards/${file} ${t.id}: ${t.rows.length}/${EXPECTED_HAZARDS[t.id]} hazards, ${tests.length} Tests, ` +
          `${t.rows.reduce((n, x) => n + x.conditions.length, 0)} Conditions, ${t.rows.reduce((n, x) => n + x.threats.length, 0)} Threats, ` +
          `${t.rows.filter((x) => x.gm).length + tests.filter((x) => x.gm).length} gm notes` +
          (t.gaps.length || t.overlaps.length
            ? `, as printed: gaps ${t.gaps.join(",") || "none"}, overlaps ${t.overlaps.join(",") || "none"}`
            : ""),
      );
    }
  }
  const pending = Object.keys(EXPECTED_HAZARDS).filter((id) => !hazardTableIds.has(id));
  if (pending.length) console.log(`scene-presets/hazards: not transcribed yet: ${pending.join(", ")}`);
}

// Loot tables (scene-presets/loot/<source>.json, issue #51): the rows each table prints, ids unique across files, every
// catalogue item exists, every `pick` matches something, and a table's `faults` names a fault table in its own file.
const EXPECTED_LOOT: Record<string, number> = {
  "core-trinkets-1": 36, // Core pp.248–249
  "core-trinkets-2": 36,
  "core-trinkets-3": 36,
  "rr1-loot-imperium": 8, // RR1 pp.17–22
  "rr1-loot-chaos": 5,
  "rr1-loot-aeldari": 5,
  "rr1-loot-ork": 4,
  "rr1-loot-weird": 4,
  "rr1-loot-faults": 4,
  "darktide-bounties-warrens": 9, // Darktide pp.15–27
  "darktide-bounties-hab-settlements": 9,
  "darktide-bounties-industrial-works": 9,
  "darktide-bounties-gang-turf": 9,
  "darktide-bounties-militarum-depot": 9,
  "darktide-bounties-quarantine-zone": 9,
  "darktide-bounties-profaned-ground": 9,
  "rr2-holy-relics": 6, // RR2 pp.20–31
  "bg-mission-equipment": 7, // Bloody Gates pp.6, 13, 21, 24
};
{
  const ids = new Set<string>();
  const tableIds = new Set<string>();
  for (const file of lootFiles()) {
    const r = LootTable.array().safeParse(
      JSON.parse(readFileSync(new URL(`./scene-presets/loot/${file}`, import.meta.url), "utf8")),
    );
    const problem = (message: string) => {
      failed = true;
      console.error(`✖ scene-presets/loot/${file}: ${message}`);
    };
    if (!r.success) {
      problem(z.prettifyError(r.error));
      continue;
    }
    for (const t of r.data) {
      tableIds.add(t.id);
      for (const id of [t.id, ...t.rows.map((x) => x.id)]) {
        if (ids.has(id)) problem(`duplicate id "${id}"`);
        ids.add(id);
      }
      if (EXPECTED_LOOT[t.id] !== t.rows.length)
        problem(`${t.id} has ${t.rows.length} rows, expected ${EXPECTED_LOOT[t.id]}`);
      if (t.faults && !r.data.some((x) => x.id === t.faults && x.fault))
        problem(`${t.id}: "${t.faults}" isn't a fault table`);
      const items = t.rows.flatMap((x) => x.items.map((it) => ({ row: x.id, it })));
      for (const { row, it } of items) {
        if (it.wargearId && !wargearIds.has(it.wargearId)) problem(`${row}: unknown wargear "${it.wargearId}"`);
        if (it.pick && !wargearEntries.some((w) => wargearMatches(w, it.pick!, { tier: 4, newTier: 4 })))
          problem(`${row}: its pick matches nothing in the catalogue`);
      }
      console.log(
        `scene-presets/loot/${file} ${t.id}: ${t.rows.length}/${EXPECTED_LOOT[t.id]} rows, ${items.length} items ` +
          `(${items.filter((x) => x.it.pick).length} picks), ${t.rows.filter((x) => x.ammo.length || x.wealth).length} with Ammo or Wealth, ` +
          `${t.rows.filter((x) => x.gm).length} gm notes` +
          (t.gaps.length || t.overlaps.length
            ? `, as printed: gaps ${t.gaps.join(",") || "none"}, overlaps ${t.overlaps.join(",") || "none"}`
            : ""),
      );
    }
  }
  const pending = Object.keys(EXPECTED_LOOT).filter((id) => !tableIds.has(id));
  if (pending.length) console.log(`scene-presets/loot: not transcribed yet: ${pending.join(", ")}`);
}

// The Holy Relic creator (scene-presets/relic-creator.json, RR2 pp.12–19, issue #51 step 8): every table covers its
// dice, one Powers table per kind, every Form's pick matches something in the catalogue, and row ids are unique.
{
  const r = RelicCreator.safeParse(
    JSON.parse(readFileSync(new URL(`./scene-presets/${RELICS_FILE}`, import.meta.url), "utf8")),
  );
  const problem = (message: string) => {
    failed = true;
    console.error(`✖ scene-presets/${RELICS_FILE}: ${message}`);
  };
  if (!r.success) problem(z.prettifyError(r.error));
  else {
    const c = r.data;
    const kinds = new Set(c.powers.map((p) => p.kind));
    if (kinds.size !== c.powers.length) problem("a kind has two Powers tables");
    const rows = [c.form, c.owners, c.anointments, ...c.powers, c.oddities, c.enemies].flatMap((t) => t.rows);
    const ids = new Set(rows.map((x) => x.id));
    if (ids.size !== rows.length) problem("a row id repeats");
    for (const f of c.form.rows)
      if (!wargearEntries.some((w) => wargearMatches(w, f.pick, { tier: 4, newTier: 4 })))
        problem(`${f.id} (${f.name}): its pick matches nothing in the catalogue`);
    const mods = c.powers.flatMap((p) => p.rows.filter((x) => x.mods.length));
    console.log(
      `scene-presets/${RELICS_FILE}: ${c.form.rows.length} Forms, ${c.owners.rows.length} owners, ` +
        `${c.anointments.rows.length} anointments, ${c.powers.length} Powers tables of ${c.powers.map((p) => p.rows.length).join("/")} ` +
        `(${mods.length} with mods, ${c.powers.flatMap((p) => p.rows.filter((x) => x.enemy)).length} naming an enemy), ` +
        `${c.oddities.rows.length} oddities, ${c.enemies.rows.length} enemies`,
    );
  }
}

// The Space Hulk Generator (scene-presets/space-hulk.json, issue #50 step 8): each table holds the rows RR1 pp.7–10
// print, row ids are unique (codex.addHulk takes them), and the longest notes a hulk can get fit GM NOTES' 5,000.
const EXPECTED_HULK = { origin: 5, occupants: 10, objectives: 5, rooms: 21 } as const;
{
  const r = SpaceHulkGenerator.safeParse(
    JSON.parse(readFileSync(new URL(`./scene-presets/${SPACE_HULK_FILE}`, import.meta.url), "utf8")),
  );
  const problem = (message: string) => {
    failed = true;
    console.error(`✖ scene-presets/${SPACE_HULK_FILE}: ${message}`);
  };
  if (!r.success) problem(z.prettifyError(r.error));
  else {
    const g = r.data;
    const ids = new Set<string>();
    for (const [k, n] of Object.entries(EXPECTED_HULK) as [keyof typeof EXPECTED_HULK, number][]) {
      if (g[k].rows.length !== n) problem(`${k}: ${g[k].rows.length} rows, expected ${n}`);
      for (const row of g[k].rows) {
        if (ids.has(row.id)) problem(`duplicate row id "${row.id}"`);
        ids.add(row.id);
      }
    }
    const longest = (rows: HulkRow[]) =>
      rows.reduce((a, b) => (b.name.length + (b.text?.length ?? 0) > a.name.length + (a.text?.length ?? 0) ? b : a));
    const worst = hulkNotes(g, {
      origins: Array(MAX_HULK_ORIGINS).fill(longest(g.origin.rows)),
      occupants: longest(g.occupants.rows),
      objective: longest(g.objectives.rows),
    });
    if (worst.length > 5000) problem(`the longest hulk notes run ${worst.length} characters, over 5000`);
    if (!hazardTableIds.has(HULK_HAZARDS)) problem(`Stage 4's hazard table ${HULK_HAZARDS} is missing`);
    console.log(
      `scene-presets/${SPACE_HULK_FILE}: ` +
        Object.keys(EXPECTED_HULK)
          .map((k) => `${g[k as keyof typeof EXPECTED_HULK].rows.length} ${k}`)
          .join(", ") +
        `, longest hulk notes ${worst.length}/5000` +
        (g.objectives.gaps.length ? `, as printed: objectives gaps ${g.objectives.gaps.join(",")}` : ""),
    );
  }
}

// Critical Hit and Perils tables (lookups/*.json, §11.120): an empty table is not transcribed yet; once it has rows
// the ranges must cover the dice (Perils: no overlaps, only the last open-ended), and every Condition must exist.
{
  const l = lookups();
  const conditions = new Set<string>(CONDITIONS);
  for (const [key, table] of Object.entries(l) as [keyof typeof l, (typeof l)[keyof typeof l]][]) {
    const file = `lookups/${LOOKUP_FILES[key]}`;
    if (!table.rows.length) {
      console.log(`${file}: not transcribed yet`);
      continue;
    }
    const problems =
      key === "criticalHits"
        ? tableProblems({ dice: "d66", rows: table.rows as CritRow[], gaps: [], overlaps: [] })
        : openRangeProblems(table.rows);
    for (const row of table.rows)
      for (const a of row.apply)
        if (a.kind === "condition" && !conditions.has(a.condition))
          problems.push(`${row.name}: unknown Condition "${a.condition}"`);
    for (const message of problems) {
      failed = true;
      console.error(`✖ ${file}: ${message}`);
    }
    console.log(`${file}: ${table.rows.length} rows`);
  }
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
  // The bestiary plus the pack's own threats, which the seeder saves before the beats and NPCs that name them. Their
  // ids are custom-<slug>, derived the way the server derives them (issue #43): one at a time, each seeing the slugs
  // already taken, so two threats with one name here get custom-x and custom-x-2 exactly as seeding will.
  const packSlugs: string[] = [];
  for (const t of r.data.threats) packSlugs.push(threatSlug(t.name, packSlugs));
  const packIds = [...found, ...packSlugs.map(customThreatId)];
  const unknown = r.data.adventures
    .flatMap((a) => a.beats.flatMap((b) => b.encounter.map((e) => e.threatId)))
    .filter((id) => !packIds.includes(id));
  const bestiaryNpcs = r.data.npcs
    .flatMap((n) => (n.statSource.kind === "bestiary" ? [n.statSource.threatId] : []))
    .filter((id) => !packIds.includes(id));
  for (const id of [...unknown, ...bestiaryNpcs]) {
    failed = true;
    console.error(`✖ pack ${name}: unknown threat "${id}"`);
  }
  // A place's book hazards (issue #49) must name a row of scene-presets/hazards, as codex.save checks.
  for (const h of r.data.locations.flatMap((l) => l.hazardList))
    if (h.kind === "book" && !hazardIds.has(h.hazardId)) {
      failed = true;
      console.error(`✖ pack ${name}: unknown hazard "${h.hazardId}"`);
    }
  // An item's catalogue entry (issue #51) must exist, as codex.save checks.
  for (const it of r.data.items)
    if (it.wargearId && !wargearIds.has(it.wargearId)) {
      failed = true;
      console.error(`✖ pack ${name}: unknown wargear "${it.wargearId}"`);
    }
  console.log(
    `pack ${name}: ${r.data.characters.length} characters, ${r.data.npcs.length} NPCs, ${r.data.adventures.reduce((n, a) => n + a.beats.length, 0)} beats${r.data.threats.length ? `, ${r.data.threats.length} own threats` : ""}`,
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

// Places (places/<source>.json, issue #50): the filename names the book, ids are unique across files and start with the
// source id, a parent comes earlier in the same file (so codex.addPlaces copies parents first and nothing loops), and a
// copied place's GM NOTES fit their 5,000 characters (the printed text is cut at a paragraph, rules-flow §11.100).
const placeIds = new Set<string>();
for (const file of placeFiles()) {
  const r = Place.array().safeParse(JSON.parse(readFileSync(new URL(`./places/${file}`, import.meta.url), "utf8")));
  if (!r.success) {
    failed = true;
    console.error(`✖ places/${file}\n${z.prettifyError(r.error)}`);
    continue;
  }
  const problem = (message: string) => {
    failed = true;
    console.error(`✖ places/${file}: ${message}`);
  };
  const here = new Set<string>();
  for (const p of r.data) {
    if (`${p.source}.json` !== file) problem(`"${p.id}" is from ${p.source}`);
    if (!THREAT_SOURCES[p.source].official)
      problem(`"${p.id}": homebrew, but /places serves these files to every campaign`);
    if (!p.id.startsWith(`${p.source}-`)) problem(`"${p.id}" doesn't start with "${p.source}-"`);
    if (placeIds.has(p.id)) problem(`duplicate id "${p.id}"`);
    if (p.parent && !here.has(p.parent)) problem(`"${p.id}": parent "${p.parent}" is unknown or comes later`);
    const notes = placeNotes(p).length;
    if (notes > 5000) problem(`"${p.id}": GM NOTES would be ${notes} characters, over 5,000`);
    placeIds.add(p.id);
    here.add(p.id);
  }
  console.log(
    `places/${file}: ${r.data.length} places (${r.data.filter((p) => !p.parent).length} top level, ${r.data.filter((p) => p.stats.length).length} with a stat line, ${r.data.reduce((n, p) => n + p.hooks.length, 0)} hooks)`,
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
