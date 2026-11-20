// The creation and wargear packs for InconsisTable's ledger builder (its ADR 0011, stage 2): every record the builder
// reads, as an entry of its kind's entity type (ruleset.ts, `CATALOGUE_KINDS`) carrying the record in `record`, against
// the ledger ruleset (`buildRuleset({ builder: "ledger" })`). The records are `buildCatalogue` in pack mode: no printed
// wording. Patrons, Frameworks and the flavour tables are left out. Written with
// `bun packages/data/port/write.ts ... --creation <file> --wargear <file>`; both packs are private content and are
// never committed.
import { SOURCES, sourceCite, type Source } from "@wg/shared";
import { TYPES, buildCatalogue, type PortCatalogue } from "./build-catalogue.ts";
import type { Schema } from "./engine.ts";
import type { FieldValue, Pack } from "./pack.ts";
import { CATALOGUE_KINDS, idOf } from "./ruleset.ts";

type Json = Record<string, unknown>;
export interface CatalogueEntry {
  key: string;
  type: (typeof CATALOGUE_KINDS)[keyof typeof CATALOGUE_KINDS];
  name: string;
  tags: string[];
  cite: string;
  visibility: "party";
  body: Record<string, FieldValue>;
  record: Json;
}

// shortcut: record ids are shared between creation kinds (a Keyword, a Faction and a Background table of one name,
// among others), and a pack's keys are unique across its types, so a creation entry's key is `<type>.<id>` and only
// its `record.id` is the id; upgrade when the platform keys entries by type, or takes this form for `record`.
export const entryKey = (type: string, id: string) => `${type}.${id}`;

// The record's flat numbers (ruleset.ts, `catalogueEntities`); a price is repeated only when it is a plain number.
function bodyOf(type: CatalogueEntry["type"], r: Json): Record<string, FieldValue> {
  const xp: Record<string, FieldValue> = typeof r.xp === "number" ? { xp: r.xp } : {};
  switch (type) {
    case "archetype":
      return { tier: r.tier as number, ...xp };
    case "species":
      return { ...xp, speed: r.speed as number };
    case "talent":
    case "package":
    case "power":
      return xp;
    case "wargear":
      return {
        kind: r.kind as string,
        ...(typeof r.value === "number" && { value: r.value }),
        ...(typeof r.rarity === "string" && { rarity: idOf(r.rarity) }),
      };
    default:
      return {};
  }
}

const entry = (type: CatalogueEntry["type"], key: string, r: Json): CatalogueEntry => {
  const source = r.source as Source;
  return {
    key,
    type,
    name: r.name as string,
    tags: SOURCES[source].official ? [source] : [source, "homebrew"],
    cite: sourceCite({ source, page: r.page as number }),
    visibility: "party",
    body: bodyOf(type, r),
    record: r,
  };
};

const pack = (id: string, entries: CatalogueEntry[]): Pack<CatalogueEntry> => ({
  id,
  version: "0.1.0",
  ruleset: { id: "wrath-and-glory", range: "^0.2.0" },
  license: "private",
  entries,
});

/** Both packs, from the builder's schemas (`buildSchemas(params)`), and the conversion behind them. */
export function buildCreationPacks(schemas: Record<string, Schema>): {
  creation: Pack<CatalogueEntry>;
  wargear: Pack<CatalogueEntry>;
  port: PortCatalogue;
} {
  const port = buildCatalogue(schemas, { wording: "pack" });
  const creation = (Object.keys(TYPES) as (keyof typeof TYPES)[]).flatMap((kind) =>
    port.creation[kind].map((r) => entry(CATALOGUE_KINDS[kind], entryKey(CATALOGUE_KINDS[kind], r.id as string), r)),
  );
  const wargear = [...port.wargear.values()].map((r) => entry("wargear", r.id as string, r));
  return {
    creation: pack("wrath-and-glory-creation", creation),
    wargear: pack("wrath-and-glory-wargear", wargear),
    port,
  };
}

/** The catalogue as the builder reads it, read back from the packs' records by their entity type. */
export function catalogueOf(packs: Pack<CatalogueEntry>[]): {
  creation: PortCatalogue["creation"];
  wargear: Map<string, Json>;
} {
  const kindOf = Object.fromEntries(Object.entries(CATALOGUE_KINDS).map(([k, t]) => [t, k]));
  const creation = Object.fromEntries(Object.keys(TYPES).map((k) => [k, [] as Json[]])) as PortCatalogue["creation"];
  const wargear = new Map<string, Json>();
  for (const e of packs.flatMap((p) => p.entries)) {
    const kind = kindOf[e.type]!;
    if (kind === "wargear") wargear.set(e.record.id as string, e.record);
    else creation[kind as keyof typeof TYPES].push(e.record);
  }
  return { creation, wargear };
}
