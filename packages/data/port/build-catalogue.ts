// The creation and wargear catalogues as the ledger builder of InconsisTable reads them (its ADR 0011, decision 2):
// this repo's records with the books' wording removed. Ids, names, keywords, ratings, prices, requirements, grants and
// the order of every array and key are carried as they are; nothing is summarised. Two modes:
// - `parity` (the parity tests, build.test.ts; never written to disk): the conversion the port must resolve exactly
//   as this repo does, phrases numbered across the catalogue and a `gm` requirement's id its path segment.
// - `pack` (the creation and wargear packs, creation-packs.ts): no printed wording at all. A `gm` requirement's id is
//   a short hash of that path segment, phrases are numbered within their record, and a weapon mod's `bonusDice.when`
//   and `gm.what` become phrases too.
//
// What changes, and why:
// - The fields that hold printed text are dropped (`TEXT_KEYS`), with the three collections the builder never reads.
// - A `gm` requirement `{ kind, text }` becomes `{ kind, id, label }`. The port puts `id` raw into the GM approval's path
//   where this repo puts `norm(JSON.stringify(requirement))` (build.ts:1817). In parity mode `id` is exactly that
//   string, so the path of a plain `gm` requirement is the same on both sides; in pack mode it is `gm-` and 12 hex
//   digits of its SHA-256. Every requirement whose path segment differs between the two sides is listed in `reworded`:
//   `remapApproval` moves an approval path from one side to the other (a campaign's builds need it when imported).
// - The short strings the port treats as the importer's own words (a `gm` label, a `story` grant, `bonusDice.when`,
//   `XpCost` `plus` and `byChoice[].when`, `WargearFilter` `condition` and `upgrade`, and in pack mode a weapon mod's
//   `bonusDice.when` and `gm.what`) become a neutral numbered phrase; `phrases` says what each one stands for.
import { createHash } from "node:crypto";
import { creationCatalogue, wargearList } from "../index.ts";
import type { Schema } from "./engine.ts";

type Json = Record<string, unknown>;

// The record lists the builder reads, with the name of the port's schema for each.
export const TYPES = {
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
export const TEXT_KEYS = new Set(["text", "note", "effect", "potency", "objectives", "suggested"]);

// The neutral phrases, by what they stand for. Each is followed by ` ‹n›`: in parity mode its index in `phrases`, in
// pack mode its number within the record (from 1).
const PHRASES = {
  gm: "The GM decides",
  story: "A story benefit",
  when: "In a set situation",
  byChoice: "By the choice made",
  plus: "An amount the GM adds",
  condition: "A condition the GM judges",
  upgrade: "An upgrade the GM checks",
  what: "A change the GM makes",
} as const;
export type PhraseKind = keyof typeof PHRASES;
// Group 1 is the phrase's words, group 2 its number.
export const PHRASE = new RegExp(`(${Object.values(PHRASES).join("|")}) ‹(\\d+)›`, "g");
export const PHRASE_KIND = Object.fromEntries(Object.entries(PHRASES).map(([k, v]) => [v, k])) as Record<
  string,
  PhraseKind
>;

export const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, ""); // build.ts:338
const isObject = (x: unknown): x is Json => !!x && typeof x === "object" && !Array.isArray(x);
const hasGm = (r: Json): boolean =>
  r.kind === "gm" || ((r.kind === "all" || r.kind === "either") && (r.of as Json[]).some(hasGm));
// A requirement as the port serialises it into a path (resolve.ts, the deferred requirements): a `gm` one by its id,
// any other without the labels inside it.
const portKey = (r: Json) =>
  r.kind === "gm" ? (r.id as string) : norm(JSON.stringify(r, (k, v: unknown) => (k === "label" ? undefined : v)));
// The pack's id of a `gm` requirement: a hash of the segment this repo puts in its path, so no wording is carried.
export const gmId = (auspexSegment: string) =>
  `gm-${createHash("sha256").update(auspexSegment).digest("hex").slice(0, 12)}`;

