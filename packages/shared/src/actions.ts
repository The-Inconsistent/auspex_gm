import { z } from "zod";
import { CharacterBuild } from "./build.ts";
import { CodexInput } from "./codex.ts";
import { Rarity, RequisitionKind } from "./requisition.ts";
import { CharacterStats, InviteMode, Marker, Overrides, Pool, Tier, Visibility } from "./state.ts";

const id = z.uuid();
const delta = z.number().int().min(-100).max(100);
const conditions = z.array(z.string().max(60)).max(30);
// A builder draft is a few KB; this is room for every choice twice over, and a cap on what a socket can store.
export const MAX_DRAFT_CHARS = 64_000;

const codexSave = (Object.keys(CodexInput) as (keyof typeof CodexInput)[]).map((kind) =>
  z.object({ type: z.literal("codex.save"), kind: z.literal(kind), id: id.optional(), data: CodexInput[kind] }),
);

// Every mutation goes through one socket event: "action". Counters use deltas, so two taps never overwrite each other.
export const Action = z.union([
  z.discriminatedUnion("type", [
    z.object({
      type: z.literal("campaign.update"),
      name: z.string().min(1).max(100).optional(),
      tier: Tier.optional(),
      framework: z.string().max(5000).optional(),
      patron: z.string().max(200).optional(),
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

    z.object({
      type: z.literal("character.create"),
      name: z.string().min(1).max(100),
      stats: CharacterStats.optional(),
    }),
    z.object({
      type: z.literal("character.update"),
      id,
      name: z.string().min(1).max(100).optional(),
      stats: CharacterStats.optional(),
      overrides: Overrides.optional(),
      conditions: conditions.optional(),
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
    // Wealth (p.206) and Ammo by type (p.229); players spend their own, the GM awards.
    z.object({
      type: z.literal("character.supply"),
      id,
      wealth: delta.optional(),
      ammo: z.object({ kind: z.string().trim().min(1).max(60), delta }).optional(),
    }),
    // GM only: a requisition Influence Test rolled at the table (pp.205–206, p.229). The server checks the Keywords and
    // the session limit, spends the Wealth and, on a success, adds the item to gear or ammo.
    z.object({
      type: z.literal("character.requisition"),
      id,
      kind: RequisitionKind,
      item: z.string().trim().min(1).max(100), // for ammo and grenades, the ammo type ("Bolt", "Frag Grenade")
      value: z.number().int().min(0).max(20),
      rarity: Rarity,
      keywords: z.array(z.string().trim().min(1).max(60)).max(12), // the item's
      icons: z.number().int().min(0).max(60),
      spend: z.number().int().min(0).max(50).default(0),
      complication: z.boolean().default(false),
      loadedWith: z.string().trim().min(1).max(60).optional(), // a ranged weapon arrives loaded, plus 1 Ammo (p.205)
      wargearId: z.string().max(100).optional(), // a catalogue entry: its weapon profile joins the sheet
    }),
    z.object({ type: z.literal("character.respite"), id }), // p.197: Wounds 0, Shock 0, Wrath 2; not while Dying
    z.object({ type: z.literal("character.delete"), id }),
    // Save a character from its creation choices (build.ts). The server re-runs resolveBuild, refuses a build that
    // isn't ready, and writes the sheet it derives. No id: a new character (GM only).
    z.object({
      type: z.literal("character.build"),
      id: id.optional(),
      name: z.string().min(1).max(100).optional(),
      build: CharacterBuild,
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
    z.object({ type: z.literal("beat.startEncounter"), id }),
  ]),
  ...codexSave,
]);
export type Action = z.infer<typeof Action>;
export type ActionInput = z.input<typeof Action>; // what clients send: defaulted fields optional

// Actions a player may send, each limited to their own character. Harm, Wrath, Glory and Respite are the GM's.
export const PLAYER_ACTIONS: ReadonlySet<Action["type"]> = new Set([
  "character.update",
  "character.build",
  "character.draft",
  "character.supply",
]);

export type ActionResult = { ok: true; id?: string; token?: string } | { ok: false; error: string };
