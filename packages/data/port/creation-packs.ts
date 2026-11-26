// The creation and wargear packs for InconsisTable's ledger builder (its ADR 0011, stage 2): every record the builder
// reads, as an entry of its kind's entity type (ruleset.ts, `CATALOGUE_KINDS`) carrying the record in `record`, against
// the ledger ruleset (`buildRuleset({ builder: "ledger" })`). The records are `buildCatalogue` in pack mode: no printed
// wording. Patrons, Frameworks and the flavour tables are left out. The homebrew books' records (An Abundance of
// Apocrypha, Legacy of the Necrontyr) are a third pack, attached or not per room (#325): an official record's homebrew
// extras stay on it, and a homebrew wargear an official record names stays in the wargear pack (rules-flow §11.198).
// Written with `bun packages/data/port/write.ts ... --creation <file> --wargear <file> --homebrew <file>`; the packs
// are private content and are never committed.
import { isMeleeProfile, SOURCES, sourceCite, type Source, type WargearWeapon } from "@wg/shared";
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
  effects?: { path: string; mode: "add" | "override"; value: string; phase: "base"; cite: string }[];
}

type Upgrade = { slot: string; exempt?: "max" | "slot"; gmOnly?: boolean; mods: { kind: string }[] };
// An upgrade's printed changes its host's card can hold (house decision #102: `host.<value>`, an integer that reads
// nothing): damage, ED, AP and Salvo of a weapon, the armour's rating (pp.227-228, rules-flow §11.63). The rest (Traits,
// ranges, bonus dice, the GM's own) stay the GM's, counted in `leftOutMods`.
type Effect = NonNullable<CatalogueEntry["effects"]>[number];
function hostEffects(u: Upgrade, cite: string): Effect[] {
  return u.mods.flatMap((m): Effect[] => {
    const x = m as { kind: string; delta?: number; value?: number };
    if (["damage", "ed", "ap", "salvo", "ar"].includes(x.kind) && x.delta !== undefined)
      return [{ path: `host.${x.kind}`, mode: "add" as const, value: String(x.delta), phase: "base" as const, cite }];
    if (x.kind === "setAp" && x.value !== undefined)
      return [{ path: "host.ap", mode: "override" as const, value: String(x.value), phase: "base" as const, cite }];
    return [];
  });
}

// shortcut: record ids are shared between creation kinds (a Keyword, a Faction and a Background table of one name,
// among others), and a pack's keys are unique across its types, so a creation entry's key is `<kind>.<id>` (the kind
// as the builder's `Creation` names it: a key takes no capitals) and only its `record.id` is the id; upgrade when the
// platform keys entries by type, or takes this form for `record`.
export const entryKey = (kind: keyof typeof TYPES, id: string) => `${kind}.${id}`;

// What a strike reads of a carried weapon (InconsisTable's house decision #99): its printed numbers, whether it is
// swung (isMeleeProfile, rules-flow §4) and adds Strength (S + X, pp.211-213), and its Traits as one text, as a list
// cannot be a strike value. ED printed as dice or "Rank" and Traits past a text's length stay the card's.
export const TRAIT_TEXT_MAX = 200;
function weaponValues(w: WargearWeapon | undefined): Record<string, FieldValue> {
  if (!w) return {};
  const traits = w.traits.join(", ");
  return {
    damage: w.damage,
    ...(typeof w.ed === "number" && { ed: w.ed }),
    ...(w.ap !== undefined && { ap: w.ap }),
    ...(typeof w.salvo === "number" && { salvo: w.salvo }),
    melee: isMeleeProfile(w),
    addStrength: w.addStrength,
    ...(traits && traits.length <= TRAIT_TEXT_MAX && { traits }),
  };
}

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
    case "wargear": {
      const u = r.upgrade as Upgrade | undefined;
      return {
        kind: r.kind as string,
        ...(typeof r.value === "number" && { value: r.value }),
        ...(typeof r.rarity === "string" && { rarity: idOf(r.rarity) }),
        ...(Array.isArray(r.keywords) && r.keywords.length > 0 && { keywords: r.keywords as string[] }),
        // A support system shares its slot with the other nine without being one per slot (§11.64): no slot.
        ...(u && u.exempt !== "slot" && { slot: u.slot }),
        ...weaponValues(r.weapon as WargearWeapon | undefined),
      };
    }
    default:
      return {};
  }
}

