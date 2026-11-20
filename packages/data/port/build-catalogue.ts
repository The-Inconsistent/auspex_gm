// The creation and wargear catalogues as the ledger builder of InconsisTable reads them (its ADR 0011, decision 2):
// this repo's records with the books' wording removed. Ids, names, keywords, ratings, prices, requirements, grants and
// the order of every array and key are carried as they are; nothing is summarised. Used by the parity tests
// (build.test.ts); nothing here is written to disk.
//
// What changes, and why:
// - The fields that hold printed text are dropped (`TEXT_KEYS`), with the three collections the builder never reads.
// - A `gm` requirement `{ kind, text }` becomes `{ kind, id, label }`. The port puts `id` raw into the GM approval's path
//   where this repo puts `norm(JSON.stringify(requirement))` (build.ts:1817), so `id` is exactly that string: the path
//   of a plain `gm` requirement is the same on both sides. Inside `all`/`either` it can't be (the port serialises the
//   compound with `id` and without the label), nor in one that holds a phrase below, so those are listed in `reworded`.
// - The short strings the port treats as the importer's own words (a `gm` label, a `story` grant, `bonusDice.when`,
//   `XpCost` `plus` and `byChoice[].when`, `WargearFilter` `condition` and `upgrade`) become a neutral phrase numbered
//   across the catalogue, so every one is distinct; `originals[n]` is what phrase `n` stands for, for the comparison.
import { creationCatalogue, wargearList } from "../index.ts";
import type { Schema } from "./engine.ts";

type Json = Record<string, unknown>;

// The record lists the builder reads, with the name of the port's schema for each.
const TYPES = {
  keywords: "Keyword",
  factions: "Faction",
  "sub-factions": "SubFaction",
  species: "Species",
  backgrounds: "BackgroundTable",
  "option-groups": "OptionGroup",
  archetypes: "Archetype",
  talents: "Talent",
  packages: "Package",
  disciplines: "Discipline",
  powers: "PsychicPower",
  languages: "Language",
} as const;

// Printed text, and the transcription's own remarks: rule and record text, Talent, package, power and wargear effects,
// power potency, background objectives, an archetype's suggested build.
const TEXT_KEYS = new Set(["text", "note", "effect", "potency", "objectives", "suggested"]);

// The neutral phrases, by what they stand for. Each is followed by ` ‹n›`, its number in `originals`.
const PHRASES = {
  gm: "The GM decides",
  story: "A story benefit",
  when: "In a set situation",
  byChoice: "By the choice made",
  plus: "An amount the GM adds",
  condition: "A condition the GM judges",
  upgrade: "An upgrade the GM checks",
} as const;
export const PHRASE = new RegExp(`(?:${Object.values(PHRASES).join("|")}) ‹(\\d+)›`, "g");

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, ""); // build.ts:338
const isObject = (x: unknown): x is Json => !!x && typeof x === "object" && !Array.isArray(x);
const hasGm = (r: Json): boolean =>
  r.kind === "gm" || ((r.kind === "all" || r.kind === "either") && (r.of as Json[]).some(hasGm));
// A requirement as the port serialises it into a path: without the label (resolve.ts, the deferred requirements).
const portKey = (r: Json) => norm(JSON.stringify(r, (k, v: unknown) => (k === "label" ? undefined : v)));

export type PortCatalogue = {
  creation: Record<keyof typeof TYPES, Json[]>;
  wargear: ReadonlyMap<string, Json>;
  // What each neutral phrase stands for, by its number.
  originals: string[];
  // Every requirement other than a plain `gm` one whose path segment differs between the two sides: an `all`/`either`
  // with a `gm` one inside (`gm: true`), or one holding a phrase. `auspex` and `port` are the segments, uncut.
  reworded: { where: string; gm: boolean; auspex: string; port: string }[];
  // How many fields of each kind became a phrase or an id.
  converted: Record<string, number>;
};

