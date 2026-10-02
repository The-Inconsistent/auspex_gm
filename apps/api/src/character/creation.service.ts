import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { creationCatalogue, wargear } from "@wg/data";
import {
  SOURCES,
  officialOnly,
  type BuildCatalogue,
  type CreationPayload,
  type FrameworkCatalogue,
  type ResolvedBuild,
  type Source,
} from "@wg/shared";
import type { CachedPayload } from "../core/http.ts";

// The character-creation catalogue (packages/data/creation, docs/data.md §9), parsed at startup so a bad file fails fast.
const creation = creationCatalogue();

// What `character.build` resolves against. The whole catalogue: resolveBuild itself refuses homebrew records and rules
// when the campaign doesn't allow them.
export const buildCatalogue = (homebrew: boolean): BuildCatalogue => ({ creation, wargear, homebrew });

// Why a resolved build can't be saved yet, as the builder's refusal reads it, or null when it's ready. Shared by
// `character.build` and the library's PUT, so both refuse in the same words. `gmLater`: the library has no GM, so what
// only a GM judges waits for the campaign's GM after the import (docs/rules-flow.md §11.59).
export function buildRefusal(r: ResolvedBuild, { gmLater = false }: { gmLater?: boolean } = {}): string | null {
  const next = r.pending[0];
  if (next) return `Still to choose: ${next.what}`;
  const problem = r.problems.find((p) => !gmLater || p.severity !== "gm");
  return problem ? `${problem.what}${problem.cite ? ` (${problem.cite})` : ""}` : null;
}

// PARTY's Framework picker (issue #45): the printed patrons and Frameworks, without the homebrew books unless the
// campaign allows them, as /creation filters them.
export function frameworkCatalogue(homebrew: boolean): FrameworkCatalogue {
  const keep = (r: { source: Source }) => homebrew || SOURCES[r.source].official;
  return { patrons: creation.patrons.filter(keep), frameworks: creation.frameworks.filter(keep) };
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
