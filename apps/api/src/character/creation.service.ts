import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { creationCatalogue, factionPresetList, npcPresetList, wargear } from "@wg/data";
import {
  NpcPreset,
  SOURCES,
  LOOK_TABLE_IDS,
  THREAT_SOURCES,
  isNameTable,
  mergeCites,
  officialOnly,
  type BuildCatalogue,
  type CreationPayload,
  type FactionPresets,
  type FlavourTable,
  type FrameworkCatalogue,
  type ResolvedBuild,
  type Source,
} from "@wg/shared";
import type { CachedPayload } from "../core/http.ts";

// The character-creation catalogue (packages/data/creation, docs/data.md §9), parsed at startup so a bad file fails fast.
const creation = creationCatalogue();
const printedFactions = factionPresetList(); // faction-presets/<source>.json (issue #46)
const printedNpcs = npcPresetList(); // npc-presets/<source>.json (issue #47)

// What `character.build` resolves against. The whole catalogue: resolveBuild itself refuses homebrew records and rules
// when the campaign doesn't allow them.
export const buildCatalogue = (homebrew: boolean): BuildCatalogue => ({ creation, wargear, homebrew });

// One row of a Background table's Objectives (Core p.43: a d6 each session), or null when the table prints none there.
export const factionObjective = ({ tableId, roll }: { tableId: string; roll: number }) =>
  creation.backgrounds.find((t) => t.id === tableId)?.objectives[roll - 1] ?? null;

// Why a resolved build can't be saved yet, as the builder's refusal reads it, or null when it's ready. Shared by
// `character.build` and the library's PUT, so both refuse in the same words. `gmLater`: the library has no GM, so what
// only a GM judges waits for the campaign's GM after the import (docs/rules-flow.md §11.59).
export function buildRefusal(r: ResolvedBuild, { gmLater = false }: { gmLater?: boolean } = {}): string | null {
  const next = r.pending[0];
  if (next) return `Still to choose: ${next.what}`;
  const problem = r.problems.find((p) => !gmLater || p.severity !== "gm");
  return problem ? `${problem.what}${problem.cite ? ` (${problem.cite})` : ""}` : null;
}

// SETUP's Framework picker (issue #45): the printed patrons and Frameworks, without the homebrew books unless the
// campaign allows them, as /creation filters them.
export function frameworkCatalogue(homebrew: boolean): FrameworkCatalogue {
  const keep = (r: { source: Source }) => homebrew || SOURCES[r.source].official;
  return { patrons: creation.patrons.filter(keep), frameworks: creation.frameworks.filter(keep) };
}

// CODEX › FACTIONS (issue #46): the Keywords the picker suggests, keyword records first and then the ones sub-factions
// fill in ("SPACE WOLVES"), each name once, and the printed factions to start one from, without the homebrew books
// unless the campaign allows them.
export function factionPresets(homebrew: boolean): FactionPresets {
  const keep = (r: { source: Source }) => homebrew || SOURCES[r.source].official;
  const seen = new Set<string>();
  const keywords = [
    ...creation.keywords.filter(keep).map(({ name, text, source, page }) => ({ name, text, source, page })),
    ...creation["sub-factions"]
      .filter(keep)
      .map(({ keyword, source, page }) => ({ name: keyword, text: "", source, page })),
  ].filter((k) => !seen.has(k.name) && seen.add(k.name));
  // ADD FROM BOOK: the creation catalogue's factions, with the Keyword each stands for (docs/data.md §9), then the
  // transcribed ones.
  const presets = [
    ...creation.factions
      .filter(keep)
      .map(({ id, name, source, page, keywords }) => ({ id, name, source, page, keywords, notes: "", secrets: "" })),
    ...printedFactions, // every book with faction presets is official
  ];
  return { keywords, presets };
}

// CODEX › NPCS' ADD FROM BOOK (issue #47): the catalogue's patrons, then the transcribed NPCs, without the homebrew
// books unless the campaign allows them. A patron's printed text runs past GM NOTES' 5,000 characters, so its preset
// carries the cite only; the text stays in SETUP's Framework picker. A transcribed NPC with a patron's id replaces it.
export function npcPresets(homebrew: boolean): NpcPreset[] {
  const keep = (p: NpcPreset) => homebrew || p.cites.every((c) => THREAT_SOURCES[c.source].official);
  const byId = new Map(
    creation.patrons.map(({ id, name, source, page }) => [
      id,
      NpcPreset.parse({ id, name, role: "Patron", cites: [{ source, page }] }),
    ]),
  );
  for (const p of printedNpcs) byId.set(p.id, byId.has(p.id) ? mergeCites(byId.get(p.id)!, p) : p);
  return [...byId.values()].filter(keep);
}

// CODEX › NPCS' ROLL NAME and ROLL LOOK (issue #48): the name lists and the Eye Colour, Hair Colour and Features tables
// (Core pp.27–33), without the homebrew books unless the campaign allows them.
export function flavourTables(homebrew: boolean): FlavourTable[] {
  return creation.flavour.filter(
    (t) =>
      (homebrew || SOURCES[t.source].official) &&
      (isNameTable(t) || (LOOK_TABLE_IDS as readonly string[]).includes(t.id)),
  );
}

// GET /creation's body for each setting of the campaign's homebrew switch, built and gzipped once: about 2 MB of JSON.
const payloads = new Map<boolean, CachedPayload>();
export function creationPayload(homebrew: boolean): CachedPayload {
  const cached = payloads.get(homebrew);
  if (cached) return cached;
  const body: CreationPayload = {
    homebrew,
    creation: homebrew ? creation : officialOnly(creation),
    wargear: [...wargear.values()].filter((w) => homebrew || SOURCES[w.source].official),
  };
  const json = Buffer.from(JSON.stringify(body));
  const payload = { json, gzip: gzipSync(json), etag: `"${createHash("sha1").update(json).digest("base64url")}"` };
  payloads.set(homebrew, payload);
  return payload;
}
