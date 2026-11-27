// A campaign export of this app (`CampaignExport`, format `auspex-campaign` 1) as an InconsisTable room document
// (`inconsistable-room` 1, its house decision #74) for the ledger ruleset, with a report of what could not be carried as
// structure. Written with `bun packages/data/port/write.ts --room <export file> <room file>`; the document is a real
// table's content, so it is private and never committed.
//
// The document keeps the export's own ids (the platform gives every row a new one), as this app's own importer
// (apps/api/src/campaign/campaign.service.ts, `writeFile`) keeps its references. What a platform shape cannot hold goes
// into the entry's GM notes as a short labelled line, or a prepared line's note, and is reported; what has no place at
// all is reported as left out. Nothing is cut: a text over the platform's cap refuses the document (`Refusal`) with the
// export path. Custom Threats are not in the document: they are the separate pack (`buildCustomThreatPack`).
import { createHash } from "node:crypto";
import {
  AMMO_TYPES,
  ATTRIBUTE_NAMES,
  CONDITIONS,
  MentionKind,
  TEST_WHO_LABEL,
  onEntryIds,
  type BeatTest,
  type CampaignExport,
  type LocationHazard,
} from "@wg/shared";
import { hazards as bookHazards, wargear } from "../index.ts";
import { remapApproval, type Reworded } from "./build-catalogue.ts";
import { CATALOGUE_PACKS } from "./creation-packs.ts";
import { buildCodexPack, CODEX_PACK, SUMMARY_MAX, testOf } from "./codex-packs.ts";
import { heldKeyOf, MUTATION_PACK } from "./mutations.ts";
import { buildCustomThreatPack, buildPack } from "./pack.ts";
import { buildRuleset, CODEX, COUNTED_KINDS, idOf, itemKindOf } from "./ruleset.ts";
import { buildWorld, HANDOUT_DEFAULT_HEADER, HANDOUT_LAYOUT } from "./world.ts";

/**
 * The platform's caps the converter holds texts and lists to (core-schema's `ROOM_LIMITS`, `CodexTitle`, `CodexText`,
 * `HandoutHeader`, `SessionTitle`, `NextSessionPlace`, `LedgerBuildText`, prep.ts), retyped since that repo is loaded only
 * at run time; room.test.ts holds them equal to it.
 */
export const CAPS = {
  title: 200,
  text: 20_000,
  header: 120,
  sessionTitle: 100,
  sessionText: 10_000,
  place: 200,
  build: 64 * 1024,
  imageBase64: 1_333_336,
  images: 200,
  lineLabel: 80,
  lineNote: 500,
  lines: 40,
  outcomes: 6,
  outcomeLabel: 40,
  outcomeText: 500,
  poolText: 500,
  spawn: 50,
  itemName: 120,
  line: 130,
} as const;

/** Where something the document holds no structure for went: a GM notes line (or a prepared line's note), ordinary
 * text, the export's own words kept as written, or nowhere. */
export type Destination = "gm notes" | "as text" | "as written" | "left out";
export type Note = { path: string; reason: string; to: Destination };

/** The converter refuses the document: a text over its cap, or a value the platform could not take as it is. */
export class Refusal extends Error {
  readonly path: string;
  constructor(path: string, reason: string) {
    super(`${path}: ${reason}`);
    this.path = path;
  }
}

// A `rows` field (house decision #89) holds rows, each its id, the entry it came from and its cells.
type Row = { id: string; from?: { entity: string; key: string; cite?: string }; values: Record<string, unknown> };
type Fields = Record<string, string | number | boolean | string[] | Row[]>;
type Line = { id: string; label?: string; note?: string } & Record<string, unknown>;
export interface Prep {
  roster: Line[];
  tests: Line[];
  pools: Line[];
  exits: Line[];
  reveals: Line[];
  picks?: Line[];
}
export interface RoomEntry {
  id: string;
  kind: "adventure" | "scene" | "npc" | "location" | "faction" | "item" | "handout" | "quest" | "lore";
  title: string;
  body?: string;
  gmNotes?: string;
  visibility?: "party";
  audienceMode?: "listed";
  audience?: string[];
  parentId?: string;
  position?: number;
  links?: string[];
  status?: string;
  fields?: Fields;
  layout?: string;
  header?: string;
  prep?: Prep;
  imageId?: string;
  imageRevealed?: boolean;
  revealedAt?: string;
}
/** An item an Agent carries (InconsisTable's house decision #95): a wargear entry by key, or a name written by hand. */
export interface RoomItem {
  id: string;
  kind: string;
  entry?: string;
  name?: string;
  quantity?: number;
  fittedLine?: string;
  source?: "give" | "hand";
  entryId?: string;
}
export interface RoomActor {
  id: string;
  kind: "pc";
  name: string;
  entityType?: string;
  build?: string;
  fields?: Fields;
  resources?: Record<string, number>;
  conditions?: string[];
  items?: RoomItem[];
}
export interface RoomDocument {
  format: "inconsistable-room";
  version: 1;
  exportedAt?: string;
  room: { name: string; nextSessionAt?: string; nextSessionPlace?: string };
  expects: {
    ruleset: { slug: string; version: string };
    packs: { slug: string; version: string }[];
    world: { slug: string; version: string };
  };
  campaignFields: { tier: number };
  pools: { glory: number; ruin: number };
  actors: RoomActor[];
  codex: RoomEntry[];
  sessions: { title?: string; recap?: string; notes?: string }[];
  images: { id: string; mime: string; base64: string }[];
}

