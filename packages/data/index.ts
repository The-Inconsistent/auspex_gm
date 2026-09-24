import { readdirSync, readFileSync } from "node:fs";
import { Pack, Threat, Wargear } from "@wg/shared";

// Server-side loaders. Parse at startup/seed time, so a bad file fails fast.
const json = (url: URL) => JSON.parse(readFileSync(url, "utf8"));
const jsonFiles = (dir: URL) => readdirSync(dir).filter((f) => f.endsWith(".json")).sort();

const threatDir = new URL("./threats/", import.meta.url);
export const threats: ReadonlyMap<string, Threat> = new Map(
  jsonFiles(threatDir).map((f) => Threat.parse(json(new URL(f, threatDir)))).map((t) => [t.id, t]),
);

// wargear/<section>.json: arrays of catalogue entries (Core pp.208–246).
const wargearDir = new URL("./wargear/", import.meta.url);
export const wargearList = (): Wargear[] => jsonFiles(wargearDir).flatMap((f) => Wargear.array().parse(json(new URL(f, wargearDir))));
export const wargear: ReadonlyMap<string, Wargear> = new Map(wargearList().map((w) => [w.id, w]));

export const packNames = () => readdirSync(new URL("./packs/", import.meta.url), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);

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