export type Wording = "parity" | "pack";
export type Reworded = { where: string; gm: boolean; auspex: string; port: string };
export type PortCatalogue = {
  creation: Record<keyof typeof TYPES, Json[]>;
  wargear: ReadonlyMap<string, Json>;
  // What each neutral phrase stands for, with the record (`<type>/<id>`) it is in.
  phrases: { where: string; kind: PhraseKind; phrase: string; original: string }[];
  // Every requirement whose path segment differs between the two sides (in parity mode, other than a plain `gm` one,
  // whose path is the same once cut at 200): `gm: true` when a `gm` one is in it. `auspex` and `port` are the segments,
  // uncut. This is the map from this repo's approval paths to the port's (`remapApproval`).
  reworded: Reworded[];
  // How many fields of each kind became a phrase or an id.
  converted: Record<string, number>;
};

const REQUIRES = "/requires/";
// An approval path `<origin>/requires/<segment>` (cut at 200) moved from one side to the other through `reworded`: the
// segment found by `from` is rewritten to `to`. Any other path is returned as it is.
export function remapApproval(
  path: string,
  reworded: readonly Reworded[],
  from: "auspex" | "port",
  to: "auspex" | "port",
): string {
  const at = path.indexOf(REQUIRES);
  if (at < 0) return path;
  const origin = path.slice(0, at);
  const segment = path.slice(at + REQUIRES.length);
  // A segment cut at 200 is the start of one.
  const hit = reworded.find((r) => r[from] === segment || (path.length === 200 && r[from].startsWith(segment)));
  return hit ? `${origin}${REQUIRES}${hit[to]}`.slice(0, 200) : path;
}

export function buildCatalogue(
  schemas: Record<string, Schema>,
  { wording = "parity" }: { wording?: Wording } = {},
): PortCatalogue {
  const pack = wording === "pack";
  const phrases: PortCatalogue["phrases"] = [];
  const converted: Record<string, number> = {};
  const reworded: PortCatalogue["reworded"] = [];
  let inRecord = 0; // phrases so far in the record being converted
  const phrase = (kind: PhraseKind, original: string, where: string) => {
    converted[kind] = (converted[kind] ?? 0) + 1;
    const p = `${PHRASES[kind]} ‹${pack ? ++inRecord : phrases.length}›`;
    phrases.push({ where, kind, phrase: p, original });
    return p;
  };

  const convert = (x: unknown, where: string): unknown => {
    if (Array.isArray(x)) return x.map((y) => convert(y, where));
    if (!isObject(x)) return x;
    if (x.kind === "gm" && typeof x.text === "string") {
      converted.gmId = (converted.gmId ?? 0) + 1;
      const segment = norm(JSON.stringify(x));
      return { kind: "gm", id: pack ? gmId(segment) : segment.slice(0, 200), label: phrase("gm", x.text, where) };
    }
    const out: Json = {};
    for (const [k, v] of Object.entries(x)) {
      if (TEXT_KEYS.has(k)) continue;
      if (k === "story" && typeof v === "string") out[k] = phrase("story", v, where);
      // A grant's or a price's `when`. A weapon mod's (`kind: "bonusDice"`) is the profile's: kept in parity mode.
      else if (k === "when" && typeof v === "string" && !("kind" in x))
        out[k] = phrase("bonusDice" in x ? "when" : "byChoice", v, where);
      else if (pack && k === "when" && typeof v === "string" && x.kind === "bonusDice")
        out[k] = phrase("when", v, where);
      else if (pack && k === "what" && typeof v === "string" && x.kind === "gm") out[k] = phrase("what", v, where);
      else if (k === "plus" && typeof v === "string") out[k] = phrase("plus", v, where);
      else if ((k === "condition" || k === "upgrade") && typeof v === "string") out[k] = phrase(k, v, where);
      else out[k] = convert(v, where);
      // A record's own requirements are the ones serialised into a path (build.ts:1817).
      if ((k === "requires" || k === "useRequires") && Array.isArray(v))
        v.forEach((r: Json, i) => {
          const auspex = norm(JSON.stringify(r));
          const port = portKey((out[k] as Json[])[i]!);
          if ((pack || r.kind !== "gm") && auspex !== port) reworded.push({ where, gm: hasGm(r), auspex, port });
        });
    }
    return out;
  };
  const record = (r: Json, where: string) => {
    inRecord = 0;
    return convert(r, where) as Json;
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
        return check(schema, record(r, where), where);
      }),
    ]),
  ) as PortCatalogue["creation"];
  const wargear = new Map(
    wargearList().map((w) => {
      const where = `wargear/${w.id}`;
      return [w.id, check("Wargear", record(w, where), where)] as const;
    }),
  );
  return { creation, wargear, phrases, reworded, converted };
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
