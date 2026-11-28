import { z } from "zod";
import { CharacterBuild } from "./build.ts";
import { CodexInput, ImageMime } from "./codex.ts";
import { parseMentions } from "./mention.ts";
import { CUSTOM_THREAT_CAP, CustomThreat } from "./threat.ts";
import { CharacterDetail, CharacterStats, Objectives, Overrides, TableLines, Tier } from "./state.ts";

// A campaign as a file: the GM's EXPORT, loaded back by the lobby's IMPORT GAME as a new campaign. Rows keep their old
// ids so references resolve inside the file; the importer gives every row a fresh id. Seats (members, invites, guest
// tokens) belong to accounts and never travel, and neither does a running fight.

const id = z.uuid();
const count = z.number().int().min(0).max(10_000);

export const CampaignExport = z.object({
  format: z.literal("auspex-campaign"),
  version: z.literal(1),
  exportedAt: z.string().max(40),
  campaign: z.object({
    name: z.string().min(1).max(100),
    tier: Tier,
    glory: count,
    ruin: count,
    framework: z.string().max(5000),
    frameworkBonus: z.string().max(1000).default(""), // files from before issue #45 have none
    patron: z.string().max(200),
    kind: TableLines.default([]), // files from before the NEW CAMPAIGN flow have none
    limits: TableLines.default([]),
    homebrew: z.boolean(),
    // Files from before issue #197 have no next session. A date that doesn't parse is dropped, not the file.
    nextSessionAt: z.iso.datetime({ offset: true }).nullable().catch(null),
    nextSessionPlace: z.string().max(200).default(""),
  }),
  characters: z
    .array(
      z.object({
        id,
        name: z.string().min(1).max(100),
        stats: CharacterStats,
        overrides: Overrides,
        build: CharacterBuild.nullable(),
        builtAt: z.number().int().nullable(),
        wounds: count,
        shock: count,
        wrath: count,
        traumatic: count,
        annihilated: z.boolean(),
        xp: count,
        conditions: z.array(z.string().max(60)).max(30),
        detail: CharacterDetail,
        objectives: Objectives,
      }),
    )
    .max(50),
  codex: z.object({
    factions: z.array(CodexInput.faction.extend({ id })).max(500),
    adventures: z
      .array(
        CodexInput.adventure
          .extend({ id })
          .extend({ beats: z.array(CodexInput.beat.extend({ id }).extend({ order: count })).max(500) }),
      )
      .max(200),
    locations: z.array(CodexInput.location.extend({ id })).max(1000),
    // `followsId`: the Agent in this file it was given to (issue #350), or nobody; files from before have none.
    npcs: z.array(CodexInput.npc.extend({ id }).extend({ followsId: id.nullable().default(null) })).max(1000),
    handouts: z
      .array(CodexInput.handout.extend({ id }).extend({ revealedAt: z.string().max(40).nullable() }))
      .max(1000),
    // Files from before issue #51 have none. `givenTo` is a character in this file, or nobody.
    items: z
      .array(CodexInput.item.extend({ id }).extend({ givenTo: id.nullable() }))
      .max(1000)
      .default([]),
    sessions: z
      .array(
        z.object({
          id,
          number: count,
          title: z.string().max(100).default(""), // files from before issue #175 have none
          startedAt: z.string().max(40),
          endedAt: z.string().max(40).nullable(),
          recap: z.string().max(10000),
          notes: z.string().max(10000).default(""), // files from before issue #195 have none
          xp: count,
        }),
      )
      .max(1000),
    // Custom threats (issue #43). Keyed by `custom-<slug>`, not by a row id, so the importer doesn't remap them.
    // Defaulted, so a file written before they existed still imports.
    customThreats: z.array(CustomThreat).max(CUSTOM_THREAT_CAP).default([]),
  }),
  // The codex pictures (issue #199), so a file is a whole backup: NPCs, places and handouts name them by `imageId`, which
  // the importer remaps with the rest. A picture is a nice-to-have, so a bad one never refuses the file: it parses as
  // null, and the importer leaves it out and counts it. No length cap here: the body limit bounds the list, and the
  // store's caps (200, 100 MB) drop and count the rest, where a capped list would lose every picture without a word.
  // Files from before pictures, or with no list at all, have none.
  images: z
    .array(
      z
        .object({ id, mime: ImageMime, base64: z.base64().max(1_400_000) }) // a 1 MB picture is about 1.34 MB of base64
        .nullable()
        .catch(null),
    )
    .catch([]),
});
export type CampaignExport = z.infer<typeof CampaignExport>;

// The biggest file IMPORT GAME takes: the api's parser, Next's proxy buffer and Cloudflare's free plan all stop here.
export const IMPORT_MAX_BYTES = 100 * 1024 * 1024;