export function buildCatalogue(schemas: Record<string, Schema>): PortCatalogue {
  const originals: string[] = [];
  const converted: Record<string, number> = {};
  const reworded: PortCatalogue["reworded"] = [];
  const phrase = (kind: keyof typeof PHRASES, original: string) => {
    converted[kind] = (converted[kind] ?? 0) + 1;
    originals.push(original);
    return `${PHRASES[kind]} ‹${originals.length - 1}›`;
  };

  const convert = (x: unknown, where: string): unknown => {
    if (Array.isArray(x)) return x.map((y) => convert(y, where));
    if (!isObject(x)) return x;
    if (x.kind === "gm" && typeof x.text === "string") {
      converted.gmId = (converted.gmId ?? 0) + 1;
      return { kind: "gm", id: norm(JSON.stringify(x)).slice(0, 200), label: phrase("gm", x.text) };
    }
    const out: Json = {};
    for (const [k, v] of Object.entries(x)) {
      if (TEXT_KEYS.has(k)) continue;
      if (k === "story" && typeof v === "string") out[k] = phrase("story", v);
      // A grant's or a price's `when`; a weapon mod's (`kind: "bonusDice"`) is the profile's and stays.
      else if (k === "when" && typeof v === "string" && !("kind" in x))
        out[k] = phrase("bonusDice" in x ? "when" : "byChoice", v);
      else if (k === "plus" && typeof v === "string") out[k] = phrase("plus", v);
      else if ((k === "condition" || k === "upgrade") && typeof v === "string") out[k] = phrase(k, v);
      else out[k] = convert(v, where);
      // A record's own requirements are the ones serialised into a path (build.ts:1817).
      if ((k === "requires" || k === "useRequires") && Array.isArray(v))
        v.forEach((r: Json, i) => {
          const port = portKey((out[k] as Json[])[i]!);
          if (r.kind !== "gm" && norm(JSON.stringify(r)) !== port)
            reworded.push({ where, gm: hasGm(r), auspex: norm(JSON.stringify(r)), port });
        });
    }
    return out;
  };

  // Parsed by the port's own schema; a refusal, or a field the schema doesn't have, names the record.
  const check = (schema: string, record: Json, where: string): Json => {
    const parsed = schemas[schema]!.safeParse(record);
    if (!parsed.success)
      throw new Error(
        `${where}: the port's ${schema} refuses it:\n${parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n")}`,
      );
    const kept = droppedKeys(record, parsed.data, where);
    if (kept) throw new Error(`${kept}: a field the port's ${schema} doesn't have, or in another order`);
    return parsed.data as Json;
  };

  const source = creationCatalogue();
  const creation = Object.fromEntries(
    Object.entries(TYPES).map(([type, schema]) => [
      type,
      (source[type as keyof typeof TYPES] as Json[]).map((r) => {
        const where = `${type}/${String(r.id)}`;
        return check(schema, convert(r, where) as Json, where);
      }),
    ]),
  ) as PortCatalogue["creation"];
  const wargear = new Map(
    wargearList().map((w) => {
      const where = `wargear/${w.id}`;
      return [w.id, check("Wargear", convert(w, where) as Json, where)] as const;
    }),
  );
  return { creation, wargear, originals, reworded, converted };
}

// The first place where `parsed` lost a key of `sent`, or holds them in another order: null when none.
function droppedKeys(sent: unknown, parsed: unknown, at: string): string | null {
  if (Array.isArray(sent)) {
    if (!Array.isArray(parsed) || parsed.length !== sent.length) return at;
    for (const [i, x] of sent.entries()) {
      const bad = droppedKeys(x, parsed[i], `${at}[${i}]`);
      if (bad) return bad;
    }
    return null;
  }
  if (!isObject(sent)) return null;
  if (!isObject(parsed)) return at;
  const keys = Object.keys(sent);
  const order = Object.keys(parsed).filter((k) => k in sent);
  if (keys.some((k, i) => order[i] !== k)) return `${at} {${keys.join(", ")}} → {${order.join(", ")}}`;
  for (const k of keys) {
    const bad = droppedKeys(sent[k], parsed[k], `${at}.${k}`);
    if (bad) return bad;
  }
  return null;
}
