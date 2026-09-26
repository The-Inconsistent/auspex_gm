import { readdirSync, readFileSync } from "node:fs";
import { CREATION_TYPES, type Creation, type CreationType, Pack, RuleEntry, Threat, Wargear } from "@wg/shared";

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