// A document id for a row the export has none for (an objective): a name-based UUID (version 5 layout), so the same
// file gives the same document.
export function uuidOf(name: string): string {
  const h = createHash("sha1").update(name).digest("hex");
  const variant = ((parseInt(h[16]!, 16) & 3) | 8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${variant}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

const TOKEN = new RegExp(`@\\[(?:${MentionKind.options.join("|")}):([0-9a-f-]{36})\\]`, "g");
// The platform's form of a mention (core-schema mention.ts `mentionOf`).
const mentionOf = (id: string, title: string) => `@[${title.replace(/[[\]\n]/g, " ").trim()}](${id})`;
// The roster's view: an unset one is bars in this app (house decision #75).
const VIEW = { hidden: "hidden", bars: "bar", stats: "full" } as const;
const DETAIL = ["appearance", "past", "personality"] as const;
const CONDITION_ID = new Map<string, string>(CONDITIONS.map((c) => [c, idOf(c)]));

/** A Test as a GM notes line: what it rolls, its DN, who, and the GM's plan for it. */
function describeTest(t: BeatTest): string {
  const rolls = t.skill ?? (t.attribute ? ATTRIBUTE_NAMES[t.attribute] : null);
  const head = [`${t.kind} Test`, rolls, t.dn === null ? null : `DN ${t.dn}`, TEST_WHO_LABEL[t.who]];
  const plan = [
    t.purpose,
    t.onSuccess && `On success: ${t.onSuccess}`,
    t.onFailure && `On failure: ${t.onFailure}`,
    ...t.shifts.map((s, i) => `Shift ${i + 1}: ${s}`),
  ];
  return [head.filter(Boolean).join(", "), ...plan.filter(Boolean)].join(". ");
}

function describeHazard(h: LocationHazard): string {
  if (h.kind === "book") {
    const name = bookHazards.get(h.hazardId)?.name ?? h.hazardId;
    return `${name}${h.variant ? ` (${h.variant})` : ""}`;
  }
  return [h.name, h.effect, ...h.tests.map(describeTest)].filter(Boolean).join(". ");
}

// A book hazard's Tests at the intensity the place picked (§11.94).
function bookVariantTests(h: Extract<LocationHazard, { kind: "book" }>) {
  const book = bookHazards.get(h.hazardId);
  return book?.variants.find((v) => v.name === h.variant)?.tests ?? book?.tests ?? [];
}
// The codex pack's hazard summaries and cites, by key, read once.
let codexEntries: Map<string, { summary?: string; cite: string }> | null = null;
const codexHazards = () =>
  (codexEntries ??= new Map(
    buildCodexPack()
      .entries.filter((e) => e.type === "hazard")
      .map((e) => [e.key, { summary: e.body.summary as string | undefined, cite: e.cite }]),
  ));
const hazardSummaries = () => new Map([...codexHazards()].map(([k, v]) => [k, v.summary]));
const codexCite = (key: string) => codexHazards().get(key)?.cite;

/**
 * The room document of an export, and the report. `reworded` is the creation pack's reworded requirements
 * (`buildCreationPacks(...).port.reworded`): a build with a GM approval needs it, since the approval's path moves with
 * the requirement's wording, as build.test.ts moves it (`forPort`).
 */
export function buildRoomDocument(
  exported: CampaignExport,
  { reworded }: { reworded?: readonly Reworded[] } = {},
): { document: RoomDocument; report: Note[] } {
  const { campaign, codex: c } = exported;
  const report: Note[] = [];
  const note = (path: string, reason: string, to: Destination = "left out") => report.push({ path, reason, to });
  const fit = (path: string, text: string, max: number) => {
    if (text.length > max) throw new Refusal(path, `${text.length} characters, over the platform's ${max}`);
    return text;
  };

  // Every entry the document will hold, by id, with its title: the targets of links and mentions.
  const beats = c.adventures.flatMap((a) =>
    [...a.beats].sort((x, y) => x.order - y.order).map((b) => ({ ...b, adventureId: a.id })),
  );
  const titles = new Map<string, string>(
    [
      ...c.factions.map((r) => [r.id, r.name]),
      ...c.npcs.map((r) => [r.id, r.name]),
      ...c.locations.map((r) => [r.id, r.name]),
      ...c.handouts.map((r) => [r.id, r.title]),
      ...c.items.map((r) => [r.id, r.name]),
      ...c.adventures.map((r) => [r.id, r.title]),
      ...beats.map((r) => [r.id, r.title]),
    ].map(([id, t]) => [id!, t!.trim()]),
  );
  const characters = new Set(exported.characters.map((ch) => ch.id));
  const kindOf = (ids: { id: string }[]) => new Set(ids.map((r) => r.id));
  const factions = kindOf(c.factions);
  const locations = kindOf(c.locations);
  const npcs = kindOf(c.npcs);

  // A mention in a body, GM notes, recap or session notes (the texts the platform links) becomes its own form; in any
  // other text, the target's title. One whose target the file does not hold stays as written.
  const mentions = (path: string, text: string, linked: boolean) =>
    text.replace(TOKEN, (token, id: string) => {
      const title = titles.get(id);
      if (title === undefined) {
        note(path, "a mention of an entry not in the file", "as written");
        return token;
      }
      if (linked) return mentionOf(id, title);
      note(path, "a mention outside a body or GM notes, written as its title", "as text");
      return title;
    });
  const linked = (path: string, text: string, max: number = CAPS.text) => fit(path, mentions(path, text, true), max);
  const plain = (path: string, text: string, max: number) => fit(path, mentions(path, text, false), max);
  const title = (path: string, text: string) => {
    const t = plain(path, text, CAPS.title).trim();
    if (!t) throw new Refusal(path, "an entry needs a title");
    return t;
  };
  // GM notes: the GM's own text first, then one labelled line per thing with no field (each reported).
  const notes = (path: string, own: string, lines: { path: string; reason: string; line: string }[]) => {
    for (const l of lines) note(l.path, l.reason, "gm notes");
    const text = [mentions(path, own, true), ...lines.map((l) => mentions(l.path, l.line, true))]
      .filter(Boolean)
      .join("\n\n");
    return fit(path, text, CAPS.text) || undefined;
  };
  // An id this document holds, else nothing (reported).
  const ref = (path: string, id: string | null, held: ReadonlySet<string> | Map<string, string>) => {
    if (id === null) return undefined;
    if (held.has(id)) return id;
    note(path, "a link to an entry not in the file");
    return undefined;
  };
  const nonEmpty = (o: Fields) => (Object.keys(o).length ? o : undefined);

  // ── the packs and pictures ──

  const ledger = buildRuleset({ builder: "ledger" });
  const threatPack = buildPack().pack;
  const custom = c.customThreats.length ? buildCustomThreatPack(exported).pack : null;
  const threatKeys = new Set(threatPack.entries.filter((e) => e.type === "threat").map((e) => e.key));
  const customKeys = new Set(custom?.entries.filter((e) => e.type === "threat").map((e) => e.key));
  const packOf = (threatId: string) =>
    threatId.startsWith("custom-")
      ? { slug: custom?.id, held: customKeys.has(threatId) }
      : { slug: threatPack.id, held: threatKeys.has(threatId) };
  const world = buildWorld();

  const images: RoomDocument["images"] = [];
  exported.images.forEach((p, i) => {
    if (p === null) note(`images.${i}`, "a picture the file could not read");
    else if (images.some((q) => q.id === p.id)) note(`images.${i}`, "a picture repeated in the file");
    else images.push({ id: p.id, mime: p.mime, base64: fit(`images.${i}.base64`, p.base64, CAPS.imageBase64) });
  });
  if (images.length > CAPS.images) throw new Refusal("images", `${images.length} pictures, over ${CAPS.images}`);
  const pictures = new Set(images.map((p) => p.id));
  const picture = (path: string, e: { imageId: string | null; imageRevealed: boolean }) => {
    if (e.imageId === null) return {};
    if (!pictures.has(e.imageId)) {
      note(`${path}.imageId`, "a picture not in the file");
      return {};
    }
    return { imageId: e.imageId, ...(e.imageRevealed && { imageRevealed: true }) };
  };

  // ── characters ──

  const quests: RoomEntry[] = [];
  const actors = exported.characters.map((ch, i): RoomActor => {
    const at = `characters.${i}`;
    const s = ch.stats;
    const fields: Fields = { name: ch.name, xp: ch.xp };
    for (const d of DETAIL) if (ch.detail[d]) fields[`detail.${d}`] = ch.detail[d];
    if (ch.detail.portrait) note(`${at}.detail.portrait`, "a portrait bundled with this app");
    if (ch.traumatic) fields.traumatic = ch.traumatic;
    if (ch.annihilated) fields.annihilated = true;
    // The GM's override of a Trait, in its override field (house decision #96); deriveStats reads it at least 1.
    for (const [k, v] of Object.entries(ch.overrides)) if (v !== undefined) fields[`override.${k}`] = Math.max(1, v);
    // The held Mutations by the Mutation pack's key (the book row's id; a d6 table's row by its own), which the held kind
    // reads and Enduring Life and Blighted Soul too (rules-flow §11.188, §11.191); the name, text and mods are the pack's.
    if (s.mutations.length) fields.mutations = s.mutations.map(heldKeyOf);
    s.mutations.forEach((_, j) => note(`${at}.stats.mutations.${j}`, "a Mutation's printed row: its key is kept"));
    for (const k of Object.keys(s.requisitioned)) note(`${at}.stats.requisitioned.${k}`, "a requisition this session");
    // The items the Agent carries (house decision #95): a wargear entry the pack serves, else a name written by hand.
    const items: RoomItem[] = [];
    const item = (path: string, it: Omit<RoomItem, "id">) => items.push({ id: uuidOf(`${ch.id}/${path}`), ...it });
    const carried = (path: string, id: string | undefined, name: string, kind?: string) => {
      const w = id ? wargear.get(id) : undefined;
      if (w) item(path, { kind: kind ?? itemKindOf(w.kind), entry: w.id, source: "hand" });
      // A hand-made line can say more than an item's name holds: it stays in the report rather than refuse the file.
      else if (name.trim().length > CAPS.itemName) note(path, "a hand-made line longer than an item's name");
      else item(path, { kind: kind ?? "gear", name: name.trim(), source: "hand" });
    };
    // An upgrade fitted in play to a line of the saved build (house decision #102): the armour worn, or a weapon.
    const fitted = (path: string, ids: string[] | undefined, line: string) =>
      ids?.forEach((id, j) => {
        if (ch.build && wargear.get(id)?.kind === "upgrade" && line.length <= CAPS.line)
          item(`${path}.${j}`, { kind: "upgrade", entry: id, fittedLine: line });
        else note(`${path}.${j}`, "an upgrade fitted in play to a line the build does not give");
      });
    fitted(`${at}.stats.armour.fitted`, s.armour.fitted, `armour/${s.armour.name}`);
    // A hand-made sheet has no build line to fit to: `fitted` reports each one.
    s.weapons.forEach((w, j) => fitted(`${at}.stats.weapons.${j}.fitted`, w.fitted, `weapons/${w.name}`));

    let build: string | undefined;
    if (ch.build) {
      let b = ch.build;
      if (b.gm.approved.length) {
        if (!reworded) throw new Refusal(`${at}.build.gm.approved`, "a GM approval needs the creation pack's wording");
        b = { ...b, gm: { ...b.gm, approved: b.gm.approved.map((p) => remapApproval(p, reworded, "auspex", "port")) } };
      }
      build = JSON.stringify(b);
      const bytes = Buffer.byteLength(build);
      if (bytes > CAPS.build) throw new Refusal(`${at}.build`, `${bytes} bytes, over the platform's ${CAPS.build}`);
      if (ch.builtAt !== null) note(`${at}.builtAt`, "the time the build was made");
    } else {
      // A hand-made sheet, as ruleset.test.ts copies a pregen in: the numbers the ruleset has fields for.
      Object.assign(fields, {
        species: s.species,
        archetype: s.archetype,
        keywords: s.keywords,
        baseSpeed: s.speed,
        "armour.ar": s.armour.ar,
        "armour.powered": s.armour.powered,
        ...Object.fromEntries(Object.entries(s.attributes).map(([a, v]) => [`attr.${idOf(a)}`, v])),
        ...Object.fromEntries(Object.entries(s.skills).map(([k, v]) => [`skill.${idOf(k)}`, v])),
        ...Object.fromEntries(Object.entries(s.mods).map(([k, v]) => [`mod.${k}`, v])),
      });
      const sheet = `${at}.stats`;
      // A hand-made sheet's weapons, armour and gear as items carried (issue #327, question 2: the issue's proposal).
      if (s.armour.name) carried(`${sheet}.armour`, s.armour.wargearId, s.armour.name, "armour");
      s.weapons.forEach((w, j) => carried(`${sheet}.weapons.${j}`, w.wargearId, w.name, "weapon"));
      s.gear.forEach((g, j) => carried(`${sheet}.gear.${j}`, undefined, g));
      if (s.armour.invulnerable) note(`${sheet}.armour.invulnerable`, "a hand-made sheet's armour: no field");
      s.armour.traits.forEach((_, j) => note(`${sheet}.armour.traits.${j}`, "a hand-made sheet's armour: no field"));
      for (const list of ["talents", "abilities", "powers", "weaponEffects"] as const)
        s[list]?.forEach((_, j) => note(`${sheet}.${list}.${j}`, `a hand-made sheet's ${list}: no field`));
      s.weapons.forEach((w, j) => {
        // What a carried weapon's line holds beyond its entry or name: the sheet's own profile.
        if (!w.wargearId || !wargear.has(w.wargearId))
          note(`${sheet}.weapons.${j}`, "a hand-made weapon's profile: its name is carried");
      });
    }

    // Absolute values; Wounds and Shock start at 0, the rest as the build or the sheet sets them, so they always go.
    const resources: Record<string, number> = { wrath: ch.wrath, wealth: s.wealth, corruption: s.corruption };
    if (ch.wounds) resources.wounds = ch.wounds;
    if (ch.shock) resources.shock = ch.shock;
    for (const [type, n] of Object.entries(s.ammo))
      if ((AMMO_TYPES as readonly string[]).includes(type)) resources[`ammo${type}`] = n;
      // A write-in type is a counted item by its name (house decision #95); none left is nothing to carry.
      else if (n > 0)
        item(`${at}.stats.ammo.${type}`, {
          kind: "ammo",
          name: fit(`${at}.stats.ammo.${type}`, type, CAPS.itemName),
          quantity: Math.min(n, 999),
          source: "hand",
        });

    const conditions = ch.conditions.flatMap((name, j) => {
      const [, base, stack] = /^(.+?)(?: \((\d+)\))?$/.exec(name) ?? [];
      const id = CONDITION_ID.get(base ?? "");
      if (!id) note(`${at}.conditions.${j}`, "a Condition the ruleset does not have");
      else if (stack) note(`${at}.conditions.${j}`, "a Condition's stack count");
      return id ? [id] : [];
    });

    // The GM's objectives for this Agent, each a quest only that character reads.
    ch.objectives.forEach((o, j) => {
      const p = `${at}.objectives.${j}`;
      const story = o.beatId ?? o.adventureId ?? null;
      const lines = [];
      if (story && titles.has(story))
        lines.push({
          path: `${p}.${o.beatId ? "beatId" : "adventureId"}`,
          reason: "an objective's story link",
          line: `Story: ${mentionOf(story, titles.get(story)!)}`,
        });
      else if (story) note(`${p}.${o.beatId ? "beatId" : "adventureId"}`, "a link to an entry not in the file");
      if (o.rolled)
        lines.push({
          path: `${p}.rolled`,
          reason: "an objective rolled for the session",
          line: "Rolled for the session on the Faction's table",
        });
      quests.push({
        id: uuidOf(`${ch.id}/objective/${j}`),
        kind: "quest",
        title: title(`${p}.text`, o.text),
        gmNotes: notes(p, "", lines),
        status: o.done ? "done" : "open",
        visibility: "party",
        audienceMode: "listed",
        audience: [ch.id],
      });
    });

    return {
      id: ch.id,
      kind: "pc",
      name: ch.name,
      ...(build ? { build } : { entityType: "agent" }),
      fields,
      resources,
      ...(conditions.length > 0 && { conditions }),
      ...(items.length > 0 && { items }),
    };
  });

  // ── the codex ──

  const codex: RoomEntry[] = [];
  const reader = (shown: boolean) => (shown ? { visibility: "party" as const } : {});

  c.factions.forEach((f, i) => {
    const p = `codex.factions.${i}`;
    codex.push({
      id: f.id,
      kind: "faction",
      title: title(`${p}.name`, f.name),
      body: linked(`${p}.notes`, f.notes) || undefined,
      gmNotes: linked(`${p}.secrets`, f.secrets) || undefined,
      fields: {
        stance: f.stance,
        // One word per Keyword (house decision #89), as many and as long as the faction holds them.
        ...(f.keywords.length > 0 && { keywords: f.keywords }),
      },
    });
  });

  c.locations.forEach((l, i) => {
    const p = `codex.locations.${i}`;
    // The place's hazards as rows (house decision #89): a book row by its hazard entry, with its first Test; a
    // hand-made one by its words. What a row cannot hold goes to the GM notes.
    const lines: { path: string; reason: string; line: string }[] = [];
    const hazardRows = l.hazardList.flatMap((h, j) => {
      const hp = `${p}.hazardList.${j}`;
      const tests =
        h.kind === "book" ? (h.variant ? bookVariantTests(h) : (bookHazards.get(h.hazardId)?.tests ?? [])) : [];
      if (h.kind === "book") {
        const book = bookHazards.get(h.hazardId);
        if (!book) {
          lines.push({ path: hp, reason: "a hazard no book prints", line: `Hazard: ${describeHazard(h)}` });
          return [];
        }
        const test = tests
          .map((t) => testOf({ kind: t.kind, skill: t.skills[0], attribute: t.attribute, dn: t.dn }))
          .find(Boolean);
        const summary = hazardSummaries().get(h.hazardId);
        return [
          {
            id: h.id,
            from: { entity: "hazard", key: h.hazardId, cite: codexCite(h.hazardId) },
            values: {
              name: plain(`${hp}.hazardId`, describeHazard(h), 200),
              ...(test && { test }),
              ...(summary && { effect: summary }),
            },
          },
        ];
      }
      const test = h.tests.map(testOf).find(Boolean);
      // A row's Test holds the Test and its inputs, not what it is for.
      h.tests.slice(0, 1).forEach((t) => t.purpose && note(`${hp}.tests.0.purpose`, "a hazard Test's purpose"));
      h.tests.slice(1).forEach((t, k) =>
        lines.push({
          path: `${hp}.tests.${k + 1}`,
          reason: "a hazard's Test past its first",
          line: `Hazard test: ${h.name}: ${describeTest(t)}`,
        }),
      );
      const effect = h.effect.length <= SUMMARY_MAX ? h.effect : "";
      if (h.effect && !effect)
        lines.push({
          path: `${hp}.effect`,
          reason: "a hazard's effect over a row's words",
          line: `Hazard: ${h.name}: ${h.effect}`,
        });
      return [
        {
          id: h.id,
          values: { name: plain(`${hp}.name`, h.name, 200), ...(test && { test }), ...(effect && { effect }) },
        },
      ];
    });
    codex.push({
      id: l.id,
      kind: "location",
      title: title(`${p}.name`, l.name),
      parentId: ref(`${p}.parentId`, l.parentId, locations),
      body: linked(`${p}.description`, l.description) || undefined,
      gmNotes: notes(`${p}.gmNotes`, l.gmNotes, lines),
      fields: nonEmpty({
        ...(l.hazards && { hazards: plain(`${p}.hazards`, l.hazards, CODEX.kinds.location.fields.hazards.maxLength) }),
        ...(hazardRows.length > 0 && { hazardRows }),
      }),
      ...reader(l.revealed),
      ...picture(p, l),
    });
  });

  c.npcs.forEach((n, i) => {
    const p = `codex.npcs.${i}`;
    const fields: Fields = {};
    const lines = [];
    if (n.attitude !== "neutral") fields.attitude = n.attitude;
    if (n.role) fields.role = plain(`${p}.role`, n.role, CODEX.kinds.npc.fields.role.maxLength);
    const src = n.statSource;
    if (src.kind === "bestiary" && packOf(src.threatId).held) fields.stats = src.threatId;
    else if (src.kind === "bestiary")
      lines.push({
        path: `${p}.statSource`,
        reason: "a stat block no pack holds",
        line: `Stat block: ${src.threatId}`,
      });
    else if (src.kind === "quick")
      lines.push({
        path: `${p}.statSource`,
        reason: "a Quick NPC stat block",
        line: `Quick NPC stats (Core p.326): Tier ${src.tier}${src.specialty ? `, ${src.specialty.skill} ${src.specialty.dice}` : ""}`,
      });
    const faction = ref(`${p}.factionId`, n.factionId, factions);
    if (faction) fields.faction = faction;
    if (n.secrets) lines.push({ path: `${p}.secrets`, reason: "an NPC's secrets", line: `Secrets: ${n.secrets}` });
    codex.push({
      id: n.id,
      kind: "npc",
      title: title(`${p}.name`, n.name),
      body: linked(`${p}.description`, n.description) || undefined,
      gmNotes: notes(`${p}.gmNotes`, n.gmNotes, lines),
      fields: nonEmpty(fields),
      ...reader(n.revealed),
      ...picture(p, n),
    });
  });

  c.handouts.forEach((h, i) => {
    const p = `codex.handouts.${i}`;
    // The reveal time orders the phone's inbox (InconsisTable's house decision #86); the import keeps it only on an entry
    // the document reveals, so a sealed handout's is reported.
    const revealedAt = h.revealedAt === null ? null : new Date(h.revealedAt);
    const at = revealedAt && !Number.isNaN(revealedAt.getTime()) ? revealedAt.toISOString() : null;
    if (h.revealedAt !== null && !(h.revealed && at)) note(`${p}.revealedAt`, "the time it was revealed");
    const missing = h.audience.findIndex((a) => !characters.has(a));
    // An empty audience is every player, so a reader the file lacks cannot just be dropped (as this app's importer).
    if (missing >= 0) throw new Refusal(`${p}.audience.${missing}`, "a reader not in the file");
    const header = h.header || HANDOUT_DEFAULT_HEADER[h.style];
    codex.push({
      id: h.id,
      kind: "handout",
      title: title(`${p}.title`, h.title),
      body: linked(`${p}.body`, h.body) || undefined,
      layout: HANDOUT_LAYOUT[h.style],
      ...(header && { header: fit(`${p}.header`, header, CAPS.header) }),
      ...reader(h.revealed),
      ...(h.revealed && at && { revealedAt: at }),
      ...(h.audience.length > 0 && { audienceMode: "listed" as const, audience: h.audience }),
      ...picture(p, h),
    });
  });

  c.items.forEach((it, i) => {
    const p = `codex.items.${i}`;
    const lines = [];
    // The catalogue entry it is, a ref GIVE reads (house decision #95), when the wargear pack serves it.
    const w = it.wargearId ? wargear.get(it.wargearId) : undefined;
    if (it.wargearId && !w)
      lines.push({ path: `${p}.wargearId`, reason: "a catalogue entry", line: `Catalogue: ${it.wargearId}` });
    it.mods.forEach((m, j) =>
      lines.push({ path: `${p}.mods.${j}`, reason: "a relic's Power", line: `Relic Power: ${JSON.stringify(m)}` }),
    );
    const location = ref(`${p}.locationId`, it.locationId, locations);
    const holder = ref(`${p}.npcId`, it.npcId, npcs);
    const given = it.givenTo !== null && characters.has(it.givenTo) ? it.givenTo : null;
    if (it.givenTo !== null && !given) note(`${p}.givenTo`, "a character not in the file");
    // A GIVE puts it in the holder's items, read from the row (house decisions #95, rules-flow §11.112); a counted kind
    // is never given, so it keeps its listing to the holder.
    const kind = w ? itemKindOf(w.kind) : "gear";
    const placed = given !== null && !COUNTED_KINDS.has(kind);
    if (placed) {
      const actor = actors.find((a) => a.id === given)!;
      const name = fit(`${p}.name`, it.name.trim(), CAPS.itemName);
      (actor.items ??= []).push({
        id: uuidOf(`${it.id}/given`),
        kind,
        ...(w ? { entry: w.id } : { name }),
        source: "give",
        entryId: it.id,
      });
    }
    codex.push({
      id: it.id,
      kind: "item",
      title: title(`${p}.name`, it.name),
      body: linked(`${p}.description`, it.description) || undefined,
      gmNotes: notes(`${p}.gmNotes`, it.gmNotes, lines),
      fields: nonEmpty({ ...(location && { location }), ...(holder && { holder }), ...(w && { wargear: w.id }) }),
      ...(given && !placed && { visibility: "party" as const, audienceMode: "listed" as const, audience: [given] }),
    });
  });

  // One scene is played at a time: a file with two active keeps the first, as this app's importer does.
  const playing = beats.find((b) => b.status === "active");
  c.adventures.forEach((a, i) => {
    const p = `codex.adventures.${i}`;
    codex.push({
      id: a.id,
      kind: "adventure",
      title: title(`${p}.title`, a.title),
      gmNotes: linked(`${p}.premise`, a.premise) || undefined,
      fields: {
        status: a.status,
        ...(a.brief && { brief: plain(`${p}.brief`, a.brief, CODEX.kinds.adventure.fields.brief.maxLength) }),
      },
      ...reader(a.shown),
    });
    [...a.beats]
      .sort((x, y) => x.order - y.order)
      .forEach((b, position) => {
        const bp = `${p}.beats.${a.beats.indexOf(b)}`;
        const lines: { path: string; reason: string; line: string }[] = [];
        const status = b.status === "active" && b.id !== playing?.id ? "planned" : b.status;
        if (status !== b.status) note(`${bp}.status`, "a second active scene, made planned", "as text");
        const linkIds: [string, string | null][] = [
          [`${bp}.locationId`, b.locationId],
          ...(["npcIds", "handoutIds", "itemIds"] as const).flatMap((k) =>
            b[k].map((id, j): [string, string] => [`${bp}.${k}.${j}`, id]),
          ),
        ];
        const links = [...new Set(linkIds.flatMap(([path, id]) => ref(path, id, titles) ?? []))];
        // The hazards of its place that apply here.
        const place = c.locations.find((l) => l.id === b.locationId);
        // ... as a pick of its place's hazard rows, each with its switch on when spotted (house decision #89).
        const picked = b.hazards.flatMap((h, j) => {
          if (place?.hazardList.some((x) => x.id === h.id)) return [{ rowId: h.id, on: h.spotted }];
          note(`${bp}.hazards.${j}`, "a hazard its place no longer lists");
          return [];
        });
        const scenePrepared = scenePrep(b, bp, lines);
        const prep =
          picked.length > 0 && place
            ? {
                ...(scenePrepared ?? { roster: [], tests: [], pools: [], exits: [], reveals: [] }),
                picks: [{ id: "pick-0", entryId: place.id, field: "hazardRows", rows: picked }],
              }
            : scenePrepared;
        codex.push({
          id: b.id,
          kind: "scene",
          title: title(`${bp}.title`, b.title),
          parentId: a.id,
          position,
          status,
          body: linked(`${bp}.readAloud`, b.readAloud) || undefined,
          gmNotes: notes(`${bp}.gmNotes`, b.gmNotes, lines),
          fields: {
            type: b.type,
            ...(b.goal && { goal: plain(`${bp}.goal`, b.goal, CODEX.kinds.scene.fields.goal.maxLength) }),
            ...(b.outcome && {
              outcome: plain(`${bp}.outcome`, b.outcome, CODEX.kinds.scene.fields.outcome.maxLength),
            }),
          },
          ...(links.length > 0 && { links }),
          ...(prep && { prep }),
        });
      });
  });

  // A scene's prepared lines (house decisions #73, #75): the encounter, Tests, pool moves, exits and on-entry picks.
  function scenePrep(
    b: (typeof beats)[number],
    bp: string,
    lines: { path: string; reason: string; line: string }[],
  ): Prep | undefined {
    const prep: Prep = { roster: [], tests: [], pools: [], exits: [], reveals: [] };
    const label = (path: string, text: string) => (text ? plain(path, text, CAPS.lineLabel) : undefined);

    b.encounter.forEach((x, j) => {
      const p = `${bp}.encounter.${j}`;
      const { slug, held } = packOf(x.threatId);
      if (!slug || !held) note(`${p}.threatId`, "a Threat no pack holds: a broken line", "as written");
      const mob = x.asMob && x.count > 1;
      if (!mob && x.count > CAPS.spawn) throw new Refusal(`${p}.count`, `${x.count} creatures, over ${CAPS.spawn}`);
      // The marker and what the Threat takes when it joins: the ruleset's spawn options (house decision #92).
      const options = [...x.profiles.map(idOf), ...(x.scale ? ["scaled"] : [])];
      prep.roster.push({
        id: `roster-${j}`,
        ...(x.label && { label: label(`${p}.label`, x.label) }),
        pack: slug ?? threatPack.id,
        key: x.threatId,
        count: mob ? 1 : x.count,
        ...(mob && { mob: x.count }),
        visibility: VIEW[x.visibility ?? "bars"],
        ...(x.marker && { marker: x.marker }),
        ...(options.length > 0 && { options }),
      });
    });

    b.tests.forEach((t, j) => {
      const p = `${bp}.tests.${j}`;
      const target =
        t.kind === "skill"
          ? { testId: "skill", inputs: { skill: idOf(t.skill!) } }
          : t.kind === "attribute"
            ? { testId: "attribute", inputs: { attribute: idOf(t.attribute!) } }
            : t.kind === "influence" || t.kind === "resolve"
              ? { testId: "trait", inputs: { trait: t.kind } }
              : t.kind === "corruption"
                ? { testId: "corruption", inputs: {} }
                : // An Opposed Test is reported, with no DN (p.170): it names what both sides roll.
                  t.kind === "opposed" && (t.skill || t.attribute)
                  ? { testId: "opposed", inputs: { roll: idOf(t.skill ?? t.attribute!) }, reported: true }
                  : null;
      if (!target) {
        lines.push({ path: p, reason: `an ${t.kind} Test: the ruleset has none`, line: `Test: ${describeTest(t)}` });
        return;
      }
      const outcomes = [
        { label: "On success", text: t.onSuccess, at: "onSuccess" },
        { label: "On failure", text: t.onFailure, at: "onFailure" },
        ...t.shifts.map((text, k) => ({ label: `Shift ${k + 1}`, text, at: `shifts.${k}` })),
      ]
        .filter((o) => o.text)
        .map((o) => ({ ...o, text: plain(`${p}.${o.at}`, o.text, CAPS.outcomeText) }));
      const over = outcomes.slice(CAPS.outcomes);
      for (const o of over) note(`${p}.${o.at}`, "a Test's outcome past the platform's six", "gm notes");
      const purpose = mentions(`${p}.purpose`, t.purpose, false);
      const short = purpose.length <= CAPS.lineLabel;
      const words = [short ? "" : purpose, ...over.map((o) => `${o.label}: ${o.text}`)].filter(Boolean).join("\n");
      prep.tests.push({
        id: `test-${j}`,
        ...(short && purpose && { label: purpose }),
        ...(words && { note: fit(`${p}.purpose`, words, CAPS.lineNote) }),
        testId: target.testId,
        // The platform refuses a call that lacks any input its Test declares ("Fill in bonus"). The ruleset's Tests
        // take the bonus dice the GM grants at the table and a switch for a character the Wounded DN does not touch;
        // a prepared Test grants no dice and leaves the switch off. A Test with no DN is asked for one when it is sent.
        inputs:
          "reported" in target
            ? target.inputs
            : { ...target.inputs, ...(t.dn !== null && { dn: t.dn }), bonus: 0, ignoreWounded: false },
        takers: t.who === "each" ? "party" : "pick",
        outcomes: outcomes.slice(0, CAPS.outcomes).map(({ label, text }) => ({ label, text })),
      });
    });

    const pool = (pool: string, amount: number, text: string, path: string, name?: string) =>
      prep.pools.push({
        id: `pool-${prep.pools.length}`,
        ...(name && { label: label(`${path}.name`, name) }),
        pool,
        amount,
        text: plain(`${path}.text`, text, CAPS.poolText),
      });
    b.glory.forEach((g, j) => pool("glory", g.amount, g.text, `${bp}.glory.${j}`));
    b.ruin.forEach((r, j) => pool("ruin", r.amount, r.text, `${bp}.ruin.${j}`));
    b.spends.forEach((s, j) => pool(s.pool, -s.cost, s.text, `${bp}.spends.${j}`, s.name));

    b.exits.forEach((e, j) => {
      const p = `${bp}.exits.${j}`;
      const words = mentions(`${p}.label`, e.label, false).trim();
      const to = e.beatId !== null && beats.some((x) => x.id === e.beatId) ? e.beatId : null;
      if (!to) {
        lines.push({ path: p, reason: "an exit to no scene", line: `Exit: ${words}` });
        return;
      }
      // Over the platform's 80 (this app takes 200): the scene's title is the label, the words its note.
      const fits = words.length > 0 && words.length <= CAPS.lineLabel;
      if (!fits && words) note(`${p}.label`, "an exit's words over 80 characters, as its note", "gm notes");
      prep.exits.push({
        id: `exit-${j}`,
        label: fits ? words : fit(`${p}.label`, titles.get(to)!, CAPS.lineLabel),
        ...(!fits && words && { note: words }),
        sceneId: to,
      });
    });

    const reveal = onEntryIds(b);
    b.onEntry.forEach((id, j) => {
      if (!reveal.includes(id)) note(`${bp}.onEntry.${j}`, "an on-entry pick the scene no longer links");
    });
    for (const id of reveal)
      if (titles.has(id)) prep.reveals.push({ id: `reveal-${prep.reveals.length}`, entryId: id });

    for (const [kind, list] of Object.entries(prep))
      if (list.length > CAPS.lines) throw new Refusal(`${bp}.${kind}`, `${list.length} lines, over ${CAPS.lines}`);
    return Object.values(prep).some((l) => l.length) ? prep : undefined;
  }

  codex.push(...quests);

  // ── the room ──

  const sessions = [...c.sessions]
    .map((s, i) => ({ s, i }))
    .sort((x, y) => x.s.number - y.s.number)
    .map(({ s, i }) => {
      const p = `codex.sessions.${i}`;
      note(`${p}.startedAt`, "the time a session started");
      if (s.endedAt !== null) note(`${p}.endedAt`, "the time a session ended");
      if (s.xp) note(`${p}.xp`, "the XP a session awarded: the sheets hold it");
      return {
        ...(s.title && { title: fit(`${p}.title`, s.title.trim(), CAPS.sessionTitle) }),
        ...(s.recap && { recap: linked(`${p}.recap`, s.recap, CAPS.sessionText) }),
        ...(s.notes && { notes: linked(`${p}.notes`, s.notes, CAPS.sessionText) }),
      };
    });
  // The campaign's premise: a lore entry every seat reads (the owner's decision 2 of 2026-11-26), and what to leave
  // out as the room's safety lines, with the X-Card on as a room starts (InconsisTable's migration 0009): this repo
  // has no X-Card setting to carry.
  const premise = {
    ...(campaign.kind.length > 0 && { kindOfGame: campaign.kind }),
    ...(campaign.framework && { framework: campaign.framework }),
    ...(campaign.frameworkBonus && { frameworkBonus: campaign.frameworkBonus }),
    ...(campaign.patron && { patron: campaign.patron }),
  };
  if (Object.keys(premise).length > 0)
    codex.unshift({
      id: uuidOf(`${campaign.name}/premise`),
      kind: "lore",
      title: "Premise",
      fields: premise,
      visibility: "party",
    });

  const exportedAt = new Date(exported.exportedAt);
  const document: RoomDocument = {
    format: "inconsistable-room",
    version: 1,
    ...(!Number.isNaN(exportedAt.getTime()) && { exportedAt: exportedAt.toISOString() }),
    room: {
      name: campaign.name,
      ...(campaign.nextSessionAt && { nextSessionAt: campaign.nextSessionAt }),
      ...(campaign.nextSessionPlace.trim() && {
        nextSessionPlace: fit("campaign.nextSessionPlace", campaign.nextSessionPlace.trim(), CAPS.place),
      }),
      ...(campaign.limits.length > 0 && { safety: { lines: campaign.limits, veils: [], xCard: true } }),
    },
    expects: {
      ruleset: { slug: ledger.id, version: ledger.version },
      packs: [
        CATALOGUE_PACKS.creation,
        CATALOGUE_PACKS.wargear,
        // The homebrew books are their own pack (#325, rules-flow §11.198): a campaign allowing them expects it.
        ...(campaign.homebrew ? [CATALOGUE_PACKS.homebrew] : []),
        { slug: threatPack.id, version: threatPack.version },
        MUTATION_PACK,
        CODEX_PACK,
        ...(custom ? [{ slug: custom.id, version: custom.version }] : []),
      ],
      world: { slug: world.id, version: world.version },
    },
    campaignFields: { tier: campaign.tier },
    pools: { glory: campaign.glory, ruin: campaign.ruin },
    actors,
    codex: codex.map((e) => JSON.parse(JSON.stringify(e)) as RoomEntry), // without the keys left undefined
    sessions,
    images,
  };
  return { document, report };
}
