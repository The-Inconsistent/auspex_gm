import { z } from "zod";
import { CharacterBuild } from "./build.ts";
import { CodexInput, IMAGE_CAP, ImageMime } from "./codex.ts";
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
    npcs: z.array(CodexInput.npc.extend({ id })).max(1000),
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
          startedAt: z.string().max(40),
          endedAt: z.string().max(40).nullable(),
          recap: z.string().max(10000),
          xp: count,
        }),
      )
      .max(1000),
    // Custom threats (issue #43). Keyed by `custom-<slug>`, not by a row id, so the importer doesn't remap them.
    // Defaulted, so a file written before they existed still imports.
    customThreats: z.array(CustomThreat).max(CUSTOM_THREAT_CAP).default([]),
  }),
  // The codex pictures (issue #199), so a file is a whole backup: NPCs, places and handouts name them by `imageId`, which
  // the importer remaps with the rest. Files from before pictures have none.
  images: z
    .array(z.object({ id, mime: ImageMime, base64: z.base64().max(1_400_000) })) // a 1 MB picture is about 1.34 MB of base64
    .max(IMAGE_CAP)
    .default([]),
});
export type CampaignExport = z.infer<typeof CampaignExport>;

// The same campaign for a new group: no sessions, empty pools, nothing revealed, every Agent rested, and no kind of game
// or limits, which the new table agrees for itself (Core p.316, rules-flow §11.79). Sheets, builds and XP stay, since a
// build's XP ledger is spent against `xp`. Given items stay given, because the sheets keep their gear.
export function freshStart(e: CampaignExport): CampaignExport {
  const { codex: c } = e;
  return {
    ...e,
    campaign: { ...e.campaign, glory: 0, ruin: 0, kind: [], limits: [] },
    characters: e.characters.map((ch) => ({
      ...ch,
      wounds: 0,
      shock: 0,
      wrath: 2, // p.162
      traumatic: 0,
      annihilated: false,
      conditions: [],
      objectives: ch.objectives.map((o) => ({ ...o, done: false })),
    })),
    codex: {
      ...c,
      adventures: c.adventures.map((a) => ({
        ...a,
        status: "planned",
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
