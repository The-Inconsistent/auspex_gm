import { z } from "zod";
import { CharacterBuild } from "./build.ts";
import { CodexInput, MAX_HAZARDS } from "./codex.ts";
import { MAX_HULK_ORIGINS, MAX_PLACES_PER_ADD } from "./places.ts";
import { Rarity, RequisitionKind } from "./requisition.ts";
import { CustomThreatData, MAX_SLUG } from "./threat.ts";
import { Profiles } from "./threat-scale.ts";
import { UpgradeHost } from "./wargear.ts";
import {
  CampaignSetup,
  CharacterDetail,
  CharacterStats,
  InviteMode,
  Marker,
  Objectives,
  Overrides,
  Pool,
  Tier,
  Visibility,
} from "./state.ts";

const id = z.uuid();
const rowId = z.string().regex(/^[a-z0-9-]+$/); // a row of the server's book data
// A custom threat's slug (issue #43): made server-side by `threatSlug`, and the client only ever echoes one back.
const slug = z
  .string()
  .min(1)
  .max(MAX_SLUG)
  .regex(/^[a-z0-9-]+$/);
const delta = z.number().int().min(-100).max(100);
const conditions = z.array(z.string().max(60)).max(30);
// A builder draft is a few KB; this is room for every choice twice over, and a cap on what a socket can store.
export const MAX_DRAFT_CHARS = 64_000;

const codexSave = (Object.keys(CodexInput) as (keyof typeof CodexInput)[]).map((kind) =>
  z.object({ type: z.literal("codex.save"), kind: z.literal(kind), id: id.optional(), data: CodexInput[kind] }),
);

// Fields a form checks before it sends (useFieldErrors in the web app), so the field shows why.
export const CharacterName = z.string().trim().min(1).max(100);
export const RequisitionItem = z.string().trim().min(1).max(100); // for ammo and grenades, the ammo type ("Bolt")

// Every mutation goes through one socket event: "action". Counters use deltas, so two taps never overwrite each other.
// The two ways a group Ascends (Core pp.147–148): the XP every character has earned, or the GM's Milestone.
export const AscensionKind = z.enum(["experience", "milestone"]);
export type AscensionKind = z.infer<typeof AscensionKind>;

