import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { creationCatalogue, wargear } from "@wg/data";
import { SOURCES, officialOnly, type BuildCatalogue, type CreationPayload } from "@wg/shared";

// The character-creation catalogue (packages/data/creation, docs/data.md §9), parsed at startup so a bad file fails fast.
const creation = creationCatalogue();

// What `character.build` resolves against. The whole catalogue: resolveBuild itself refuses homebrew records and rules
// when the campaign doesn't allow them.
export const buildCatalogue = (homebrew: boolean): BuildCatalogue => ({ creation, wargear, homebrew });

// GET /creation's body for each setting of the campaign's homebrew switch, built and gzipped once: about 2 MB of JSON.
type Payload = { json: Buffer; gzip: Buffer; etag: string };
const payloads = new Map<boolean, Payload>();
export function creationPayload(homebrew: boolean): Payload {
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
