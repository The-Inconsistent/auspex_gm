import { z } from "zod";
import { CodexInput } from "./codex.ts";
import { CharacterStats, Marker, Overrides, Tier } from "./state.ts";

const id = z.uuid();
const delta = z.number().int().min(-100).max(100);
const conditions = z.array(z.string().max(60)).max(30);

const codexSave = (Object.keys(CodexInput) as (keyof typeof CodexInput)[]).map((kind) =>
  z.object({ type: z.literal("codex.save"), kind: z.literal(kind), id: id.optional(), data: CodexInput[kind] }),
);

// Every mutation goes through one socket event: "action". Counters use deltas, so two taps never overwrite each other.
export const Action = z.union([
  z.discriminatedUnion("type", [
    z.object({
      type: z.literal("campaign.update"), name: z.string().min(1).max(100).optional(), tier: Tier.optional(),
      framework: z.string().max(5000).optional(), patron: z.string().max(200).optional(),
    }),
    z.object({ type: z.literal("pool.adjust"), pool: z.enum(["glory", "ruin"]), delta }),

    // Session start (p.162): Wrath 2 each, Glory 0, Ruin = players. End (p.321): XP to everyone.
    z.object({ type: z.literal("session.start") }),
    z.object({ type: z.literal("session.end"), xp: z.number().int().min(0).max(100), recap: z.string().max(10000).default("") }),

    z.object({ type: z.literal("character.create"), name: z.string().min(1).max(100), stats: CharacterStats.optional() }),
    z.object({
      type: z.literal("character.update"),
      id,
      name: z.string().min(1).max(100).optional(),
      stats: CharacterStats.optional(),
      overrides: Overrides.optional(),
      conditions: conditions.optional(),
    }),
    z.object({
      type: z.literal("character.adjust"), id,
      wounds: delta.optional(), shock: delta.optional(), wrath: delta.optional(), traumatic: delta.optional(),
    }),
    z.object({ type: z.literal("character.respite"), id }), // p.197: Wounds 0, Shock 0, Wrath 2; not while Dying
    z.object({ type: z.literal("character.delete"), id }),

    z.object({ type: z.literal("token.issue"), characterId: id }),
    z.object({ type: z.literal("token.revoke"), characterId: id }),

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
    }),
    z.object({ type: z.literal("combatant.addCharacter"), characterId: id }),
    z.object({
      type: z.literal("combatant.update"),
      id,
      label: z.string().min(1).max(100).optional(),
      mobCount: z.number().int().min(0).max(500).nullable().optional(),
      conditions: conditions.optional(),
      revealed: z.boolean().optional(),
      marker: Marker.nullable().optional(),
      ambushed: z.boolean().optional(),
    }),
    z.object({
      type: z.literal("combatant.adjust"), id,
      wounds: delta.optional(), shock: delta.optional(), personalRuin: delta.optional(),
    }),
    z.object({ type: z.literal("combatant.aware"), id }), // pay 1 Glory/Ruin to ignore an ambush (p.177)
    z.object({ type: z.literal("combatant.remove"), id }),

    z.object({ type: z.literal("codex.delete"), kind: z.enum(Object.keys(CodexInput) as [keyof typeof CodexInput]), id }),
    z.object({ type: z.literal("beat.reorder"), adventureId: id, ids: z.array(id).max(200) }),
    z.object({ type: z.literal("beat.startEncounter"), id }),
  ]),
  ...codexSave,
]);
export type Action = z.infer<typeof Action>;
export type ActionInput = z.input<typeof Action>; // what clients send: defaulted fields optional

// Actions a player may send; each is further limited to their own character, or the Glory pool.
export const PLAYER_ACTIONS: ReadonlySet<Action["type"]> = new Set([
  "character.update", "character.adjust", "character.respite", "pool.adjust",
]);

export type ActionResult = { ok: true; id?: string; token?: string } | { ok: false; error: string };