// The same campaign for a new group: no sessions and no date for the next, empty pools, nothing revealed, every Agent
// rested, and no kind of game or limits, which the new table agrees for itself (Core p.316, rules-flow §11.79). Sheets, builds and XP stay, since a
// build's XP ledger is spent against `xp`. Given items stay given, because the sheets keep their gear.
export function freshStart(e: CampaignExport): CampaignExport {
  const { codex: c } = e;
  return {
    ...e,
    campaign: { ...e.campaign, glory: 0, ruin: 0, kind: [], limits: [], nextSessionAt: null, nextSessionPlace: "" },
    characters: e.characters.map((ch) => ({
      ...ch,
      wounds: 0,
      shock: 0,
      wrath: 2, // p.162
      traumatic: 0,
      annihilated: false,
      conditions: [],
      objectives: ch.objectives.filter((o) => !o.rolled).map((o) => ({ ...o, done: false })), // a rolled one was its session's
    })),
    codex: {
      ...c,
      adventures: c.adventures.map((a) => ({
        ...a,
        status: "planned",
        shown: false,
        beats: a.beats.map((b) => ({
          ...b,
          status: "planned",
          outcome: "",
          hazards: b.hazards.map((h) => ({ ...h, spotted: false })),
        })),
      })),
      locations: c.locations.map((l) => ({ ...l, revealed: false, imageRevealed: false })),
      npcs: c.npcs.map((n) => ({ ...n, revealed: false, imageRevealed: false })),
      handouts: c.handouts.map((h) => ({ ...h, revealed: false, imageRevealed: false, revealedAt: null })),
      sessions: [],
    },
  };
}

// IMPORT ADVENTURE: the picked adventures out of a campaign file, with what their scenes link to (places and the places
// they sit in, NPCs and their factions, handouts, items and who holds them, custom threats, pictures) and the entries
// their own texts @mention, one level deep. The characters a handout's audience names ride along for the importer to
// match by name; it never inserts them. Nothing is given to an Agent: the live sheets don't carry the file's gear.
// Slicing a slice by all its adventures gives it back unchanged, so the api re-slices what the browser sent.
export function sliceAdventures(e: CampaignExport, adventureIds: readonly string[]): CampaignExport {
  const { codex: c } = e;
  const picked = new Set(adventureIds);
  const adventures = c.adventures.filter((a) => picked.has(a.id));
  const beats = adventures.flatMap((a) => a.beats);
  const linked = new Set<string>(
    [...adventures, ...beats]
      .flatMap((r) => Object.values(r))
      .flatMap((v) => (typeof v === "string" ? parseMentions(v) : []))
      .flatMap((p) => ("id" in p ? [p.id] : [])),
  );
  for (const b of beats)
    for (const id of [b.locationId, ...b.npcIds, ...b.handoutIds, ...b.itemIds]) if (id) linked.add(id);
  const items = c.items.filter((i) => linked.has(i.id));
  for (const i of items) for (const id of [i.locationId, i.npcId]) if (id) linked.add(id);
  const npcs = c.npcs.filter((n) => linked.has(n.id));
  for (const n of npcs) if (n.factionId) linked.add(n.factionId);
  // Stops at a place already in, so a hand-edited loop ends too; the importer refuses that file anyway.
  const parentOf = new Map(c.locations.map((l) => [l.id, l.parentId]));
  for (const id of [...linked]) for (let p = parentOf.get(id); p && !linked.has(p); p = parentOf.get(p)) linked.add(p);
  const locations = c.locations.filter((l) => linked.has(l.id));
  const handouts = c.handouts.filter((h) => linked.has(h.id));
  const threatIds = new Set([
    ...beats.flatMap((b) => b.encounter.map((x) => x.threatId)),
    ...npcs.flatMap((n) => (n.statSource.kind === "bestiary" ? [n.statSource.threatId] : [])),
  ]);
  const audience = new Set(handouts.flatMap((h) => h.audience));
  const imageIds = new Set([...locations, ...npcs, ...handouts].map((r) => r.imageId));
  return {
    ...e,
    characters: e.characters.filter((ch) => audience.has(ch.id)),
    codex: {
      factions: c.factions.filter((f) => linked.has(f.id)),
      adventures,
      locations,
      npcs: npcs.map((n) => ({ ...n, followsId: null })),
      handouts,
      items: items.map((i) => ({ ...i, givenTo: null })),
      sessions: [],
      customThreats: c.customThreats.filter((t) => threatIds.has(t.id)),
    },
    images: e.images.filter((p) => p && imageIds.has(p.id)),
  };
}
