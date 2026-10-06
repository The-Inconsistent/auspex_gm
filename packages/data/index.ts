import { existsSync, readdirSync, readFileSync } from "node:fs";
import {
  CREATION_TYPES,
  type Creation,
  type CreationType,
  EventTable,
  FactionPreset,
  type HazardRow,
  type LootRow,
  HazardTable,
  HULK_HAZARDS,
  Lookups,
  LootTable,
  RelicCreator,
  NpcPreset,
  Pack,
  Place,
  PoolPresetTable,
  RuleEntry,
  type ScenePresets,
  SkillDn,
  SpaceHulkGenerator,
  Threat,
  Wargear,
} from "@wg/shared";

// Server-side loaders. Parse at startup/seed time, so a bad file fails fast.
const json = (url: URL) => JSON.parse(readFileSync(url, "utf8"));
const jsonFiles = (dir: URL) =>
  readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort();

const threatDir = new URL("./threats/", import.meta.url);
export const threats: ReadonlyMap<string, Threat> = new Map(
  jsonFiles(threatDir)
    .map((f) => Threat.parse(json(new URL(f, threatDir))))
    .map((t) => [t.id, t]),
);

// wargear/<section>.json: arrays of catalogue entries (Core pp.208–246).
const wargearDir = new URL("./wargear/", import.meta.url);
export const wargearList = (): Wargear[] =>
  jsonFiles(wargearDir).flatMap((f) => Wargear.array().parse(json(new URL(f, wargearDir))));
export const wargear: ReadonlyMap<string, Wargear> = new Map(wargearList().map((w) => [w.id, w]));

// rules/<kind>.json: the rules reference, book text served to any seat (Core p.34, pp.177–232).
const rulesDir = new URL("./rules/", import.meta.url);
export const rulesList = (): RuleEntry[] =>
  jsonFiles(rulesDir).flatMap((f) => RuleEntry.array().parse(json(new URL(f, rulesDir))));

// scene-presets/: GM-only book data for building scenes (issue #39): the sample DNs per Skill (Core pp.122–126),
// each book's rolled event tables in <source>.json, its Ruin and Glory lists in pools/<source>.json (issue #40), and
// its hazard tables for places in hazards/<source>.json (issue #49), and the Space Hulk Generator (issue #50 step 8).
const presetsDir = new URL("./scene-presets/", import.meta.url);
export const SKILL_DNS_FILE = "skill-dns.json";
export const SPACE_HULK_FILE = "space-hulk.json";
export const RELICS_FILE = "relic-creator.json"; // RR2 pp.12–19, the Holy Relic creator (issue #51 step 8)
export const eventTableFiles = () =>
  jsonFiles(presetsDir).filter((f) => f !== SKILL_DNS_FILE && f !== SPACE_HULK_FILE && f !== RELICS_FILE);
const poolsDir = new URL("./pools/", presetsDir);
export const poolPresetFiles = () => jsonFiles(poolsDir);
const hazardsDir = new URL("./hazards/", presetsDir);
export const hazardFiles = () => jsonFiles(hazardsDir);
const hazardTables = () => hazardFiles().flatMap((f) => HazardTable.array().parse(json(new URL(f, hazardsDir))));
// Every hazard row by id, for the check that a place's book hazard exists (issue #49).
export const hazards: ReadonlyMap<string, HazardRow> = new Map(
  hazardTables().flatMap((t) => t.rows.map((r) => [r.id, r] as const)),
);
// Stage 4 of the Space Hulk Generator: the rows codex.addHulk accepts as a hulk's hazards (issue #50 step 8).
export const hulkHazardIds: ReadonlySet<string> = new Set(
  hazardTables()
    .find((t) => t.id === HULK_HAZARDS)
    ?.rows.map((r) => r.id),
);
// loot/<source>.json: the books' loot tables and lists of named finds (issue #51).
const lootDir = new URL("./loot/", presetsDir);
export const lootFiles = () => jsonFiles(lootDir);
const lootTables = () => lootFiles().flatMap((f) => LootTable.array().parse(json(new URL(f, lootDir))));
// Every loot row by id with its table, for codex.addLoot (issue #51).
export const loot: ReadonlyMap<string, { table: LootTable; row: LootRow }> = new Map(
  lootTables().flatMap((table) => table.rows.map((row) => [row.id, { table, row }] as const)),
);
export const relics: RelicCreator = RelicCreator.parse(json(new URL(RELICS_FILE, presetsDir)));
export const spaceHulk: SpaceHulkGenerator = SpaceHulkGenerator.parse(json(new URL(SPACE_HULK_FILE, presetsDir)));
// lookups/: the Critical Hit table (Core p.198) and Perils of the Warp, d66 tables the GM reads mid-fight. Served inside
// scenePresets (GM-only); an empty `rows` is a table not transcribed yet.
export const LOOKUP_FILES = { criticalHits: "critical-hits.json", perils: "perils.json" } as const;
export const lookups = (): Lookups =>
  Lookups.parse({
    criticalHits: json(new URL(`./lookups/${LOOKUP_FILES.criticalHits}`, import.meta.url)),
    perils: json(new URL(`./lookups/${LOOKUP_FILES.perils}`, import.meta.url)),
  });