const entry = (type: CatalogueEntry["type"], key: string, r: Json): CatalogueEntry => {
  const source = r.source as Source;
  const cite = sourceCite({ source, page: r.page as number });
  // A wargear entry's kind is the item kind it is carried as (ruleset.ts, ITEM_KINDS), and Matched Pair is the GM's to
  // fit (Apocrypha p.388, §11.64).
  const u = type === "wargear" ? (r.upgrade as Upgrade | undefined) : undefined;
  const kindTags = type === "wargear" ? [r.kind as string, ...(u?.gmOnly ? ["pair"] : [])] : [];
  const effects = u ? hostEffects(u, cite) : [];
  return {
    key,
    type,
    name: r.name as string,
    tags: [...(SOURCES[source].official ? [source] : [source, "homebrew"]), ...kindTags],
    cite,
    visibility: "party",
    body: bodyOf(type, r),
    record: r,
    ...(effects.length > 0 && { effects }),
  };
};

/** The packs' slugs and versions, which a room document expects (room.ts). */
export const CATALOGUE_PACKS = {
  // 0.1.1: the homebrew records out, into their own pack (#325).
  creation: { slug: "wrath-and-glory-creation", version: "0.1.1" },
  // 0.1.1: the item kind as a tag, Keywords and an upgrade's slot in the body, and its host effects (#325).
  // 0.1.2: a weapon's numbers, melee, Strength and Traits, which a strike reads (#325).
  // 0.1.3: the homebrew records out, but those an official record names (§11.47) (#325).
  wargear: { slug: "wrath-and-glory-wargear", version: "0.1.3" },
  homebrew: { slug: "wrath-and-glory-homebrew", version: "0.1.0" },
} as const;

const pack = (
  { slug, version }: { slug: string; version: string },
  entries: CatalogueEntry[],
): Pack<CatalogueEntry> => ({
  id: slug,
  version,
  ruleset: { id: "wrath-and-glory", range: "^0.2.0" },
  license: "private",
  entries,
});

/** The three packs, from the builder's schemas (`buildSchemas(params)`), and the conversion behind them. */
export function buildCreationPacks(schemas: Record<string, Schema>): {
  creation: Pack<CatalogueEntry>;
  wargear: Pack<CatalogueEntry>;
  homebrew: Pack<CatalogueEntry>;
  port: PortCatalogue;
} {
  const port = buildCatalogue(schemas, { wording: "pack" });
  const creation = (Object.keys(TYPES) as (keyof typeof TYPES)[]).flatMap((kind) =>
    port.creation[kind].map((r) => entry(CATALOGUE_KINDS[kind], entryKey(kind, r.id as string), r)),
  );
  const wargear = [...port.wargear.values()].map((r) => entry("wargear", r.id as string, r));
  const homebrew = (e: CatalogueEntry) => e.tags.includes("homebrew");
  // A homebrew wargear an official record names (its starting gear, rules-flow §11.47) stays with the official ones.
  const named = JSON.stringify(creation.filter((e) => !homebrew(e)).map((e) => e.record));
  const official = (e: CatalogueEntry) =>
    !homebrew(e) || (e.type === "wargear" && named.includes(JSON.stringify(e.key)));
  return {
    creation: pack(CATALOGUE_PACKS.creation, creation.filter(official)),
    wargear: pack(CATALOGUE_PACKS.wargear, wargear.filter(official)),
    homebrew: pack(
      CATALOGUE_PACKS.homebrew,
      [...creation, ...wargear].filter((e) => !official(e)),
    ),
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
