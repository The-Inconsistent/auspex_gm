import { readdirSync, readFileSync } from "node:fs";
import { Threat } from "@wg/shared";

// Server-side loader. Parses at startup, so a bad file fails fast.
const dir = new URL("./threats/", import.meta.url);
export const threats: ReadonlyMap<string, Threat> = new Map(
  readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => Threat.parse(JSON.parse(readFileSync(new URL(f, dir), "utf8"))))
    .map((t) => [t.id, t]),
);
