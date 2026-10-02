import { readdirSync, readFileSync } from "node:fs";
import {
  CREATION_TYPES,
  type Creation,
  type CreationType,
  EventTable,
  FactionPreset,
  Pack,
  PoolPresetTable,
  RuleEntry,
  type ScenePresets,
  SkillDn,
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
// each book's rolled event tables in <source>.json, and its Ruin and Glory lists in pools/<source>.json (issue #40).
const presetsDir = new URL("./scene-presets/", import.meta.url);
export const SKILL_DNS_FILE = "skill-dns.json";
export const eventTableFiles = () => jsonFiles(presetsDir).filter((f) => f !== SKILL_DNS_FILE);
const poolsDir = new URL("./pools/", presetsDir);
export const poolPresetFiles = () => jsonFiles(poolsDir);
export const scenePresets = (): ScenePresets => ({
  skillDns: SkillDn.array().parse(json(new URL(SKILL_DNS_FILE, presetsDir))),
  tables: eventTableFiles().flatMap((f) => EventTable.array().parse(json(new URL(f, presetsDir)))),
  pools: poolPresetFiles().flatMap((f) => PoolPresetTable.array().parse(json(new URL(f, poolsDir)))),
});

// faction-presets/<source>.json: GM-only printed factions for CODEX › FACTIONS' ADD FROM BOOK (issue #46), besides the
// creation catalogue's own factions.
const factionPresetsDir = new URL("./faction-presets/", import.meta.url);
export const factionPresetFiles = () => jsonFiles(factionPresetsDir);
export const factionPresetList = (): FactionPreset[] =>
  factionPresetFiles().flatMap((f) => FactionPreset.array().parse(json(new URL(f, factionPresetsDir))));

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

export const packNames = () =>
  readdirSync(new URL("./packs/", import.meta.url), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

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