export const Action = z.union([
  z.discriminatedUnion("type", [
    z.object({
      type: z.literal("campaign.update"),
      name: z.string().min(1).max(100).optional(),
      tier: Tier.optional(),
      ...CampaignSetup.partial().shape,
      homebrew: z.boolean().optional(), // the character builder may use Apocrypha and Necrontyr (issue #9 decision 1)
    }),
    z.object({ type: z.literal("pool.adjust"), pool: Pool, delta }),

    // Session start (p.162): Wrath 2 each, Glory 0, Ruin = players. End (p.321): XP to everyone.
    z.object({ type: z.literal("session.start") }),
    z.object({
      type: z.literal("session.end"),
      xp: z.number().int().min(0).max(100),
      recap: z.string().max(10000).default(""),
    }),
    // The group Ascends: the campaign's Tier goes up by one, for everyone at once (Core pp.147–148, §11.66).
    // `experience`: every character must have earned 100 XP in the current Tier. `milestone`: the GM's call, which
    // first gives every character 100 XP (Core p.148 step 1) and may waive the Ascension Package (step 2).
    z.object({
      type: z.literal("campaign.ascend"),
      kind: AscensionKind,
      waivePackage: z.boolean().default(false),
    }),

    z.object({
      type: z.literal("character.create"),
      name: CharacterName,
      stats: CharacterStats.optional(),
      detail: CharacterDetail.optional(),
      objectives: Objectives.optional(),
    }),
    z.object({
      type: z.literal("character.update"),
      id,
      name: z.string().min(1).max(100).optional(),
      stats: CharacterStats.optional(),
      overrides: Overrides.optional(),
      conditions: conditions.optional(),
      detail: CharacterDetail.optional(),
      annihilated: z.boolean().optional(), // GM only: undoes an Annihilation (p.194)
    }),
    // Wounds and Shock go through the damage rules (pcHit, pp.193-199). raw (GM only, the tracker's undo) skips them.
    z.object({
      type: z.literal("character.adjust"),
      id,
      wounds: delta.optional(),
      shock: delta.optional(),
      wrath: delta.optional(),
      traumatic: delta.optional(),
      raw: z.boolean().optional(),
    }),
    // Wealth (p.206) and Ammo by type (p.229); players spend their own (negative deltas only), the GM awards (§11.57).
    z.object({
      type: z.literal("character.supply"),
      id,
      wealth: delta.optional(),
      ammo: z.object({ kind: z.string().trim().min(1).max(60), delta }).optional(),
    }),
    // GM only: a codex item handed to an Agent, which uses their Wargear Test for the session (rules-flow.md §11.112),
    // and taken back again (§11.114). The server builds the sheet line from the item.
    z.object({ type: z.literal("character.giveItem"), id, itemId: id }),
    z.object({ type: z.literal("character.takeItem"), id, itemId: id }),
    // GM only: a requisition Influence Test rolled at the table (pp.205–206, p.229). The server checks the Keywords and
    // the session limit, spends the Wealth and, on a success, adds the item to gear or ammo.
    z.object({
      type: z.literal("character.requisition"),
      id,
      kind: RequisitionKind,
      item: RequisitionItem,
      value: z.number().int().min(0).max(20),
      rarity: Rarity,
      keywords: z.array(z.string().trim().min(1).max(60)).max(12), // the item's
      icons: z.number().int().min(0).max(60),
      spend: z.number().int().min(0).max(50).default(0),
      complication: z.boolean().default(false),
      loadedWith: z.string().trim().min(1).max(60).optional(), // a ranged weapon arrives loaded, plus 1 Ammo (p.205)
      wargearId: z.string().max(100).optional(), // a catalogue entry: its weapon profile joins the sheet
      // An upgrade goes straight onto this weapon of the character's on a success, instead of waiting in gear
      // (Core p.227, §11.63). The fit is checked before the Test is recorded, so a bad target costs no Test.
      fitTo: z.string().trim().min(1).max(100).optional(),
    }),
    // Fit a catalogue upgrade to one of the character's weapons or to the armour they wear, or take it off again
    // (Core p.227, §11.63–§11.65). The server checks the fit, the maximum of three and the one-per-slot rule, and moves
    // the upgrade off the gear line it was requisitioned onto. `host` defaults to "weapon", so a client that knows only
    // weapons is unchanged; `weapon` is the weapon's name on the sheet, which is unique there, and the armour host needs
    // no name, because a character wears one suit (Core p.231).
    z
      .object({
        type: z.literal("character.fitUpgrade"),
        id,
        host: UpgradeHost.prefault("weapon"),
        weapon: z.string().trim().min(1).max(100).optional(),
        upgradeId: z.string().min(1).max(100),
      })
      .refine((a) => a.host === "armour" || a.weapon !== undefined, "Name the weapon to fit the upgrade to"),
    z
      .object({
        type: z.literal("character.removeUpgrade"),
        id,
        host: UpgradeHost.prefault("weapon"),
        weapon: z.string().trim().min(1).max(100).optional(),
        upgradeId: z.string().min(1).max(100),
      })
      .refine((a) => a.host === "armour" || a.weapon !== undefined, "Name the weapon to take the upgrade off"),
    // GM only: replaces the Agent's private objectives (only its player sees them).
    z.object({ type: z.literal("character.objectives"), characterId: id, objectives: Objectives }),
    z.object({ type: z.literal("character.respite"), id }), // p.197: Wounds 0, Shock 0, Wrath 2; not while Dying
    z.object({ type: z.literal("character.delete"), id }),
    // Save a character from its creation choices (build.ts). The server re-runs resolveBuild, refuses a build that
    // isn't ready, and writes the sheet it derives. No id: a new character (GM only).
    z.object({
      type: z.literal("character.build"),
      id: id.optional(),
      name: z.string().min(1).max(100).optional(),
      detail: CharacterDetail.optional(),
      build: CharacterBuild,
      // GM only: a first build over a hand-made sheet keeps its armour and gear lines and its Wealth (a campaign's hand-made
      // pregens, issue #18). Its weapons are the build's, with their Talents applied on read (rules-flow.md §11.68,
      // issue #27). One action, so the swap can't half-happen.
      keepSheet: z.boolean().optional(),
    }),
    // A builder draft kept on the server, so the GM can open a player's half-made character, tick what only the GM
    // judges and save it. Any shape the builder writes (it may lack an archetype yet); null clears it.
    z.object({
      type: z.literal("character.draft"),
      id,
      draft: z
        .record(z.string(), z.unknown())
        .refine((d) => JSON.stringify(d).length <= MAX_DRAFT_CHARS, "The draft is too large")
        .nullable(),
    }),

    z.object({ type: z.literal("token.issue"), characterId: id }),
    z.object({ type: z.literal("token.revoke"), characterId: id }),
    // The table screen: a read-only guest seat for a TV. The token comes back once, in `token`; revoking drops them all.
    z.object({ type: z.literal("screen.issue") }),
    z.object({ type: z.literal("screen.revoke") }),

    // Invite links for signed-in players (and guests, if allowed). The code comes back once, in `token`.
    z.object({
      type: z.literal("invite.create"),
      mode: InviteMode,
      characterId: id.optional(),
      allowGuests: z.boolean().default(true),
      hours: z.number().int().min(1).max(720).default(12),
    }),
    z.object({ type: z.literal("invite.revoke"), id }),
    z.object({ type: z.literal("member.remove"), userId: z.string().min(1).max(100) }),
    // A player gives up their seat: the Agent goes back to reserve and the room QR offers it again.
    z.object({ type: z.literal("seat.leave") }),

    // Custom threats (issue #43): a stat block the GM wrote or cloned, kept with this campaign. `id`, `source` and
    // `page` are the server's to set, so they aren't sent; a `slug` edits that row, and without one the server makes a
    // slug from the name.
    z.object({
      type: z.literal("threat.save"),
      slug: slug.optional(),
      data: CustomThreatData,
    }),
    z.object({ type: z.literal("threat.delete"), slug }),

    z.object({ type: z.literal("encounter.start") }),
    z.object({ type: z.literal("encounter.end") }),
    z.object({ type: z.literal("encounter.newRound") }),

    // Turns (p.177): the GM starts whoever the table picks on the side that's up; Seize costs 1 Glory/Ruin.
    z.object({ type: z.literal("turn.start"), id }),
    z.object({ type: z.literal("turn.seize"), id }),
    z.object({ type: z.literal("turn.end") }),

    z.object({
      type: z.literal("combatant.addThreat"),
      threatId: z.string(),
      label: z.string().max(100).optional(),
      mobCount: z.number().int().min(2).max(500).optional(),
      marker: Marker.optional(),
      visibility: Visibility.optional(), // "hidden" adds it without a flash on the phones (rules-flow §11.56)
      // As on a prepared entry: profiles (VoA p.126) and scaling (Core p.326) are applied before the snapshot.
      profiles: Profiles,
      scale: z.boolean().default(false),
    }),
    z.object({ type: z.literal("combatant.addCharacter"), characterId: id }),
    z.object({
      type: z.literal("combatant.update"),
      id,
      label: z.string().min(1).max(100).optional(),
      mobCount: z.number().int().min(0).max(500).nullable().optional(),
      conditions: conditions.optional(),
      visibility: Visibility.optional(),
      marker: Marker.nullable().optional(),
      ambushed: z.boolean().optional(),
    }),
    // Same damage rules for Threats (Mob members p.325, Exhausted p.199); raw (the tracker's undo) skips them.
    z.object({
      type: z.literal("combatant.adjust"),
      id,
      wounds: delta.optional(),
      shock: delta.optional(),
      personalRuin: delta.optional(),
      raw: z.boolean().optional(),
    }),
    z.object({ type: z.literal("combatant.aware"), id }), // pay 1 Glory/Ruin to ignore an ambush (p.177)
    z.object({ type: z.literal("combatant.remove"), id }),

    z.object({
      type: z.literal("codex.delete"),
      kind: z.enum(Object.keys(CodexInput) as [keyof typeof CodexInput]),
      id,
    }),
    z.object({ type: z.literal("beat.reorder"), adventureId: id, ids: z.array(id).max(200) }),
    // Copies a book's place and every place inside it (issue #50); the server reads the text from its own data.
    z.object({
      type: z.literal("codex.addPlaces"),
      placeId: rowId,
      parentId: id.nullable().default(null),
    }),
    // The Space Hulk Generator (issue #50 step 8): a hulk and its rooms, or rooms inside a place already in the codex
    // (§11.102), from the row ids the GM rolled or picked; the server reads the text from its own data.
    z.object({
      type: z.literal("codex.addHulk"),
      parentId: id.nullable().default(null),
      hulk: z
        .object({
          name: CodexInput.location.shape.name,
          origins: z.array(rowId).min(1).max(MAX_HULK_ORIGINS),
          occupants: rowId,
          objective: rowId,
          hazards: z.array(rowId).max(MAX_HAZARDS).default([]), // rows of the d6 Hazards Table (RR1 p.11), for its list
        })
        .nullable(),
      rooms: z.array(rowId).max(MAX_PLACES_PER_ADD - 1),
    }),
    // FROM LOOT TABLE (issue #51): codex items made from one book row. The client sends ids and the GM's choices (one
    // catalogue entry per `pick` item, in order; the roll that landed, for the note; a fault) and the server reads the
    // text from its own data.
    z.object({
      type: z.literal("codex.addLoot"),
      rowId,
      picks: z.array(rowId).max(10).default([]),
      roll: z.number().int().min(1).max(66).optional(),
      faultId: rowId.optional(),
    }),
    // The Holy Relic creator (RR2 pp.12–19, issue #51 step 8): one item from the rows the GM rolled or picked and the
    // catalogue entry its Form became. The server reads the text from its own data.
    z.object({
      type: z.literal("codex.addRelic"),
      name: z.string().trim().min(1).max(200).optional(), // else "Relic <entry>"
      form: rowId,
      wargearId: rowId,
      owner: rowId,
      anointment: rowId,
      power: rowId,
      oddity: rowId,
      enemy: rowId.optional(), // when the Power names an enemy
    }),
    z.object({ type: z.literal("beat.startEncounter"), id }),
  ]),
  ...codexSave,
]);
export type Action = z.infer<typeof Action>;
export type ActionInput = z.input<typeof Action>; // what clients send: defaulted fields optional

// Actions a player may send, each limited to their own character. Harm, Wrath, Glory, Respite, Conditions and
// granting Wealth or Ammo are the GM's (authorize() in table.dispatch.ts).
export const PLAYER_ACTIONS: ReadonlySet<Action["type"]> = new Set([
  "character.update",
  "character.build",
  "character.draft",
  "character.supply",
  // Fitting an upgrade is instant and takes no Test (§11.63), and the upgrade is already the character's, so a player
  // does it on their own weapons.
  "character.fitUpgrade",
  "character.removeUpgrade",
  "seat.leave",
]);

// `notices`: lines for the GM who sent the action, about what it changed. They exist because no snapshot can carry
// them — they compare before with after (who crossed a Rank boundary on session.end, Core p.146) — and they are
// one-off, like the vox log at the table, not state to render later.
// `slug`: the slug `threat.save` created or kept, so the editor knows which custom threat it is now editing (issue #43).
export type ActionResult =
  { ok: true; id?: string; token?: string; slug?: string; notices?: string[] } | { ok: false; error: string };
