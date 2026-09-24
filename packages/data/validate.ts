import { readdirSync, readFileSync } from "node:fs";
import { z } from "zod";
import { Pack, Threat, Wargear } from "@wg/shared";
import { loadPackRaw, packNames } from "./index.ts";

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
  if (r.data.source === "core" && !EXPECTED.includes(r.data.id))
    console.warn(`? ${file}: core source but not in the core bestiary list`);
  found.push(r.data.id);
}

const missing = EXPECTED.filter((id) => !found.includes(id));
const core = EXPECTED.length - missing.length;
console.log(`core bestiary: ${core}/${EXPECTED.length}${missing.length ? ` (missing: ${missing.join(", ")})` : ""}`);
console.log(`supplements: ${found.length - core} threats`);
// Wargear catalogue: schema per file, ids unique across files.
const wargearDir = new URL("./wargear/", import.meta.url);
const wargearIds = new Set<string>();
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
  }
  console.log(`wargear/${file}: ${r.data.length} entries`);
}

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

process.exit(failed ? 1 : 0);