export const scenePresets = (): ScenePresets => ({
  skillDns: SkillDn.array().parse(json(new URL(SKILL_DNS_FILE, presetsDir))),
  tables: eventTableFiles().flatMap((f) => EventTable.array().parse(json(new URL(f, presetsDir)))),
  pools: poolPresetFiles().flatMap((f) => PoolPresetTable.array().parse(json(new URL(f, poolsDir)))),
  hazards: hazardTables(),
  spaceHulk,
  loot: lootTables(),
  relics,
  lookups: lookups(),
});

// faction-presets/<source>.json: GM-only printed factions for CODEX › FACTIONS' ADD FROM BOOK (issue #46), besides the
// creation catalogue's own factions.
const factionPresetsDir = new URL("./faction-presets/", import.meta.url);
export const factionPresetFiles = () => jsonFiles(factionPresetsDir);
export const factionPresetList = (): FactionPreset[] =>
  factionPresetFiles().flatMap((f) => FactionPreset.array().parse(json(new URL(f, factionPresetsDir))));

// npc-presets/<source>.json: GM-only printed NPCs for CODEX › NPCS' ADD FROM BOOK (issue #47), besides the creation
// catalogue's patrons. A file holds the NPCs whose first cite is that book.
const npcPresetsDir = new URL("./npc-presets/", import.meta.url);
export const npcPresetFiles = () => jsonFiles(npcPresetsDir);
export const npcPresetList = (): NpcPreset[] =>
  npcPresetFiles().flatMap((f) => NpcPreset.array().parse(json(new URL(f, npcPresetsDir))));

// places/<source>.json: GM-only printed systems, worlds, sites and rooms for CODEX › LOCATIONS' ADD FROM BOOK (issue
// #50). A file lists parents before the places inside them.
const placesDir = new URL("./places/", import.meta.url);
export const placeFiles = () => jsonFiles(placesDir);
export const placeList = (): Place[] => placeFiles().flatMap((f) => Place.array().parse(json(new URL(f, placesDir))));
export const places: ReadonlyMap<string, Place> = new Map(placeList().map((p) => [p.id, p]));

// creation/<type>/<source>.json: the character-creation catalogue, book text served to seats only (docs/data.md).
const creationDir = new URL("./creation/", import.meta.url);
const creationOf = <K extends CreationType>(type: K) => {
  const dir = new URL(`${type}/`, creationDir);
  try {
    return jsonFiles(dir).flatMap((f): unknown[] =>
      CREATION_TYPES[type].array().parse(json(new URL(f, dir))),
    ) as Creation[K];
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [] as Creation[K]; // not transcribed yet
    throw e;
  }
};
export const creationCatalogue = (): Creation =>
  Object.fromEntries(Object.keys(CREATION_TYPES).map((t) => [t, creationOf(t as CreationType)])) as Creation;

// The repo ships no pack today (campaigns travel as export files), so the folder may be missing.
export const packNames = () => {
  const dir = new URL("./packs/", import.meta.url);
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
};

// packs/<name>/pack.json plus one file per character in packs/<name>/characters/.
export function loadPackRaw(name: string): unknown {
  const dir = new URL(`./packs/${name}/`, import.meta.url);
  const charDir = new URL("characters/", dir);
  let characters: unknown[] = [];
  try {
    characters = jsonFiles(charDir).map((f) => json(new URL(f, charDir)));
  } catch {} // no characters folder is fine
  return { ...json(new URL("pack.json", dir)), characters };
}

export const loadPack = (name: string): Pack => Pack.parse(loadPackRaw(name));
