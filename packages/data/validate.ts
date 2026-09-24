import { readdirSync, readFileSync } from "node:fs";
import { z } from "zod";
import { Threat } from "@wg/shared";

// Bestiary entries from the Core Rulebook contents page (pp.326-371).
const EXPECTED = [
  "imperial-citizen", "astra-militarum-trooper", "tactical-space-marine", "enforcer", "chrono-gladiator",
  "mutant", "scum", "combat-servitor", "servo-skull",
  "cultist", "cult-leader", "rogue-psyker", "possessed-mortal", "chaos-space-marine", "possessed-chaos-space-marine",
  "bloodletter", "daemonette", "pink-horror", "plaguebearer", "poxwalker", "chaos-spawn",
  "ork-boy", "kommando", "ork-nob", "painboy", "grot", "killa-kan",
  "guardian-defender", "wraithguard", "ranger", "corsair",
  "genestealer", "genestealer-patriarch", "acolyte-hybrid", "neophyte-hybrid", "cult-magus",
];

const dir = new URL("./threats/", import.meta.url);
let failed = false;
const found: string[] = [];

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
  if (r.data.source === "core" && !EXPECTED.includes(r.data.id)) console.warn(`? ${file}: core source but not in the core bestiary list`);
  found.push(r.data.id);
}

const missing = EXPECTED.filter((id) => !found.includes(id));
const core = EXPECTED.length - missing.length;
console.log(`core bestiary: ${core}/${EXPECTED.length}${missing.length ? ` (missing: ${missing.join(", ")})` : ""}`);
console.log(`supplements: ${found.length - core} threats`);
process.exit(failed ? 1 : 0);
