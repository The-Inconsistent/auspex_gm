import { z } from "zod";
import { CodexInput } from "./codex.ts";
import { CharacterStats, Tier } from "./state.ts";

// A content pack: a whole campaign start (framework, codex, adventure, characters) as data, loaded by
// `apps/api/scripts/seed.ts` through the normal action pipeline. Entries reference each other by `key`.

const key = z.string().regex(/^[a-z0-9-]+$/);
const keys = z.array(key).default([]);

export const Pack = z
  .object({
    campaign: z.object({
      name: z.string().min(1).max(100),
      tier: Tier,
      framework: z.string().max(5000).default(""),
      patron: z.string().max(200).default(""),
    }),
    factions: z.array(CodexInput.faction.extend({ key })).default([]),
    locations: z.array(CodexInput.location.omit({ parentId: true }).extend({ key, parent: key.optional() })).default([]),
    npcs: z.array(CodexInput.npc.omit({ factionId: true }).extend({ key, faction: key.optional() })).default([]),
    handouts: z.array(CodexInput.handout.extend({ key })).default([]),
    adventures: z
      .array(
        CodexInput.adventure.extend({
          key,
          beats: z.array(
            CodexInput.beat
              .omit({ adventureId: true, locationId: true, npcIds: true, handoutIds: true })
              .extend({ location: key.optional(), npcs: keys, handouts: keys }),
          ),
        }),
      )
      .default([]),
    characters: z.array(z.object({ name: z.string().min(1).max(100), stats: CharacterStats })).default([]),
  })
  .superRefine((p, ctx) => {
    const has = (list: { key: string }[]) => new Set(list.map((x) => x.key));
    const factions = has(p.factions), locations = has(p.locations), npcs = has(p.npcs), handouts = has(p.handouts);
    const check = (ok: boolean, path: (string | number)[], msg: string) => ok || ctx.addIssue({ code: "custom", path, message: msg });
    // Parents must come first so the seeder can resolve them in one pass.
    p.locations.forEach((l, i) =>
      check(!l.parent || p.locations.slice(0, i).some((x) => x.key === l.parent), ["locations", i, "parent"], `unknown or later location "${l.parent}"`));
    p.npcs.forEach((n, i) => check(!n.faction || factions.has(n.faction), ["npcs", i, "faction"], `unknown faction "${n.faction}"`));
    p.adventures.forEach((a, ai) =>
      a.beats.forEach((b, bi) => {
        const at = ["adventures", ai, "beats", bi];
        check(!b.location || locations.has(b.location), [...at, "location"], `unknown location "${b.location}"`);
        b.npcs.forEach((k) => check(npcs.has(k), [...at, "npcs"], `unknown npc "${k}"`));
        b.handouts.forEach((k) => check(handouts.has(k), [...at, "handouts"], `unknown handout "${k}"`));
      }));
  });
export type Pack = z.infer<typeof Pack>;
